import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hitTestFixedRangeVolumeProfiles } from './fixedRangeVolumeProfileHitTest.ts'
import {
  buildFixedRangeVolumeProfileInstanceDrawModel,
  type FixedRangeVolumeProfileInstanceDrawModel,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import { frvpDefaultDrawStyle } from './frvpInstanceLineStyles.ts'
import type { FrvpLevelRenderMode } from './frvpDevelopingMode.ts'

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
    // The right-edge point is now a body hit (the profile rectangle covers the
    // whole range), never an endpoint handle on a locked instance.
    const endpointHit = hitTestFixedRangeVolumeProfiles(
      instances,
      [drawModel],
      'frvp-test',
      200,
      55,
    )
    assert.equal(endpointHit?.kind, 'body')
    const bodyHit = hitTestFixedRangeVolumeProfiles(instances, [drawModel], 'frvp-test', 105, 55)
    assert.equal(bodyHit?.kind, 'body')
  })
})

// ---------------------------------------------------------------------------
// Mode-independent body hit region (Issue #214 follow-up)
// ---------------------------------------------------------------------------

const PROFILE: FixedRangeVolumeProfileResult = {
  fromTime: 100,
  toTime: 200,
  candleCount: 3,
  profileLow: 100,
  profileHigh: 120,
  rowHeight: 10,
  rows: [
    {
      priceLow: 100,
      priceHigh: 110,
      upVolume: 5,
      downVolume: 5,
      totalVolume: 10,
      inValueArea: true,
    },
    {
      priceLow: 110,
      priceHigh: 120,
      upVolume: 5,
      downVolume: 5,
      totalVolume: 10,
      inValueArea: false,
    },
  ],
  totalVolume: 20,
  pocRowIndex: 0,
  pocPrice: 105,
  pocVolume: 10,
  vah: 110,
  val: 100,
  valueAreaVolume: 10,
  valueAreaPercentAchieved: 50,
}

/** Real draw model: x = time, y = 1000 - price, barSpacing 6 → range 97..203, price extent y 880..900. */
const RANGE_LEFT = 97
const RANGE_RIGHT = 203
const PROFILE_MID_Y = 890

function drawModelFor(opts: {
  instanceId?: string
  valueAreaMode?: FrvpLevelRenderMode
  pocMode?: FrvpLevelRenderMode
  fromTime?: number
  toTime?: number
} = {}): FixedRangeVolumeProfileInstanceDrawModel {
  const drawModel = buildFixedRangeVolumeProfileInstanceDrawModel({
    instanceId: opts.instanceId ?? 'frvp-test',
    fromTime: opts.fromTime ?? 100,
    toTime: opts.toTime ?? 200,
    profile: PROFILE,
    fromTimeToCoordinate: (time) => time,
    toTimeToCoordinate: (time) => time,
    barSpacing: 6,
    priceToY: (price) => 1000 - price,
    ...frvpDefaultDrawStyle(),
    valueAreaMode: opts.valueAreaMode,
    pocMode: opts.pocMode,
  })
  assert.ok(drawModel)
  return drawModel
}

function hitAt(
  drawModel: FixedRangeVolumeProfileInstanceDrawModel,
  instanceOverrides: Partial<FixedRangeVolumeProfileInstance> = {},
  paneX: number,
  paneY: number,
  selectedId: string | null = null,
) {
  return hitTestFixedRangeVolumeProfiles(
    [instance(instanceOverrides)],
    [drawModel],
    selectedId,
    paneX,
    paneY,
  )
}

