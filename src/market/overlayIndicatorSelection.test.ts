import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  applyOverlayIndicatorSelection,
  isOverlayIndicatorSelectionRendered,
  isOverlayIndicatorSelectionTarget,
  overlayIndicatorSelectionHostSeries,
  overlayIndicatorSelectionLineSeries,
  resolveOverlayIndicatorSelectionTarget,
  sameOverlayIndicatorSelection,
  type OverlayIndicatorSelectionRenderState,
  type OverlayIndicatorSelectionTarget,
} from './overlayIndicatorSelection.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'

const emaFast = { id: 'ema-fast' }
const emaMid = { id: 'ema-mid' }
const emaSlow = { id: 'ema-slow' }
const ema100 = { id: 'ema100' }
const ema200 = { id: 'ema200' }
const dailyCenter = { id: 'daily-center' }
const dailyUpper = { id: 'daily-upper' }
const rsiSeries = { id: 'rsi' }
const rollingCenter = { id: 'rolling-center' }
const candleSeries = { id: 'candle' }

function buildBundle(): ChartSeriesBundle {
  const vwapBundle = (ordered: unknown[]) => ({ ordered, center: ordered[0], band: {} })
  return {
    candle: candleSeries,
    emas: [emaFast, emaMid, emaSlow],
    ema100,
    ema200,
    dailyVwap: vwapBundle([dailyCenter, dailyUpper]),
    weeklyVwap: vwapBundle([]),
    monthlyVwap: vwapBundle([]),
    quarterlyVwap: vwapBundle([]),
    yearlyVwap: vwapBundle([]),
    rollingVwaps: new Map([
      ['rolling-1', { ordered: [rollingCenter], band: {} }],
    ]),
    anchoredVwaps: new Map(),
    rsi: { series: rsiSeries },
  } as unknown as ChartSeriesBundle
}

function rollingInstance(overrides: Partial<RollingVwapInstance> = {}): RollingVwapInstance {
  return {
    id: 'rolling-1',
    enabled: true,
    ...overrides,
  } as unknown as RollingVwapInstance
}

function renderState(
  overrides: Partial<OverlayIndicatorSelectionRenderState> = {},
): OverlayIndicatorSelectionRenderState {
  return {
    activeIndicators: ['triple-ema', 'daily-vwap', 'rsi', 'aggregated-liquidations'],
    interval: '1h',
    loadedVwapLevel: 'daily',
    loadedVwapInterval: '1h',
    rollingVwapInstances: [rollingInstance()],
    ...overrides,
  }
}

describe('overlay indicator selection target', () => {
  it('accepts the overlay object kinds only', () => {
    assert.equal(isOverlayIndicatorSelectionTarget({ kind: 'market-indicator', indicatorId: 'rsi' }), true)
    assert.equal(isOverlayIndicatorSelectionTarget({ kind: 'rolling-vwap', instanceId: 'a' }), true)
    assert.equal(isOverlayIndicatorSelectionTarget({ kind: 'aggregated-liquidations' }), true)
    assert.equal(isOverlayIndicatorSelectionTarget({ kind: 'rectangle', instanceId: 'r' }), false)
    assert.equal(isOverlayIndicatorSelectionTarget({ kind: 'line', instanceId: 'l' }), false)
    assert.equal(
      isOverlayIndicatorSelectionTarget({ kind: 'fixed-range-volume-profile', instanceId: 'f' }),
      false,
    )
    assert.equal(isOverlayIndicatorSelectionTarget({ kind: 'anchored-vwap', instanceId: 'v' }), false)
    assert.equal(isOverlayIndicatorSelectionTarget(null), false)
  })

  it('never turns a drawing hit into an overlay selection', () => {
    assert.equal(resolveOverlayIndicatorSelectionTarget({ kind: 'line', instanceId: 'l' }), null)
    assert.deepEqual(
      resolveOverlayIndicatorSelectionTarget({ kind: 'market-indicator', indicatorId: 'triple-ema' }),
      { kind: 'market-indicator', indicatorId: 'triple-ema' },
    )
  })

  it('compares selections by object identity, not by object reference', () => {
    assert.equal(
      sameOverlayIndicatorSelection(
        { kind: 'market-indicator', indicatorId: 'rsi' },
        { kind: 'market-indicator', indicatorId: 'rsi' },
      ),
      true,
    )
    assert.equal(
      sameOverlayIndicatorSelection(
        { kind: 'market-indicator', indicatorId: 'rsi' },
        { kind: 'market-indicator', indicatorId: 'triple-ema' },
      ),
      false,
    )
    assert.equal(
      sameOverlayIndicatorSelection(
        { kind: 'rolling-vwap', instanceId: 'a' },
        { kind: 'rolling-vwap', instanceId: 'b' },
      ),
      false,
    )
    assert.equal(
      sameOverlayIndicatorSelection({ kind: 'aggregated-liquidations' }, { kind: 'aggregated-liquidations' }),
      true,
    )
    assert.equal(sameOverlayIndicatorSelection(null, { kind: 'aggregated-liquidations' }), false)
  })

  it('keeps the same state reference when the selection is unchanged', () => {
    const current: OverlayIndicatorSelectionTarget = { kind: 'market-indicator', indicatorId: 'rsi' }
    assert.equal(
      applyOverlayIndicatorSelection(current, { kind: 'market-indicator', indicatorId: 'rsi' }),
      current,
    )
    const next = applyOverlayIndicatorSelection(current, null)
    assert.equal(next, null)
    const reselected = applyOverlayIndicatorSelection(null, current)
    assert.equal(reselected, current)
  })
})

