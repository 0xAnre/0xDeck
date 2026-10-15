import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FixedRangeVolumeProfileRuntimeController } from './fixedRangeVolumeProfileRuntimeController.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfilePipelineResult } from './fixedRangeVolumeProfileDataPipeline.ts'

function instance(overrides: Partial<FixedRangeVolumeProfileInstance> = {}): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-1',
    fromTime: 100,
    toTime: 200,
    selectionInterval: '1m',
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
    ...overrides,
  }
}

function emptyProfile() {
  return {
    fromTime: 100,
    toTime: 199,
    candleCount: 0,
    profileLow: 0,
    profileHigh: 0,
    rowHeight: 0,
    rows: [],
    totalVolume: 0,
    pocRowIndex: null,
    pocPrice: null,
    pocVolume: null,
    vah: null,
    val: null,
    valueAreaVolume: 0,
    valueAreaPercentAchieved: 0,
  }
}

function pipelineResult(id: string): FixedRangeVolumeProfilePipelineResult {
  return {
    instanceId: id,
    requestStartTime: 100,
    requestEndTime: 260,
    sourceInterval: '1m',
    profile: emptyProfile(),
  }
}

// Distinguishable pipelines: `totalVolume` identifies which response produced
// the result, so a stale response overwriting a newer one is observable.
function pipelineResultWithTotalVolume(
  id: string,
  totalVolume: number,
): FixedRangeVolumeProfilePipelineResult {
  return {
    ...pipelineResult(id),
    profile: { ...emptyProfile(), totalVolume },
  }
}

type DeferredPipelineResult = {
  promise: Promise<FixedRangeVolumeProfilePipelineResult>
  resolve: (result: FixedRangeVolumeProfilePipelineResult) => void
}

