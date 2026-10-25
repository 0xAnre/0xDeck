import {
  runFixedRangeVolumeProfileDataPipeline,
  type FixedRangeVolumeProfilePipelineResult,
} from './fixedRangeVolumeProfileDataPipeline.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import {
  buildFixedRangeVolumeProfileRequestIdentityKey,
  buildFixedRangeVolumeProfileRequestKey,
} from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import type {
  FixedRangeVolumeProfileRuntimeSnapshot,
  FixedRangeVolumeProfileRuntimeState,
} from './fixedRangeVolumeProfileRuntimeTypes.ts'
import type { MarketExchange } from './types.ts'

export type RunFixedRangeVolumeProfilePipeline = (
  instance: FixedRangeVolumeProfileInstance,
  options: { signal?: AbortSignal; liveRightEdge?: number | null },
) => Promise<FixedRangeVolumeProfilePipelineResult>

export type FixedRangeVolumeProfileRuntimeControllerOptions = {
  onChange: () => void
  exchange?: MarketExchange
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
  private readonly _exchange: MarketExchange
  private readonly _states = new Map<string, FixedRangeVolumeProfileRuntimeState>()
  private readonly _abortControllers = new Map<string, AbortController>()
  private readonly _requestTokens = new Map<string, number>()
  // Request identity per instance (selection identity + effective right edge
  // for Extend Right). Kept separate from the stored render identity so a live
  // candle advancing only schedules a background refetch instead of blanking
  // the currently rendered profile.
  private readonly _requestKeys = new Map<string, string>()
  // Monotonic request generation source for the whole controller. It is only
  // ever incremented, so a generation can never be reused for the same
  // instance id — even across disable -> re-enable or remove -> re-add.
  private _requestSequence = 0
  private _instances: readonly FixedRangeVolumeProfileInstance[] = []
  private _disposed = false

  constructor(options: FixedRangeVolumeProfileRuntimeControllerOptions) {
    this._onChange = options.onChange
    this._exchange = options.exchange ?? 'binance'
    this._runPipeline =
      options.runPipeline ??
      ((instance, opts) =>
        runFixedRangeVolumeProfileDataPipeline(instance, {
          ...opts,
          exchange: this._exchange,
        }))
  }

  getSnapshot(): FixedRangeVolumeProfileRuntimeSnapshot {
    const snapshot: FixedRangeVolumeProfileRuntimeSnapshot = {}
    for (const [id, state] of this._states.entries()) {
      snapshot[id] = state
    }
    return snapshot
  }

  syncInstances(
    instances: readonly FixedRangeVolumeProfileInstance[],
    liveRightEdge: number | null = null,
  ): void {
    if (this._disposed) return
    this._instances = instances

    const activeIds = new Set(instances.map((item) => item.id))
    for (const id of [...this._abortControllers.keys()]) {
      if (!activeIds.has(id)) this.removeInstance(id)
    }
    for (const id of [...this._states.keys()]) {
      if (!activeIds.has(id)) this._states.delete(id)
    }
    for (const id of [...this._requestKeys.keys()]) {
      if (!activeIds.has(id)) this._requestKeys.delete(id)
    }

    for (const instance of instances) {
      if (!instance.enabled) {
        this.removeInstance(instance.id)
        continue
      }

      const identityKey = buildFixedRangeVolumeProfileRequestIdentityKey(instance)
      const requestKey = buildFixedRangeVolumeProfileRequestKey(instance, liveRightEdge)
      const current = this._states.get(instance.id)
      if (
        this._requestKeys.get(instance.id) === requestKey &&
        (current?.status === 'ready' || current?.status === 'loading')
      ) {
        continue
      }

      this.startFetch(instance, identityKey, requestKey, liveRightEdge)
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
    this._requestKeys.delete(instanceId)
  }

  private abortActiveRequest(instanceId: string): void {
    const controller = this._abortControllers.get(instanceId)
    if (controller) {
      controller.abort()
      this._abortControllers.delete(instanceId)
    }
  }

  private startFetch(
    instance: FixedRangeVolumeProfileInstance,
    identityKey: string,
    requestKey: string,
    liveRightEdge: number | null,
  ): void {
    this.abortActiveRequest(instance.id)
    const token = ++this._requestSequence
    this._requestTokens.set(instance.id, token)
    this._requestKeys.set(instance.id, requestKey)

    const previous = this._states.get(instance.id)
    const preserveReadyProfile =
      previous?.status === 'ready' && previous.identityKey === identityKey
    if (!preserveReadyProfile) {
      this._states.set(instance.id, {
        status: 'loading',
        instanceId: instance.id,
        identityKey,
      })
      this._onChange()
    }

    const abortController = new AbortController()
    this._abortControllers.set(instance.id, abortController)

    void this._runPipeline(instance, { signal: abortController.signal, liveRightEdge })
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
        if (this._requestTokens.get(instance.id) !== token) return
        if (abortController.signal.aborted || isAbortError(error)) return
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