describe('fixedRangeVolumeProfile mode-independent body hit region', () => {
  const modes: Array<{
    kind: string
    valueAreaMode: FrvpLevelRenderMode
    pocMode: FrvpLevelRenderMode
    expectedFlatLines: number
  }> = [
    { kind: 'line', valueAreaMode: 'line', pocMode: 'line', expectedFlatLines: 3 },
    { kind: 'step', valueAreaMode: 'step', pocMode: 'step', expectedFlatLines: 0 },
    { kind: 'both', valueAreaMode: 'both', pocMode: 'both', expectedFlatLines: 3 },
  ]

  it('hits the same body at the left edge, middle and right edge for line, step and both', () => {
    const points = [
      { paneX: RANGE_LEFT + 1, paneY: PROFILE_MID_Y },
      { paneX: (RANGE_LEFT + RANGE_RIGHT) / 2, paneY: PROFILE_MID_Y },
      { paneX: RANGE_RIGHT - 1, paneY: PROFILE_MID_Y },
    ]
    for (const mode of modes) {
      const drawModel = drawModelFor({
        valueAreaMode: mode.valueAreaMode,
        pocMode: mode.pocMode,
      })
      // The whole point of the fix: `step` hides that group's flat line, but the
      // body region is identical in every mode.
      assert.equal(drawModel.lines.length, mode.expectedFlatLines, mode.kind)
      for (const point of points) {
        const hit = hitAt(drawModel, {}, point.paneX, point.paneY)
        assert.equal(hit?.kind, 'body', `${mode.kind} at ${point.paneX},${point.paneY}`)
        assert.equal(hit?.instanceId, 'frvp-test')
        assert.equal(hit?.priority, 1)
      }
    }
  })

  it('keeps the hit identical for a mixed mode (value area step, POC line)', () => {
    const drawModel = drawModelFor({ valueAreaMode: 'step', pocMode: 'line' })
    assert.equal(drawModel.lines.length, 1)
    for (const paneX of [RANGE_LEFT + 1, (RANGE_LEFT + RANGE_RIGHT) / 2, RANGE_RIGHT - 1]) {
      assert.equal(hitAt(drawModel, {}, paneX, PROFILE_MID_Y)?.kind, 'body')
    }
  })

  it('misses outside the profile rectangle', () => {
    const drawModel = drawModelFor({ valueAreaMode: 'step', pocMode: 'step' })
    const outside = [
      { paneX: RANGE_LEFT - 20, paneY: PROFILE_MID_Y },
      { paneX: RANGE_RIGHT + 20, paneY: PROFILE_MID_Y },
      { paneX: (RANGE_LEFT + RANGE_RIGHT) / 2, paneY: 880 - 20 },
      { paneX: (RANGE_LEFT + RANGE_RIGHT) / 2, paneY: 900 + 20 },
    ]
    for (const point of outside) {
      assert.equal(hitAt(drawModel, {}, point.paneX, point.paneY), null, `${point.paneX},${point.paneY}`)
    }
  })

  it('ignores hidden instances inside the rectangle', () => {
    const drawModel = drawModelFor({ valueAreaMode: 'step', pocMode: 'step' })
    assert.equal(hitAt(drawModel, { enabled: false }, RANGE_LEFT + 1, PROFILE_MID_Y), null)
  })

  it('picks the top-most overlapping instance', () => {
    const bottom = drawModelFor({ instanceId: 'frvp-bottom' })
    const top = drawModelFor({
      instanceId: 'frvp-top',
      fromTime: 120,
      toTime: 180,
    })
    const hit = hitTestFixedRangeVolumeProfiles(
      [instance({ id: 'frvp-bottom' }), instance({ id: 'frvp-top' })],
      [bottom, top],
      null,
      (RANGE_LEFT + RANGE_RIGHT) / 2,
      PROFILE_MID_Y,
    )
    assert.equal(hit?.instanceId, 'frvp-top')
    assert.equal(hit?.kind, 'body')
  })

  it('keeps endpoint handles above the body when the instance is selected', () => {
    const drawModel = drawModelFor()
    assert.ok(drawModel.endpointHandles)
    const startHit = hitAt(
      drawModel,
      {},
      drawModel.endpointHandles.startX,
      drawModel.endpointHandles.y,
      'frvp-test',
    )
    assert.equal(startHit?.kind, 'start')
    assert.equal(startHit?.priority, 3)

    // Same point, unselected: the body rectangle is the fallback.
    const bodyHit = hitAt(
      drawModel,
      {},
      drawModel.endpointHandles.startX,
      drawModel.endpointHandles.y,
    )
    assert.equal(bodyHit?.kind, 'body')
  })
})
