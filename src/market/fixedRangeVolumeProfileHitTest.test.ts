import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hitTestFixedRangeVolumeProfiles } from './fixedRangeVolumeProfileHitTest.ts'
import type { FixedRangeVolumeProfileInstanceDrawModel } from './fixedRangeVolumeProfileRenderGeometry.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'

function model(overrides: Partial<FixedRangeVolumeProfileInstanceDrawModel> = {}): FixedRangeVolumeProfileInstanceDrawModel {
  return {
    instanceId: 'frvp-test',
    rangeLeft: 100,
    rangeRight: 200,
    rangeWidth: 100,
    rows: [
      {
        top: 50,
        bottom: 60,
        left: 100,
        upWidth: 5,
        downWidth: 5,
        totalWidth: 10,
        upColor: 'red',
        downColor: 'green',
      },
    ],
    lines: [],
    endpointHandles: { startX: 100, endX: 200, y: 55 },
    ...overrides,
  }
}

function instance(overrides: Partial<FixedRangeVolumeProfileInstance> = {}): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-test',
    fromTime: 100,
    toTime: 200,
    selectionInterval: '1m',
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
    ...overrides,
  }
}

describe('fixedRangeVolumeProfileHitTest', () => {
  it('selects body hits without treating them as endpoint handles when unselected', () => {
    const hit = hitTestFixedRangeVolumeProfiles(
      [instance()],
      [model({ endpointHandles: null })],
      null,
      105,
      55,
    )
    assert.equal(hit?.kind, 'body')
  })

  it('hit-tests start and end handles separately when selected', () => {
    const drawModel = model()
    const instances = [instance()]
    const startHit = hitTestFixedRangeVolumeProfiles(instances, [drawModel], 'frvp-test', 100, 55)
    const endHit = hitTestFixedRangeVolumeProfiles(instances, [drawModel], 'frvp-test', 200, 55)
    assert.equal(startHit?.kind, 'start')
    assert.equal(endHit?.kind, 'end')
  })

  it('ignores endpoint handles on locked selections', () => {
    const drawModel = model()
    const instances = [instance({ locked: true })]
    const endpointHit = hitTestFixedRangeVolumeProfiles(
      instances,
      [drawModel],
      'frvp-test',
      200,
      55,
    )
    assert.equal(endpointHit, null)
    const bodyHit = hitTestFixedRangeVolumeProfiles(instances, [drawModel], 'frvp-test', 105, 55)
    assert.equal(bodyHit?.kind, 'body')
  })
})
