import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'
import {
  buildFixedRangeVolumeProfileInstanceDrawModel,
  buildFixedRangeVolumeProfileRowBarGeometry,
  FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY,
  FRVP_VALUE_AREA_ROW_OPACITY,
  fixedRangeVolumeProfileRowOpacityPercent,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import {
  createFixedRangeVolumeProfileInstance,
  sanitizeFixedRangeVolumeProfileInstances,
} from './fixedRangeVolumeProfileInstances.ts'
import {
  FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_DEFAULT_DOWN_COLOR,
  FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT,
  FRVP_HISTOGRAM_DEFAULT_UP_COLOR,
  FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT,
  FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT_INPUT,
  FRVP_HISTOGRAM_MAX_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_MAX_WIDTH_PERCENT,
  FRVP_HISTOGRAM_MIN_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_MIN_WIDTH_PERCENT,
  frvpHistogramBarHeightPercent,
  frvpHistogramColorInputValue,
  frvpHistogramOpacityPercent,
  frvpHistogramStyleDefaults,
  frvpHistogramStyleForInstance,
  frvpHistogramWidthPercent,
  frvpHistogramWidthPercentInputValue,
  isFrvpHistogramBarHeightPercent,
  isFrvpHistogramWidthPercent,
  sanitizeFrvpInstanceHistogramStyles,
  setFrvpInstanceHistogramBarHeightPercent,
  setFrvpInstanceHistogramColor,
  setFrvpInstanceHistogramOpacityPercent,
  setFrvpInstanceHistogramWidthPercent,
} from './frvpHistogramStyles.ts'
import { frvpDrawStyleForInstance } from './frvpInstanceLineStyles.ts'
import type { FixedRangeVolumeProfileRow } from './fixedRangeVolumeProfile.ts'

function row(
  overrides: Partial<FixedRangeVolumeProfileRow> = {},
): FixedRangeVolumeProfileRow {
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

function newInstance() {
  const instance = createFixedRangeVolumeProfileInstance({
    fromTime: 1_000,
    toTime: 2_000,
    selectionInterval: '1m',
  })
  if (!instance) throw new Error('expected a created FRVP instance')
  return instance
}

function sanitizeOne(record: Record<string, unknown>) {
  const instances = sanitizeFixedRangeVolumeProfileInstances([record])
  if (instances.length !== 1) throw new Error('expected one sanitized FRVP instance')
  return instances[0]
}

function rowColors(style: {
  upColor: string
  downColor: string
  upOpacityPercent: number
  downOpacityPercent: number
  inValueArea: boolean
}) {
  const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
    row: row({ inValueArea: style.inValueArea }),
    rangeLeft: 100,
    rangeWidth: 100,
    maxRowVolume: 10,
    top: 10,
    bottom: 20,
    inValueArea: style.inValueArea,
    upColor: style.upColor,
    downColor: style.downColor,
    upOpacityPercent: style.upOpacityPercent,
    downOpacityPercent: style.downOpacityPercent,
  })
  if (!geometry) throw new Error('expected row bar geometry')
  return geometry
}

function alphaOf(rgba: string): number {
  const match = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(rgba)
  if (!match) throw new Error(`not an rgba color: ${rgba}`)
  return Number.parseFloat(match[1])
}

