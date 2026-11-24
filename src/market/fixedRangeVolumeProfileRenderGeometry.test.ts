import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileRow } from './fixedRangeVolumeProfile.ts'
import {
  buildFixedRangeVolumeProfileDrawModels,
  buildFixedRangeVolumeProfileInstanceDrawModel,
  buildFixedRangeVolumeProfileLevelLines,
  buildFixedRangeVolumeProfileRowBarGeometry,
  computeMaxRowVolume,
  FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE,
  FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY,
  FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT,
  FRVP_VALUE_AREA_ROW_OPACITY,
  FRVP_VALUE_AREA_ROW_OPACITY_PERCENT,
  fixedRangeVolumeProfileRowOpacityPercent,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import { frvpDefaultDrawStyle, frvpDrawStyleForInstance } from './frvpInstanceLineStyles.ts'
import {
  FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT,
} from './frvpHistogramStyles.ts'
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
    assert.equal(inVa?.upColor, 'rgba(219, 219, 219, 0.275)')
    assert.equal(outVa?.upColor, 'rgba(219, 219, 219, 0.125)')
  })


  it('keeps the 25:55 split of the default 50% opacity when no histogram style is set', () => {
    const inVa = buildFixedRangeVolumeProfileRowBarGeometry({
      row: row(),
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
    assert.equal(inVa?.upColor, 'rgba(219, 219, 219, 0.275)')
    assert.equal(inVa?.downColor, 'rgba(128, 128, 128, 0.275)')
    assert.equal(outVa?.upColor, 'rgba(219, 219, 219, 0.125)')
    assert.equal(outVa?.downColor, 'rgba(128, 128, 128, 0.125)')
    assert.equal(FRVP_VALUE_AREA_ROW_OPACITY_PERCENT, 55)
    assert.equal(FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT, 25)
  })

  it('scales the configured opacity while keeping Value Area rows stronger', () => {
    const build = (inValueArea: boolean, opacityPercent: number) =>
      buildFixedRangeVolumeProfileRowBarGeometry({
        row: row({ inValueArea }),
        rangeLeft: 200,
        rangeWidth: 100,
        maxRowVolume: 10,
        top: 0,
        bottom: 10,
        inValueArea,
        upColor: '#112233',
        downColor: '#445566',
        upOpacityPercent: opacityPercent,
        downOpacityPercent: opacityPercent,
      })
    assert.equal(build(true, 50)?.upColor, 'rgba(17, 34, 51, 0.275)')
    assert.equal(build(false, 50)?.upColor, 'rgba(17, 34, 51, 0.125)')
    assert.equal(build(true, 50)?.downColor, 'rgba(68, 85, 102, 0.275)')
    assert.equal(fixedRangeVolumeProfileRowOpacityPercent(80, true), 44)
    assert.equal(fixedRangeVolumeProfileRowOpacityPercent(80, false), 20)
    // 100% configured opacity reproduces the historical alphas exactly.
    assert.equal(
      fixedRangeVolumeProfileRowOpacityPercent(100, true),
      FRVP_VALUE_AREA_ROW_OPACITY_PERCENT,
    )
    assert.equal(
      fixedRangeVolumeProfileRowOpacityPercent(100, false),
      FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT,
    )
    assert.equal(FRVP_VALUE_AREA_ROW_OPACITY, 0.55)
    assert.equal(FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY, 0.25)
  })

  it('returns null lines for null metrics', () => {
    const lines = buildFixedRangeVolumeProfileLevelLines({
      rangeLeft: 10,
      rangeRight: 200,
      pocStrokeStyle: TEST_STYLES.pocStrokeStyle,
      pocLineWidthCssPx: 3,
      pocLineDash: TEST_STYLES.pocLineDash,
      vahStrokeStyle: TEST_STYLES.vahStrokeStyle,
      vahLineWidthCssPx: 3,
      vahLineDash: TEST_STYLES.vahLineDash,
      valStrokeStyle: TEST_STYLES.valStrokeStyle,
      valLineWidthCssPx: 3,
      valLineDash: TEST_STYLES.valLineDash,
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
      pocLineDash: [],
      vahStrokeStyle: 'rgba(160, 160, 160, 0.55)',
      vahLineWidthCssPx: 2,
      vahLineDash: [6, 4],
      valStrokeStyle: 'rgba(160, 160, 160, 0.55)',
      valLineWidthCssPx: 1,
      valLineDash: [6, 4],
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
    assert.deepEqual(poc?.lineDash, [])
    assert.equal(poc?.lineWidthCssPx, 4)
    assert.equal(poc?.x1, 10)
    assert.equal(poc?.x2, 200)

    assert.equal(vah?.strokeStyle, 'rgba(160, 160, 160, 0.55)')
    assert.deepEqual(vah?.lineDash, [6, 4])
    assert.equal(vah?.lineWidthCssPx, 2)
    assert.equal(val?.strokeStyle, 'rgba(160, 160, 160, 0.55)')
    assert.deepEqual(val?.lineDash, [6, 4])
    assert.equal(val?.lineWidthCssPx, 1)
  })

  it('places endpoint handles at candle centers, not half-bar range edges', () => {
    const model = buildFixedRangeVolumeProfileInstanceDrawModel({
      instanceId: 'a',
      fromTime: 100,
      toTime: 200,
      profile: {
        fromTime: 100,
        toTime: 199,
        candleCount: 1,
        profileLow: 100,
        profileHigh: 120,
        rowHeight: 1,
        rows: [row()],
        totalVolume: 10,
        pocRowIndex: 0,
        pocPrice: 105,
        pocVolume: 10,
        vah: 110,
        val: 100,
        valueAreaVolume: 10,
        valueAreaPercentAchieved: 70,
      },
      barSpacing: 6,
      fromTimeToCoordinate: (time) => time / 10,
      toTimeToCoordinate: (time) => time / 10,
      priceToY: (price) => 500 - price,
      ...TEST_STYLES,
    })
    assert.notEqual(model, null)
    assert.equal(model?.endpointHandles?.startX, 10)
    assert.equal(model?.endpointHandles?.endX, 20)
    assert.equal(model?.rangeLeft, 7)
    assert.equal(model?.rangeRight, 23)
  })

  it('places endpoint handles at the vertical center of the profile bounds', () => {
    const model = buildFixedRangeVolumeProfileInstanceDrawModel({
      instanceId: 'a',
      fromTime: 100,
      toTime: 200,
      profile: {
        fromTime: 100,
        toTime: 199,
        candleCount: 3,
        profileLow: 100,
        profileHigh: 130,
        rowHeight: 10,
        rows: [
          row({ priceLow: 100, priceHigh: 110, totalVolume: 10, upVolume: 5, downVolume: 5 }),
          row({ priceLow: 110, priceHigh: 120, totalVolume: 20, upVolume: 10, downVolume: 10 }),
          row({ priceLow: 120, priceHigh: 130, totalVolume: 15, upVolume: 8, downVolume: 7 }),
        ],
        totalVolume: 45,
        pocRowIndex: 1,
        pocPrice: 115,
        pocVolume: 20,
        vah: 120,
        val: 110,
        valueAreaVolume: 30,
        valueAreaPercentAchieved: 70,
      },
      barSpacing: 6,
      fromTimeToCoordinate: (time) => time / 10,
      toTimeToCoordinate: (time) => time / 10,
      priceToY: (price) => 500 - price,
      ...TEST_STYLES,
    })
    assert.notEqual(model, null)
    assert.notEqual(model?.endpointHandles, null)
    assert.equal(model?.endpointHandles?.y, 385)
  })

  it('shows endpoint handles only for the selected unlocked instance', () => {
    const models = buildFixedRangeVolumeProfileDrawModels({
      instances: [
        { id: 'a', fromTime: 100, toTime: 200, enabled: true },
        { id: 'b', fromTime: 300, toTime: 400, enabled: true, locked: true },
      ],
      selectedId: 'a',
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
              rows: [row()],
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
      styleForInstance: () => TEST_STYLES,
    })
    assert.notEqual(models[0].endpointHandles, null)
    assert.equal(models[1].endpointHandles, null)
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

  it('extends the profile range to the live edge while endpoint handles stay on toTime', () => {
    const profile = {
      fromTime: 100,
      toTime: 299,
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
    }
    const models = buildFixedRangeVolumeProfileDrawModels({
      instances: [{ id: 'a', fromTime: 100, toTime: 200, enabled: true, extendRight: true }],
      selectedId: 'a',
      readyById: new Map([['a', { profile }]]),
      barSpacing: 6,
      fromTimeToCoordinate: (time) => time / 10,
      toTimeToCoordinate: (time) => time / 10,
      priceToY: (price) => 500 - price,
      styleForInstance: () => TEST_STYLES,
      liveRightEdge: 300,
    })

    assert.equal(models.length, 1)
    // Histogram/level span follows the live edge...
    assert.equal(models[0].rangeRight, 33)
    assert.equal(models[0].lines[0]?.x2, 33)
    // ...but the draggable endpoint handle stays at the drawing's toTime.
    assert.equal(models[0].endpointHandles?.endX, 20)
    assert.equal(models[0].endpointHandles?.startX, 10)
  })

  it('leaves the profile range at toTime when Extend Right is off', () => {
    const profile = {
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
    }
    const models = buildFixedRangeVolumeProfileDrawModels({
      instances: [{ id: 'a', fromTime: 100, toTime: 200, enabled: true, extendRight: false }],
      readyById: new Map([['a', { profile }]]),
      barSpacing: 6,
      fromTimeToCoordinate: (time) => time / 10,
      toTimeToCoordinate: (time) => time / 10,
      priceToY: (price) => 500 - price,
      styleForInstance: () => TEST_STYLES,
      liveRightEdge: 300,
    })
    assert.equal(models[0].rangeRight, 23)
  })

  it('returns zero max volume for empty rows safely', () => {
    assert.equal(computeMaxRowVolume([]), 0)
  })

  it('maps dotted VAH stroke style and custom opacity into line geometry', () => {
    const instance = {
      id: 'frvp-style',
      fromTime: 100,
      toTime: 200,
      selectionInterval: '1m' as const,
      rowCount: 24,
      valueAreaPercent: 70,
      enabled: true,
      displaySequence: 1,
      vahLineStyle: 'dotted' as const,
      vahStrokeOpacityPercent: 25,
      vahStrokeColor: '#ff0000',
    }
    const styles = frvpDrawStyleForInstance(instance)
    const lines = buildFixedRangeVolumeProfileLevelLines({
      rangeLeft: 0,
      rangeRight: 100,
      ...styles,
      pocPrice: null,
      vah: 105,
      val: null,
      priceToY: () => 50,
    })
    const vah = lines.find((line) => line.kind === 'vah')
    assert.deepEqual(vah?.lineDash, [2, 3])
    assert.match(vah?.strokeStyle ?? '', /rgba\(255,\s*0,\s*0/)
  })
})

function sizedBarGeometry(params: {
  widthPercent?: number
  barHeightPercent?: number
  rangeWidth?: number
  volume?: number
  maxRowVolume?: number
  upVolume?: number
  downVolume?: number
  top?: number
  bottom?: number
}) {
  const volume = params.volume ?? 100
  const upVolume = params.upVolume ?? 30
  const downVolume = params.downVolume ?? 70
  const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
    row: row({
      upVolume,
      downVolume,
      totalVolume: volume,
      inValueArea: true,
    }),
    rangeLeft: 100,
    rangeWidth: params.rangeWidth ?? 600,
    maxRowVolume: params.maxRowVolume ?? 100,
    top: params.top ?? 10,
    bottom: params.bottom ?? 20,
    inValueArea: true,
    ...(params.widthPercent === undefined
      ? {}
      : { histogramWidthPercent: params.widthPercent }),
    ...(params.barHeightPercent === undefined
      ? {}
      : { histogramBarHeightPercent: params.barHeightPercent }),
  })
  if (!geometry) throw new Error('expected sized bar geometry')
  return geometry
}

describe('FRVP histogram bar size geometry', () => {
  it('keeps the exact legacy 1/6 width when no width field is set', () => {
    const geometry = sizedBarGeometry({ rangeWidth: 600 })
    assert.equal(geometry.totalWidth, 100)
    assert.equal(
      geometry.totalWidth,
      600 * FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE,
    )
    assert.equal(FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT, 100 / 6)
  })

  it('scales horizontal width linearly and preserves up/down volume shares', () => {
    for (const widthPercent of [10, 25, 50, 100]) {
      const geometry = sizedBarGeometry({ widthPercent, rangeWidth: 600 })
      assert.equal(geometry.totalWidth, (600 * widthPercent) / 100)
      assert.equal(geometry.upWidth, geometry.totalWidth * 0.3)
      assert.equal(geometry.downWidth, geometry.totalWidth * 0.7)
      assert.equal(geometry.upWidth + geometry.downWidth, geometry.totalWidth)
      assert.ok(geometry.totalWidth <= 600)
      assert.equal(geometry.left, 100)
    }
  })

  it('bounds malformed width values to the legacy default', () => {
    for (const widthPercent of [0, -5, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      const geometry = sizedBarGeometry({ widthPercent, rangeWidth: 600 })
      assert.equal(
        geometry.totalWidth,
        600 * FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE,
      )
    }
  })

  it('fills the whole bin at the legacy 100% height', () => {
    const geometry = sizedBarGeometry({ barHeightPercent: 100 })
    assert.equal(geometry.top, 10)
    assert.equal(geometry.bottom, 20)
    assert.equal(FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT, 100)
  })

  it('centers the vertical fill inside the same bin without moving its centre', () => {
    const full = sizedBarGeometry({ barHeightPercent: 100 })
    const half = sizedBarGeometry({ barHeightPercent: 50 })
    const thin = sizedBarGeometry({ barHeightPercent: 1 })
    assert.equal(half.top, 12.5)
    assert.equal(half.bottom, 17.5)
    assert.equal((full.top + full.bottom) / 2, (half.top + half.bottom) / 2)
    assert.equal((full.top + full.bottom) / 2, (thin.top + thin.bottom) / 2)
    assert.ok(half.bottom - half.top < full.bottom - full.top)
    assert.ok(thin.bottom - thin.top < half.bottom - half.top)
    assert.ok(thin.bottom - thin.top > 0)
  })

  it('bounds malformed height values to the legacy full row', () => {
    for (const barHeightPercent of [0, -5, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      const geometry = sizedBarGeometry({ barHeightPercent })
      assert.equal(geometry.top, 10)
      assert.equal(geometry.bottom, 20)
    }
  })

  it('keeps endpoint handles at the price-bin centre while the fill shrinks', () => {
    const profile = {
      fromTime: 100,
      toTime: 199,
      candleCount: 3,
      profileLow: 100,
      profileHigh: 130,
      rowHeight: 10,
      rows: [
        row({ priceLow: 100, priceHigh: 110, totalVolume: 10, upVolume: 5, downVolume: 5 }),
        row({ priceLow: 110, priceHigh: 120, totalVolume: 20, upVolume: 10, downVolume: 10 }),
        row({ priceLow: 120, priceHigh: 130, totalVolume: 15, upVolume: 8, downVolume: 7 }),
      ],
      totalVolume: 45,
      pocRowIndex: 1,
      pocPrice: 115,
      pocVolume: 20,
      vah: 120,
      val: 110,
      valueAreaVolume: 30,
      valueAreaPercentAchieved: 70,
    }
    const build = (histogramBarHeightPercent: number) =>
      buildFixedRangeVolumeProfileInstanceDrawModel({
        instanceId: 'a',
        fromTime: 100,
        toTime: 200,
        profile,
        barSpacing: 6,
        fromTimeToCoordinate: (time) => time / 10,
        toTimeToCoordinate: (time) => time / 10,
        priceToY: (price) => 500 - price,
        ...TEST_STYLES,
        histogramBarHeightPercent,
      })
    const full = build(100)
    const half = build(50)
    assert.notEqual(full, null)
    assert.notEqual(half, null)
    assert.equal(full?.endpointHandles?.y, half?.endpointHandles?.y)
    assert.ok(
      (half?.rows[0]?.bottom ?? 0) - (half?.rows[0]?.top ?? 0) <
        (full?.rows[0]?.bottom ?? 0) - (full?.rows[0]?.top ?? 0),
    )
    // Width is independent of the vertical fill.
    assert.equal(half?.rows[0]?.totalWidth, full?.rows[0]?.totalWidth)
  })
})