describe('overlay indicator selection lifetime', () => {
  it('clears when the indicator is toggled off', () => {
    const selection: OverlayIndicatorSelectionTarget = {
      kind: 'market-indicator',
      indicatorId: 'rsi',
    }
    assert.equal(isOverlayIndicatorSelectionRendered(selection, renderState()), true)
    assert.equal(
      isOverlayIndicatorSelectionRendered(selection, renderState({ activeIndicators: [] })),
      false,
    )
  })

  it('keeps EMA and RSI selections without a loaded VWAP context', () => {
    const state = renderState({ loadedVwapLevel: null, loadedVwapInterval: null })
    assert.equal(
      isOverlayIndicatorSelectionRendered({ kind: 'market-indicator', indicatorId: 'triple-ema' }, state),
      true,
    )
    assert.equal(
      isOverlayIndicatorSelectionRendered({ kind: 'market-indicator', indicatorId: 'rsi' }, state),
      true,
    )
  })

  it('requires the VWAP context level that renders a time-based VWAP', () => {
    const selection: OverlayIndicatorSelectionTarget = {
      kind: 'market-indicator',
      indicatorId: 'daily-vwap',
    }
    assert.equal(isOverlayIndicatorSelectionRendered(selection, renderState()), true)
    assert.equal(
      isOverlayIndicatorSelectionRendered(
        selection,
        renderState({ loadedVwapLevel: null, loadedVwapInterval: null }),
      ),
      false,
    )
    assert.equal(
      isOverlayIndicatorSelectionRendered(
        selection,
        renderState({ loadedVwapInterval: '4h' }),
      ),
      false,
    )
  })

  it('clears rolling VWAP selection when the instance is disabled or removed', () => {
    const selection: OverlayIndicatorSelectionTarget = {
      kind: 'rolling-vwap',
      instanceId: 'rolling-1',
    }
    assert.equal(isOverlayIndicatorSelectionRendered(selection, renderState()), true)
    assert.equal(
      isOverlayIndicatorSelectionRendered(
        selection,
        renderState({ rollingVwapInstances: [rollingInstance({ enabled: false })] }),
      ),
      false,
    )
    assert.equal(
      isOverlayIndicatorSelectionRendered(selection, renderState({ rollingVwapInstances: [] })),
      false,
    )
  })

  it('clears the liquidations selection when its indicator is toggled off', () => {
    const selection: OverlayIndicatorSelectionTarget = { kind: 'aggregated-liquidations' }
    assert.equal(isOverlayIndicatorSelectionRendered(selection, renderState()), true)
    assert.equal(
      isOverlayIndicatorSelectionRendered(
        selection,
        renderState({ activeIndicators: ['triple-ema'] }),
      ),
      false,
    )
  })

  it('treats an empty selection as always renderable', () => {
    assert.equal(isOverlayIndicatorSelectionRendered(null, renderState({ activeIndicators: [] })), true)
  })
})

describe('overlay indicator selection chart series', () => {
  const bundle = buildBundle()

  it('resolves the line series each overlay indicator renders', () => {
    assert.deepEqual(
      overlayIndicatorSelectionLineSeries(
        bundle,
        { kind: 'market-indicator', indicatorId: 'triple-ema' },
        [],
      ),
      [emaFast, emaMid, emaSlow],
    )
    assert.deepEqual(
      overlayIndicatorSelectionLineSeries(
        bundle,
        { kind: 'market-indicator', indicatorId: 'dual-ema' },
        [],
      ),
      [ema100, ema200],
    )
    assert.deepEqual(
      overlayIndicatorSelectionLineSeries(
        bundle,
        { kind: 'market-indicator', indicatorId: 'daily-vwap' },
        [],
      ),
      [dailyCenter, dailyUpper],
    )
    assert.deepEqual(
      overlayIndicatorSelectionLineSeries(
        bundle,
        { kind: 'market-indicator', indicatorId: 'rsi' },
        [],
      ),
      [rsiSeries],
    )
  })

  it('resolves rolling VWAP lines only while the instance is enabled', () => {
    const selection: OverlayIndicatorSelectionTarget = {
      kind: 'rolling-vwap',
      instanceId: 'rolling-1',
    }
    assert.deepEqual(
      overlayIndicatorSelectionLineSeries(bundle, selection, [rollingInstance()]),
      [rollingCenter],
    )
    assert.deepEqual(
      overlayIndicatorSelectionLineSeries(bundle, selection, [
        rollingInstance({ enabled: false }),
      ]),
      [],
    )
  })

  it('has no line series for the bar-based liquidations overlay or without a bundle', () => {
    assert.deepEqual(
      overlayIndicatorSelectionLineSeries(bundle, { kind: 'aggregated-liquidations' }, []),
      [],
    )
    assert.deepEqual(overlayIndicatorSelectionLineSeries(null, { kind: 'market-indicator', indicatorId: 'rsi' }, []), [])
  })

  it('attaches the halo to the pane host series', () => {
    assert.equal(
      overlayIndicatorSelectionHostSeries(bundle, { kind: 'market-indicator', indicatorId: 'rsi' }),
      rsiSeries,
    )
    assert.equal(
      overlayIndicatorSelectionHostSeries(bundle, { kind: 'market-indicator', indicatorId: 'triple-ema' }),
      candleSeries,
    )
    assert.equal(
      overlayIndicatorSelectionHostSeries(bundle, { kind: 'rolling-vwap', instanceId: 'rolling-1' }),
      candleSeries,
    )
    assert.equal(
      overlayIndicatorSelectionHostSeries(bundle, { kind: 'aggregated-liquidations' }),
      null,
    )
    assert.equal(overlayIndicatorSelectionHostSeries(null, null), null)
  })
})