describe('frvpHistogramStyles', () => {
  it('defaults to the BTC candle colors at 50% configured opacity', () => {
    assert.deepEqual(frvpHistogramStyleDefaults(), {
      upColor: BTC_PERPETUAL_CANDLESTICK_COLORS.upColor,
      downColor: BTC_PERPETUAL_CANDLESTICK_COLORS.downColor,
      upOpacityPercent: 50,
      downOpacityPercent: 50,
    })
    assert.equal(FRVP_HISTOGRAM_DEFAULT_UP_COLOR, '#DBDBDB')
    assert.equal(FRVP_HISTOGRAM_DEFAULT_DOWN_COLOR, '#808080')
    assert.equal(FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT, 50)
  })

  it('resolves the legacy fallback for instances without custom histogram fields', () => {
    const instance = sanitizeOne({
      id: 'frvp-legacy',
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
      rowCount: 24,
      valueAreaPercent: 70,
      enabled: true,
    })
    assert.equal(instance.histogramUpColor, undefined)
    assert.equal(instance.histogramDownColor, undefined)
    assert.equal(frvpHistogramColorInputValue(instance, 'up'), '#DBDBDB')
    assert.equal(frvpHistogramColorInputValue(instance, 'down'), '#808080')
    assert.equal(frvpHistogramOpacityPercent(instance, 'up'), 50)
    assert.equal(frvpHistogramOpacityPercent(instance, 'down'), 50)
    assert.deepEqual(frvpHistogramStyleForInstance(instance), frvpHistogramStyleDefaults())
  })

  it('keeps up and down colors and opacities independent per instance', () => {
    let instance = setFrvpInstanceHistogramColor(newInstance(), 'up', '#112233')
    instance = setFrvpInstanceHistogramColor(instance, 'down', '#445566')
    instance = setFrvpInstanceHistogramOpacityPercent(instance, 'up', 40)
    assert.equal(frvpHistogramColorInputValue(instance, 'up'), '#112233')
    assert.equal(frvpHistogramColorInputValue(instance, 'down'), '#445566')
    assert.equal(frvpHistogramOpacityPercent(instance, 'up'), 40)
    assert.equal(frvpHistogramOpacityPercent(instance, 'down'), 50)
  })

  it('drops invalid colors and out-of-range opacities without touching stored values', () => {
    const instance = newInstance()
    assert.equal(setFrvpInstanceHistogramColor(instance, 'up', 'not-a-color'), instance)
    assert.equal(setFrvpInstanceHistogramOpacityPercent(instance, 'up', 120), instance)
    assert.equal(setFrvpInstanceHistogramOpacityPercent(instance, 'up', Number.NaN), instance)
  })

  it('persists every explicit opacity choice, including the current default', () => {
    let instance = setFrvpInstanceHistogramOpacityPercent(newInstance(), 'down', 35)
    assert.equal(instance.histogramDownOpacityPercent, 35)

    // An explicit choice equal to the default must stay stored instead of being
    // deleted, otherwise it would silently follow a future default change.
    instance = setFrvpInstanceHistogramOpacityPercent(instance, 'down', 50)
    assert.equal(instance.histogramDownOpacityPercent, 50)
    assert.equal(frvpHistogramOpacityPercent(instance, 'down'), 50)

    // Previously saved explicit values keep resolving to themselves.
    instance = setFrvpInstanceHistogramOpacityPercent(instance, 'down', 100)
    assert.equal(instance.histogramDownOpacityPercent, 100)
    assert.equal(frvpHistogramOpacityPercent(instance, 'down'), 100)

    const reloaded = sanitizeOne(JSON.parse(JSON.stringify(instance)) as Record<string, unknown>)
    assert.equal(reloaded.histogramDownOpacityPercent, 100)
    assert.equal(frvpHistogramOpacityPercent(reloaded, 'down'), 100)
  })

  it('sanitizes persisted histogram fields and ignores invalid ones', () => {
    let instance = setFrvpInstanceHistogramColor(newInstance(), 'up', '#112233')
    instance = setFrvpInstanceHistogramColor(instance, 'down', '#445566')
    instance = setFrvpInstanceHistogramOpacityPercent(instance, 'up', 25)
    instance = setFrvpInstanceHistogramOpacityPercent(instance, 'down', 75)

    const reloaded = sanitizeOne(JSON.parse(JSON.stringify(instance)) as Record<string, unknown>)
    assert.deepEqual(frvpHistogramStyleForInstance(reloaded), {
      upColor: '#112233',
      downColor: '#445566',
      upOpacityPercent: 25,
      downOpacityPercent: 75,
    })

    const invalid = sanitizeOne({
      id: 'frvp-invalid-histogram',
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
      histogramUpColor: 'red',
      histogramDownColor: '#44556',
      histogramUpOpacityPercent: 120,
      histogramDownOpacityPercent: -5,
    })
    assert.equal(invalid.histogramUpColor, undefined)
    assert.equal(invalid.histogramDownColor, undefined)
    assert.equal(invalid.histogramUpOpacityPercent, undefined)
    assert.equal(invalid.histogramDownOpacityPercent, undefined)
  })

  it('feeds the resolved histogram style into the draw style', () => {
    let instance = setFrvpInstanceHistogramColor(newInstance(), 'up', '#112233')
    instance = setFrvpInstanceHistogramOpacityPercent(instance, 'up', 60)
    const styles = frvpDrawStyleForInstance(instance)
    assert.equal(styles.upColor, '#112233')
    assert.equal(styles.downColor, '#808080')
    assert.equal(styles.upOpacityPercent, 60)
    assert.equal(styles.downOpacityPercent, 50)
  })
})

