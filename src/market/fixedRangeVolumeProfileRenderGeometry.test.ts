import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileRow } from './fixedRangeVolumeProfile.ts'
import {
  buildFixedRangeVolumeProfileDrawModels,
  buildFixedRangeVolumeProfileLevelLines,
  buildFixedRangeVolumeProfileRowBarGeometry,
  computeMaxRowVolume,
  FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE,
  FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY,
  FRVP_POC_LINE_STROKE_STYLE,
  FRVP_VALUE_AREA_ROW_OPACITY,
} from './fixedRangeVolumeProfileRenderGeometry.ts'

function row(overrides: Partial<FixedRangeVolumeProfileRow> = {}): FixedRangeVolumeProfileRow {
  return {
    priceLow: 100,
    priceHigh: 110,
    upVolume: 6,
    downVolume: 4,
    totalVolume: 10,
    inValueArea: true,
    ...overrides,
  }
}

describe('fixedRangeVolumeProfileRenderGeometry', () => {
  it('uses one-third of range width for the highest volume row', () => {
    const rangeWidth = 200
    const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ totalVolume: 100 }),
      rangeRight: 300,
      rangeWidth,
      maxRowVolume: 100,
      top: 10,
      bottom: 20,
      inValueArea: true,
    })
    assert.equal(
      geometry?.totalWidth,
      rangeWidth * FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE,
    )
    assert.equal(geometry?.right, 300)
  })

  it('scales half-volume row to half of the histogram max width', () => {
    const rangeWidth = 200
    const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ totalVolume: 50 }),
      rangeRight: 300,
      rangeWidth,
      maxRowVolume: 100,
      top: 10,
      bottom: 20,
      inValueArea: false,
    })
    assert.equal(
      geometry?.totalWidth,
      (rangeWidth * FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE) / 2,
    )
  })

  it('splits up and down widths to the total bar width', () => {
    const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ upVolume: 30, downVolume: 70, totalVolume: 100 }),
      rangeRight: 400,
      rangeWidth: 200,
      maxRowVolume: 100,
      top: 10,
      bottom: 20,
      inValueArea: true,
    })
    assert.equal(geometry?.upWidth + geometry?.downWidth, geometry?.totalWidth)
  })

  it('assigns stronger opacity to value area rows', () => {
    const inVa = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ inValueArea: true }),
      rangeRight: 300,
      rangeWidth: 100,
      maxRowVolume: 10,
      top: 0,
      bottom: 10,
      inValueArea: true,
    })
    const outVa = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ inValueArea: false }),
      rangeRight: 300,
      rangeWidth: 100,
      maxRowVolume: 10,
      top: 0,
      bottom: 10,
      inValueArea: false,
    })
    assert.match(inVa?.upColor ?? '', new RegExp(String(FRVP_VALUE_AREA_ROW_OPACITY)))
    assert.match(outVa?.upColor ?? '', new RegExp(String(FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY)))
  })

  it('returns null lines for null metrics', () => {
    const lines = buildFixedRangeVolumeProfileLevelLines({
      rangeLeft: 10,
      rangeRight: 200,
      pocPrice: null,
      vah: null,
      val: null,
      priceToY: () => 50,
    })
    assert.equal(lines.length, 0)
  })

  it('builds POC, VAH, and VAL lines', () => {
    const lines = buildFixedRangeVolumeProfileLevelLines({
      rangeLeft: 10,
      rangeRight: 200,
      pocPrice: 105,
      vah: 110,
      val: 100,
      priceToY: (price) => price,
    })
    assert.equal(lines.length, 3)

    const poc = lines.find((line) => line.kind === 'poc')
    const vah = lines.find((line) => line.kind === 'vah')
    const val = lines.find((line) => line.kind === 'val')

    assert.equal(poc?.strokeStyle, FRVP_POC_LINE_STROKE_STYLE)
    assert.equal(poc?.lineDash.length, 0)
    assert.equal(poc?.x1, 10)
    assert.equal(poc?.x2, 200)

    assert.equal(vah?.strokeStyle, 'rgba(160, 160, 160, 0.55)')
    assert.deepEqual(vah?.lineDash, [4, 4])
    assert.equal(val?.strokeStyle, 'rgba(160, 160, 160, 0.55)')
    assert.deepEqual(val?.lineDash, [4, 4])
  })

  it('keeps multi-instance geometry separate', () => {
    const models = buildFixedRangeVolumeProfileDrawModels({
      instances: [
        { id: 'a', fromTime: 100, toTime: 200, enabled: true },
        { id: 'b', fromTime: 300, toTime: 400, enabled: true },
      ],
      readyById: new Map([
        [
          'a',
          {
            profile: {
              fromTime: 100,
              toTime: 199,
              candleCount: 1,
              profileLow: 100,
              profileHigh: 120,
              rowHeight: 1,
              rows: [row({ priceLow: 100, priceHigh: 110 })],
              totalVolume: 10,
              pocRowIndex: 0,
              pocPrice: 105,
              pocVolume: 10,
              vah: 110,
              val: 100,
              valueAreaVolume: 10,
              valueAreaPercentAchieved: 70,
            },
          },
        ],
        [
          'b',
          {
            profile: {
              fromTime: 300,
              toTime: 399,
              candleCount: 1,
              profileLow: 200,
              profileHigh: 220,
              rowHeight: 1,
              rows: [row({ priceLow: 200, priceHigh: 210 })],
              totalVolume: 20,
              pocRowIndex: 0,
              pocPrice: 205,
              pocVolume: 20,
              vah: 210,
              val: 200,
              valueAreaVolume: 20,
              valueAreaPercentAchieved: 70,
            },
          },
        ],
      ]),
      barSpacing: 6,
      timeToCoordinate: (time) => time / 10,
      priceToY: (price) => 500 - price,
    })
    assert.equal(models.length, 2)
    assert.notEqual(models[0].instanceId, models[1].instanceId)
  })

  it('returns zero max volume for empty rows safely', () => {
    assert.equal(computeMaxRowVolume([]), 0)
  })
})
