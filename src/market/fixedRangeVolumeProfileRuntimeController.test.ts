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
        return pipelineResult(item.id)
      },
    })
    controller.syncInstances([instance({ rowCount: 24 })])
    controller.syncInstances([instance({ rowCount: 48 })])
    await new Promise((resolve) => setTimeout(resolve, 40))
    const state = controller.getSnapshot()['frvp-1']
    assert.equal(state?.status, 'ready')
    if (state?.status === 'ready') {
      assert.equal(state.pipeline.profile.rowCount, undefined)
    }
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