describe('FRVP histogram Value-Area opacity', () => {
  it('renders the default 50% opacity split without custom settings', () => {
    const va = rowColors({ ...frvpHistogramStyleDefaults(), inValueArea: true })
    const outside = rowColors({ ...frvpHistogramStyleDefaults(), inValueArea: false })
    assert.equal(va.upColor, 'rgba(219, 219, 219, 0.275)')
    assert.equal(va.downColor, 'rgba(128, 128, 128, 0.275)')
    assert.equal(outside.upColor, 'rgba(219, 219, 219, 0.125)')
    assert.equal(outside.downColor, 'rgba(128, 128, 128, 0.125)')
  })

  it('keeps the Value-Area rows stronger than outside rows at every opacity', () => {
    for (const opacityPercent of [0, 10, 50, 75, 100]) {
      const va = rowColors({
        ...frvpHistogramStyleDefaults(),
        upOpacityPercent: opacityPercent,
        downOpacityPercent: opacityPercent,
        inValueArea: true,
      })
      const outside = rowColors({
        ...frvpHistogramStyleDefaults(),
        upOpacityPercent: opacityPercent,
        downOpacityPercent: opacityPercent,
        inValueArea: false,
      })
      assert.equal(
        fixedRangeVolumeProfileRowOpacityPercent(opacityPercent, true),
        (opacityPercent * 55) / 100,
      )
      assert.equal(
        fixedRangeVolumeProfileRowOpacityPercent(opacityPercent, false),
        (opacityPercent * 25) / 100,
      )
      if (opacityPercent > 0) {
        assert.ok(alphaOf(va.upColor) > alphaOf(outside.upColor))
        assert.ok(
          Math.abs(
            alphaOf(outside.upColor) / alphaOf(va.upColor) -
              FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY / FRVP_VALUE_AREA_ROW_OPACITY,
          ) < 1e-12,
        )
      }
    }
  })

  it('applies custom colors and per-direction opacities to the row bars', () => {
    const va = rowColors({
      upColor: '#112233',
      downColor: '#445566',
      upOpacityPercent: 50,
      downOpacityPercent: 100,
      inValueArea: true,
    })
    assert.equal(va.upColor, 'rgba(17, 34, 51, 0.275)')
    assert.equal(va.downColor, 'rgba(68, 85, 102, 0.55)')
  })

  it('clamps the configured opacity before folding it into the row colors', () => {
    const outside = rowColors({
      ...frvpHistogramStyleDefaults(),
      upOpacityPercent: -20,
      downOpacityPercent: 400,
      inValueArea: false,
    })
    assert.equal(outside.upColor, 'rgba(219, 219, 219, 0)')
    assert.equal(outside.downColor, 'rgba(128, 128, 128, 0.25)')
  })

  it('passes the histogram style through the instance draw model', () => {
    const model = buildFixedRangeVolumeProfileInstanceDrawModel({
      instanceId: 'frvp-1',
      fromTime: 100,
      toTime: 200,
      profile: {
        fromTime: 100,
        toTime: 199,
        candleCount: 1,
        profileLow: 100,
        profileHigh: 120,
        rowHeight: 1,
        rows: [row(), row({ priceLow: 110, priceHigh: 120, inValueArea: false })],
        totalVolume: 20,
        pocRowIndex: 0,
        pocPrice: 105,
        pocVolume: 10,
        vah: 110,
        val: 100,
        valueAreaVolume: 10,
        valueAreaPercentAchieved: 50,
      },
      barSpacing: 6,
      fromTimeToCoordinate: (time) => time / 10,
      toTimeToCoordinate: (time) => time / 10,
      priceToY: (price) => 500 - price,
      ...frvpDrawStyleForInstance(
        setFrvpInstanceHistogramOpacityPercent(
          setFrvpInstanceHistogramColor(newInstance(), 'up', '#112233'),
          'up',
          50,
        ),
      ),
    })
    if (!model) throw new Error('expected a draw model')
    assert.equal(model.rows.length, 2)
    // Rows keep their computed price order: 100–110 then 110–120.
    assert.equal(model.rows[0].upColor, 'rgba(17, 34, 51, 0.275)')
    assert.equal(model.rows[0].downColor, 'rgba(128, 128, 128, 0.275)')
    assert.equal(model.rows[1].upColor, 'rgba(17, 34, 51, 0.125)')
  })
})