// A request the test resolves manually. The controller cannot observe the
// pipeline's abort because the fake pipeline never listens to the signal.
function createDeferredPipelineResult(): DeferredPipelineResult {
  let resolve!: (result: FixedRangeVolumeProfilePipelineResult) => void
  const promise = new Promise<FixedRangeVolumeProfilePipelineResult>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('fixedRangeVolumeProfileRuntimeController', () => {
  it('starts a request for a new enabled instance', async () => {
    let calls = 0
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async () => {
        calls += 1
        return pipelineResult('frvp-1')
      },
    })
    controller.syncInstances([instance()])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(calls, 1)
    assert.equal(controller.getSnapshot()['frvp-1']?.status, 'ready')
    controller.dispose()
  })

  it('does not duplicate fetch for the same request identity', async () => {
    let calls = 0
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async () => {
        calls += 1
        return pipelineResult('frvp-1')
      },
    })
    const items = [instance()]
    controller.syncInstances(items)
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.syncInstances(items)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(calls, 1)
    controller.dispose()
  })

  it('fetches two instances independently', async () => {
    const fetched: string[] = []
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async (item) => {
        fetched.push(item.id)
        return pipelineResult(item.id)
      },
    })
    controller.syncInstances([instance({ id: 'frvp-a' }), instance({ id: 'frvp-b', fromTime: 300, toTime: 400 })])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(fetched.sort(), ['frvp-a', 'frvp-b'])
    controller.dispose()
  })

  it('aborts removed instance requests', async () => {
    let aborted = false
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async (_item, options) => {
        options.signal?.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise((resolve) => setTimeout(resolve, 20))
        return pipelineResult('frvp-1')
      },
    })
    controller.syncInstances([instance()])
    controller.syncInstances([])
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(aborted, true)
    assert.equal(controller.getSnapshot()['frvp-1'], undefined)
    controller.dispose()
  })

  it('does not apply stale responses after identity changes', async () => {
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async (item) => {
        await new Promise((resolve) => setTimeout(resolve, item.rowCount === 24 ? 20 : 0))
        return pipelineResultWithTotalVolume(item.id, item.rowCount)
      },
    })
    controller.syncInstances([instance({ rowCount: 24 })])
    controller.syncInstances([instance({ rowCount: 48 })])
    await new Promise((resolve) => setTimeout(resolve, 40))
    const state = controller.getSnapshot()['frvp-1']
    assert.equal(state?.status, 'ready')
    if (state?.status === 'ready') {
      // The slower first request (rowCount 24) must not overwrite the newer
      // rowCount 48 response.
      assert.equal(state.pipeline.profile.totalVolume, 48)
    }
    controller.dispose()
  })

  it('does not apply a stale response that resolves after disable and re-enable', async () => {
    const deferred: DeferredPipelineResult[] = []
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      // Ignores the abort signal on purpose: the test resolves this request
      // manually after a newer generation has already started.
      runPipeline: () => {
        const pending = createDeferredPipelineResult()
        deferred.push(pending)
        return pending.promise
      },
    })

    controller.syncInstances([instance()])
    controller.syncInstances([instance({ enabled: false })])
    controller.syncInstances([instance()])

    assert.equal(deferred.length, 2)

    deferred[1].resolve(pipelineResultWithTotalVolume('frvp-1', 2))
    await new Promise((resolve) => setTimeout(resolve, 0))

    deferred[0].resolve(pipelineResultWithTotalVolume('frvp-1', 1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const state = controller.getSnapshot()['frvp-1']
    assert.equal(state?.status, 'ready')
    if (state?.status === 'ready') {
      assert.equal(state.pipeline.profile.totalVolume, 2)
    }
    controller.dispose()
  })

  it('does not apply a stale response that resolves after remove and re-add', async () => {
    const deferred: DeferredPipelineResult[] = []
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: () => {
        const pending = createDeferredPipelineResult()
        deferred.push(pending)
        return pending.promise
      },
    })

    controller.syncInstances([instance()])
    controller.syncInstances([])
    controller.syncInstances([instance()])

    assert.equal(deferred.length, 2)

    deferred[1].resolve(pipelineResultWithTotalVolume('frvp-1', 2))
    await new Promise((resolve) => setTimeout(resolve, 0))

    deferred[0].resolve(pipelineResultWithTotalVolume('frvp-1', 1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const state = controller.getSnapshot()['frvp-1']
    assert.equal(state?.status, 'ready')
    if (state?.status === 'ready') {
      assert.equal(state.pipeline.profile.totalVolume, 2)
    }
    controller.dispose()
  })

  it('advances the live right edge with exactly one background refetch and keeps the last profile', async () => {
    const calls: Array<{ id: string; liveRightEdge: number | null }> = []
    const deferred: DeferredPipelineResult[] = []
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: (item, options) => {
        calls.push({ id: item.id, liveRightEdge: options.liveRightEdge ?? null })
        const pending = createDeferredPipelineResult()
        deferred.push(pending)
        return pending.promise
      },
    })
    const extended = () => instance({ extendRight: true })

    controller.syncInstances([extended()], 1_000)
    assert.equal(calls.length, 1)
    deferred[0].resolve(pipelineResultWithTotalVolume('frvp-1', 1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Same live edge -> no duplicate request.
    controller.syncInstances([extended()], 1_000)
    assert.equal(calls.length, 1)

    // Advanced live edge -> exactly one new request, previous profile kept.
    controller.syncInstances([extended()], 1_060)
    assert.equal(calls.length, 2)
    assert.equal(calls[1].liveRightEdge, 1_060)
    const inFlight = controller.getSnapshot()['frvp-1']
    assert.equal(inFlight?.status, 'ready')
    if (inFlight?.status === 'ready') {
      assert.equal(inFlight.pipeline.profile.totalVolume, 1)
    }

    deferred[1].resolve(pipelineResultWithTotalVolume('frvp-1', 2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const settled = controller.getSnapshot()['frvp-1']
    assert.equal(settled?.status, 'ready')
    if (settled?.status === 'ready') {
      assert.equal(settled.pipeline.profile.totalVolume, 2)
    }
    controller.dispose()
  })

  it('discards a stale live-edge response that resolves after a newer one', async () => {
    const deferred: DeferredPipelineResult[] = []
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: () => {
        const pending = createDeferredPipelineResult()
        deferred.push(pending)
        return pending.promise
      },
    })
    const extended = () => instance({ extendRight: true })

    controller.syncInstances([extended()], 1_000)
    controller.syncInstances([extended()], 1_060)
    assert.equal(deferred.length, 2)

    deferred[1].resolve(pipelineResultWithTotalVolume('frvp-1', 2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    deferred[0].resolve(pipelineResultWithTotalVolume('frvp-1', 1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const state = controller.getSnapshot()['frvp-1']
    assert.equal(state?.status, 'ready')
    if (state?.status === 'ready') {
      assert.equal(state.pipeline.profile.totalVolume, 2)
    }
    controller.dispose()
  })

  it('does not refetch a fixed-range instance when the live edge advances', async () => {
    let calls = 0
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async () => {
        calls += 1
        return pipelineResult('frvp-1')
      },
    })
    controller.syncInstances([instance()], 1_000)
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.syncInstances([instance()], 1_060)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(calls, 1)
    controller.dispose()
  })

  it('does not set error state on abort', async () => {
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async (_item, options) => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        if (options.signal?.aborted) {
          const error = new Error('aborted')
          error.name = 'AbortError'
          throw error
        }
        return pipelineResult('frvp-1')
      },
    })
    controller.syncInstances([instance()])
    controller.syncInstances([])
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(controller.getSnapshot()['frvp-1'], undefined)
    controller.dispose()
  })

  it('isolates errors to the failing instance', async () => {
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async (item) => {
        if (item.id === 'frvp-bad') throw new Error('boom')
        return pipelineResult(item.id)
      },
    })
    controller.syncInstances([
      instance({ id: 'frvp-ok' }),
      instance({ id: 'frvp-bad', fromTime: 300, toTime: 400 }),
    ])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(controller.getSnapshot()['frvp-ok']?.status, 'ready')
    assert.equal(controller.getSnapshot()['frvp-bad']?.status, 'error')
    controller.dispose()
  })

  it('does not fetch disabled instances', async () => {
    let calls = 0
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async () => {
        calls += 1
        return pipelineResult('frvp-1')
      },
    })
    controller.syncInstances([instance({ enabled: false })])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(calls, 0)
    controller.dispose()
  })

  it('aborts all requests on dispose', async () => {
    let aborted = false
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {},
      runPipeline: async (_item, options) => {
        options.signal?.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise((resolve) => setTimeout(resolve, 20))
        return pipelineResult('frvp-1')
      },
    })
    controller.syncInstances([instance()])
    controller.dispose()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(aborted, true)
  })
})
