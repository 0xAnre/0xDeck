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
  FRVP_VALUE_AREA_ROW_OPACITY,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import { frvpDefaultDrawStyle, frvpDrawStyleForInstance } from './frvpInstanceLineStyles.ts'
import { readFrvpPocLineStrokeStyle } from './frvpLevelLineColors.ts'

const TEST_STYLES = frvpDefaultDrawStyle()

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
  it('anchors histogram bars on the left boundary of the selected range', () => {
    const rangeWidth = 200
    const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ totalVolume: 100 }),
      rangeLeft: 100,
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
    assert.equal(geometry?.left, 100)
  })

  it('scales half-volume row to half of the histogram max width', () => {
    const rangeWidth = 200
    const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ totalVolume: 50 }),
      rangeLeft: 100,
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
      rangeLeft: 200,
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
      rangeLeft: 200,
      rangeWidth: 100,
      maxRowVolume: 10,
      top: 0,
      bottom: 10,
      inValueArea: true,
    })
    const outVa = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row({ inValueArea: false }),
      rangeLeft: 200,
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
      pocStrokeStyle: TEST_STYLES.pocStrokeStyle,
      pocLineWidthCssPx: 3,
      vahStrokeStyle: TEST_STYLES.vahStrokeStyle,
      vahLineWidthCssPx: 3,
      valStrokeStyle: TEST_STYLES.valStrokeStyle,
      valLineWidthCssPx: 3,
      pocPrice: null,
      vah: null,
      val: null,
      priceToY: () => 50,
    })
    assert.equal(lines.length, 0)
  })

  it('builds POC, VAH, and VAL lines with per-level width', () => {
    const lines = buildFixedRangeVolumeProfileLevelLines({
      rangeLeft: 10,
      rangeRight: 200,
      pocStrokeStyle: readFrvpPocLineStrokeStyle(),
      pocLineWidthCssPx: 4,
      vahStrokeStyle: 'rgba(160, 160, 160, 0.55)',
      vahLineWidthCssPx: 2,
      valStrokeStyle: 'rgba(160, 160, 160, 0.55)',
      valLineWidthCssPx: 1,
      pocPrice: 105,
      vah: 110,
      val: 100,
      priceToY: (price) => price,
    })
    assert.equal(lines.length, 3)

    const poc = lines.find((line) => line.kind === 'poc')
    const vah = lines.find((line) => line.kind === 'vah')
    const val = lines.find((line) => line.kind === 'val')

    assert.equal(poc?.strokeStyle, readFrvpPocLineStrokeStyle())
    assert.equal(poc?.lineDash.length, 0)
    assert.equal(poc?.lineWidthCssPx, 4)
    assert.equal(poc?.x1, 10)
    assert.equal(poc?.x2, 200)

    assert.equal(vah?.strokeStyle, 'rgba(160, 160, 160, 0.55)')
    assert.deepEqual(vah?.lineDash, [4, 4])
    assert.equal(vah?.lineWidthCssPx, 2)
    assert.equal(val?.strokeStyle, 'rgba(160, 160, 160, 0.55)')
    assert.deepEqual(val?.lineDash, [4, 4])
    assert.equal(val?.lineWidthCssPx, 1)
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
      fromTimeToCoordinate: (time) => time / 10,
      toTimeToCoordinate: (time) => time / 10,
      priceToY: (price) => 500 - price,
      styleForInstance: (id) =>
        frvpDrawStyleForInstance({
          id,
          fromTime: 100,
          toTime: 200,
          selectionInterval: '1m',
          rowCount: 24,
          valueAreaPercent: 70,
          enabled: true,
          displaySequence: 1,
        }),
    })
    assert.equal(models.length, 2)
    assert.notEqual(models[0].instanceId, models[1].instanceId)
    assert.equal(models[0].rows[0]?.left, models[0].rangeLeft)
  })

  it('returns zero max volume for empty rows safely', () => {
    assert.equal(computeMaxRowVolume([]), 0)
  })
})