describe('FRVP histogram width and row fill', () => {
  it('defaults to the exact legacy width and full row height', () => {
    const instance = newInstance()
    assert.equal(FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT, 100 / 6)
    assert.equal(FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT_INPUT, 16.7)
    assert.equal(FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT, 100)
    assert.equal(frvpHistogramWidthPercent(instance), 100 / 6)
    assert.equal(frvpHistogramWidthPercentInputValue(instance), 16.7)
    assert.equal(frvpHistogramBarHeightPercent(instance), 100)
    // Legacy records keep no new fields.
    assert.equal(instance.histogramWidthPercent, undefined)
    assert.equal(instance.histogramBarHeightPercent, undefined)
  })

  it('accepts only finite, bounded percentages and persists explicit defaults', () => {
    let instance = setFrvpInstanceHistogramWidthPercent(newInstance(), 40)
    instance = setFrvpInstanceHistogramBarHeightPercent(instance, 25)
    assert.equal(frvpHistogramWidthPercent(instance), 40)
    assert.equal(frvpHistogramBarHeightPercent(instance), 25)

    instance = setFrvpInstanceHistogramWidthPercent(instance, 16.7)
    instance = setFrvpInstanceHistogramBarHeightPercent(instance, 100)
    assert.equal(instance.histogramWidthPercent, 16.7)
    assert.equal(instance.histogramBarHeightPercent, 100)

    for (const invalid of [0, -1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(
        setFrvpInstanceHistogramWidthPercent(instance, invalid),
        instance,
      )
      assert.equal(
        setFrvpInstanceHistogramBarHeightPercent(instance, invalid),
        instance,
      )
    }
    assert.equal(isFrvpHistogramWidthPercent(FRVP_HISTOGRAM_MIN_WIDTH_PERCENT), true)
    assert.equal(isFrvpHistogramWidthPercent(FRVP_HISTOGRAM_MAX_WIDTH_PERCENT), true)
    assert.equal(isFrvpHistogramBarHeightPercent(FRVP_HISTOGRAM_MIN_BAR_HEIGHT_PERCENT), true)
    assert.equal(isFrvpHistogramBarHeightPercent(FRVP_HISTOGRAM_MAX_BAR_HEIGHT_PERCENT), true)
  })

  it('sanitizes stored bounds and leaves invalid/missing fields unset', () => {
    const valid = sanitizeOne({
      id: 'frvp-bars-valid',
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
      histogramWidthPercent: 42.5,
      histogramBarHeightPercent: 37,
    })
    assert.equal(valid.histogramWidthPercent, 42.5)
    assert.equal(valid.histogramBarHeightPercent, 37)

    const legacy = sanitizeOne({
      id: 'frvp-bars-legacy',
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
      histogramUpColor: '#112233',
    })
    assert.equal(legacy.histogramWidthPercent, undefined)
    assert.equal(legacy.histogramBarHeightPercent, undefined)
    assert.equal(frvpHistogramWidthPercent(legacy), 100 / 6)
    assert.equal(frvpHistogramBarHeightPercent(legacy), 100)

    for (const invalid of [0, -5, 101, Number.NaN, Number.POSITIVE_INFINITY, '50']) {
      const instance = sanitizeOne({
        id: 'frvp-bars-invalid',
        fromTime: 1_000,
        toTime: 2_000,
        selectionInterval: '1m',
        histogramWidthPercent: invalid,
        histogramBarHeightPercent: invalid,
      })
      assert.equal(instance.histogramWidthPercent, undefined)
      assert.equal(instance.histogramBarHeightPercent, undefined)
    }
  })

  it('round-trips explicit widths/heights and keeps them independent of colors', () => {
    let instance = setFrvpInstanceHistogramWidthPercent(newInstance(), 33)
    instance = setFrvpInstanceHistogramBarHeightPercent(instance, 42)
    instance = setFrvpInstanceHistogramColor(instance, 'up', '#112233')
    instance = setFrvpInstanceHistogramOpacityPercent(instance, 'up', 70)

    const reloaded = sanitizeOne(JSON.parse(JSON.stringify(instance)) as Record<string, unknown>)
    assert.equal(frvpHistogramWidthPercent(reloaded), 33)
    assert.equal(frvpHistogramBarHeightPercent(reloaded), 42)
    assert.equal(frvpHistogramColorInputValue(reloaded, 'up'), '#112233')
    assert.equal(frvpHistogramOpacityPercent(reloaded, 'up'), 70)

    const sanitizedRecord = sanitizeFrvpInstanceHistogramStyles(
      { histogramWidthPercent: 55 },
      newInstance(),
    )
    assert.equal(sanitizedRecord.histogramWidthPercent, 55)
  })
})
