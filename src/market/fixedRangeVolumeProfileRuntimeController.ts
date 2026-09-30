import {
  runFixedRangeVolumeProfileDataPipeline,
  type FixedRangeVolumeProfilePipelineResult,
} from './fixedRangeVolumeProfileDataPipeline.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { buildFixedRangeVolumeProfileRequestIdentityKey } from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import type {
  FixedRangeVolumeProfileRuntimeSnapshot,
  FixedRangeVolumeProfileRuntimeState,
} from './fixedRangeVolumeProfileRuntimeTypes.ts'

export type RunFixedRangeVolumeProfilePipeline = (
  instance: FixedRangeVolumeProfileInstance,
  options: { signal?: AbortSignal },
) => Promise<FixedRangeVolumeProfilePipelineResult>

export type FixedRangeVolumeProfileRuntimeControllerOptions = {
  onChange: () => void
  runPipeline?: RunFixedRangeVolumeProfilePipeline
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { name?: string }
  return record.name === 'AbortError'
}

export class FixedRangeVolumeProfileRuntimeController {
  private readonly _onChange: () => void
  private readonly _runPipeline: RunFixedRangeVolumeProfilePipeline
  private readonly _states = new Map<string, FixedRangeVolumeProfileRuntimeState>()
  private readonly _abortControllers = new Map<string, AbortController>()
  private readonly _requestTokens = new Map<string, number>()
  private _instances: readonly FixedRangeVolumeProfileInstance[] = []
  private _disposed = false

  constructor(options: FixedRangeVolumeProfileRuntimeControllerOptions) {
    this._onChange = options.onChange
    this._runPipeline = options.runPipeline ?? ((instance, opts) =>
      runFixedRangeVolumeProfileDataPipeline(instance, opts))
  }

  getSnapshot(): FixedRangeVolumeProfileRuntimeSnapshot {
    const snapshot: FixedRangeVolumeProfileRuntimeSnapshot = {}
    for (const [id, state] of this._states.entries()) {
      snapshot[id] = state
    }
    return snapshot
  }

  syncInstances(instances: readonly FixedRangeVolumeProfileInstance[]): void {
    if (this._disposed) return
    this._instances = instances

    const activeIds = new Set(instances.map((item) => item.id))
    for (const id of [...this._abortControllers.keys()]) {
      if (!activeIds.has(id)) this.removeInstance(id)
    }
    for (const id of [...this._states.keys()]) {
      if (!activeIds.has(id)) this._states.delete(id)
    }

    for (const instance of instances) {
      if (!instance.enabled) {
        this.removeInstance(instance.id)
        continue
      }

      const identityKey = buildFixedRangeVolumeProfileRequestIdentityKey(instance)
      const current = this._states.get(instance.id)
      if (current?.identityKey === identityKey) {
        if (current.status === 'ready' || current.status === 'loading') continue
      }

      this.startFetch(instance, identityKey)
    }

    this._onChange()
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    for (const id of [...this._abortControllers.keys()]) {
      this.abortActiveRequest(id)
    }
    this._states.clear()
    this._instances = []
    this._onChange()
  }

  private removeInstance(instanceId: string): void {
    this.abortActiveRequest(instanceId)
    this._states.delete(instanceId)
    this._requestTokens.delete(instanceId)
  }

  private abortActiveRequest(instanceId: string): void {
    const controller = this._abortControllers.get(instanceId)
    if (controller) {
      controller.abort()
      this._abortControllers.delete(instanceId)
    }
  }

  private startFetch(instance: FixedRangeVolumeProfileInstance, identityKey: string): void {
    this.abortActiveRequest(instance.id)
    const token = (this._requestTokens.get(instance.id) ?? 0) + 1
    this._requestTokens.set(instance.id, token)

    this._states.set(instance.id, {
      status: 'loading',
      instanceId: instance.id,
      identityKey,
    })
    this._onChange()

    const abortController = new AbortController()
    this._abortControllers.set(instance.id, abortController)

    void this._runPipeline(instance, { signal: abortController.signal })
      .then((pipeline) => {
        if (this._disposed) return
        if (this._requestTokens.get(instance.id) !== token) return
        const latest = this._instances.find((item) => item.id === instance.id)
        if (!latest || !latest.enabled) return
        if (buildFixedRangeVolumeProfileRequestIdentityKey(latest) !== identityKey) return

        this._abortControllers.delete(instance.id)
        this._states.set(instance.id, {
          status: 'ready',
          instanceId: instance.id,
          identityKey,
          requestStartTime: pipeline.requestStartTime,
          requestEndTime: pipeline.requestEndTime,
          sourceInterval: pipeline.sourceInterval,
          profile: pipeline.profile,
          pipeline,
        })
        this._onChange()
      })
      .catch((error: unknown) => {
        if (this._disposed) return
        if (abortController.signal.aborted || isAbortError(error)) return
        if (this._requestTokens.get(instance.id) !== token) return
        const latest = this._instances.find((item) => item.id === instance.id)
        if (!latest || !latest.enabled) return
        if (buildFixedRangeVolumeProfileRequestIdentityKey(latest) !== identityKey) return

        this._abortControllers.delete(instance.id)
        const message =
          error instanceof Error ? error.message : 'Fixed Range Volume Profile request failed'
        this._states.set(instance.id, {
          status: 'error',
          instanceId: instance.id,
          identityKey,
          message,
        })
        this._onChange()
      })
  }
}
