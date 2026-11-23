/**
 * Real installed-lightweight-charts harness for the consolidated Rolling VWAP
 * band primitive (#262).
 *
 * Two charts receive the identical candles, points, viewport and price scale:
 *
 * - `base` reproduces the pre-#262 native shape: one centre `LineSeries`, six
 *   band `LineSeries` and three shared fill primitives attached to the centre.
 *   This reference lives only in the harness; production no longer creates it.
 * - `consolidated` is the production bundle: one centre `LineSeries` plus ONE
 *   band primitive (six outlines, three fills, band halo).
 *
 * Both charts are captured from their own canvases and compared pixel by pixel,
 * and native `update()` / `setData()` calls are counted inside the public
 * series methods. No wall-clock budget is asserted: counts and same-input
 * comparisons are the evidence; handler timings are only reported.
 */
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  PriceScaleMode,
  type CandlestickData,
  type IChartApi,
  type IPriceScaleApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  attachSessionVwapBandSeriesPrimitive,
  type SessionVwapBandSeriesAttachment,
} from '../../src/market/sessionVwapBandSeriesPrimitive.ts'
import {
  applyRollingVwapLiveFromCandles,
  createRollingVwapChartSeriesBundle,
  rollingVwapPointsToLineData,
  setRollingVwapChartSeriesData,
  setRollingVwapInstanceSeriesVisibility,
  type RollingVwapChartSeriesBundle,
} from '../../src/market/rollingVwapChartSeries.ts'
import {
  projectRollingVwapBandOutlineValue,
  resolveRollingVwapBandPrimitiveStyle,
  resolveRollingVwapBandProjection,
  ROLLING_VWAP_BAND_PAIR_VALUE_KEYS,
  ROLLING_VWAP_BAND_VALUE_KEYS,
  type RollingVwapBandPairKey,
  type RollingVwapBandPriceMode,
  type RollingVwapBandValueKey,
} from '../../src/market/rollingVwapBandRenderGeometry.ts'
import {
  computeRollingVwapPointsForSettings,
  createDefaultRollingVwapSettings,
  rollingVwapCenterLineRgbaColor,
  type RollingVwapSettings,
} from '../../src/market/rollingVwapSettings.ts'
import {
  rollingVwapInstancePeriodLabel,
  type RollingVwapInstance,
} from '../../src/market/rollingVwapInstances.ts'
import type { RollingVwapPoint } from '../../src/market/rollingVwap.ts'
import type { MarketCandle } from '../../src/market/types.ts'
import { computeEmaLine } from '../../src/market/ema.ts'
import { lineChartStrokeStyleToChartLineStyle } from '../../src/market/lineChartStroke.ts'

const INTERVAL = '1m' as const
const STEP_SECONDS = 60
const START_TIME = 1_650_000_000
const CHART_WIDTH = 880
const CHART_HEIGHT = 500
const EMA_PERIODS = [9, 21, 50, 100, 200]

export type RollingVwapHarnessConfig = {
  n: number
  visible: number
  instanceCount: number
  multipliers: [number, number, number]
  bandOpacities: [number, number, number]
  bandLineStyles: ['solid' | 'dotted', 'solid' | 'dotted', 'solid' | 'dotted']
  bandLineWidths: [number, number, number]
  fillOpacity: number
  gap: boolean
  markers: number
  fullPanel: boolean
  enabled: boolean
}

const DEFAULT_CONFIG: RollingVwapHarnessConfig = {
  n: 2_000,
  visible: 39,
  instanceCount: 1,
  multipliers: [1, 2, 3],
  bandOpacities: [60, 60, 60],
  bandLineStyles: ['solid', 'solid', 'solid'],
  bandLineWidths: [1, 1, 1],
  fillOpacity: 15,
  gap: false,
  markers: 0,
  fullPanel: false,
  enabled: true,
}

type NativeBands = Record<RollingVwapBandValueKey, ISeriesApi<'Line'>>
type NativeFills = Record<RollingVwapBandPairKey, SessionVwapBandSeriesAttachment>

type InstanceSide = {
  instance: RollingVwapInstance
  settings: RollingVwapSettings
  center: ISeriesApi<'Line'>
  bands: NativeBands | null
  fills: NativeFills | null
  bundle: RollingVwapChartSeriesBundle | null
  points: RollingVwapPoint[]
}

type ChartSide = {
  chart: IChartApi
  candle: ISeriesApi<'Candlestick'>
  rolling: InstanceSide[]
  emas: ISeriesApi<'Line'>[]
  updateCount: number
  setDataCount: number
}

type HarnessState = {
  config: RollingVwapHarnessConfig
  candles: MarketCandle[]
  instances: RollingVwapInstance[]
  settings: RollingVwapSettings[]
  base: ChartSide | null
  consolidated: ChartSide | null
}

const state: HarnessState = {
  config: { ...DEFAULT_CONFIG },
  candles: [],
  instances: [],
  settings: [],
  base: null,
  consolidated: null,
}

// ---------------------------------------------------------------------------
// Deterministic candles and helpers

function makeCandles(count: number, startTime = START_TIME, seed = 42): MarketCandle[] {
  let value = 30_000
  let random = seed >>> 0
  const next = () => {
    random = (1664525 * random + 1013904223) >>> 0
    return random / 0x1_0000_0000
  }
  const candles: MarketCandle[] = []
  for (let index = 0; index < count; index += 1) {
    const drift = (next() - 0.5) * 120
    const open = value
    value = Math.max(1_000, value + drift)
    const close = value
    const high = Math.max(open, close) + next() * 40
    const low = Math.min(open, close) - next() * 40
    candles.push({
      symbol: 'BTCUSDT',
      interval: INTERVAL,
      time: startTime + index * STEP_SECONDS,
      open,
      high,
      low,
      close,
      volume: 1 + next() * 10,
      closed: true,
    })
  }
  return candles
}

function toCandlePoint(candle: MarketCandle): CandlestickData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

function bandFillPoints(
  points: readonly RollingVwapPoint[],
  band: RollingVwapBandPairKey,
): { time: number; upper1: number | null; lower1: number | null }[] {
  const keys = ROLLING_VWAP_BAND_PAIR_VALUE_KEYS[band]
  return points.map((point) => ({
    time: point.time,
    upper1: point[keys.upper],
    lower1: point[keys.lower],
  }))
}

function bandVisible(settings: RollingVwapSettings, instance: RollingVwapInstance, band: RollingVwapBandPairKey): boolean {
  if (!instance.enabled) return false
  const multiplier =
    band === 'band1'
      ? settings.multipliers.multiplier1
      : band === 'band2'
        ? settings.multipliers.multiplier2
        : settings.multipliers.multiplier3
  return multiplier > 0
}

function makeSettings(config: RollingVwapHarnessConfig): RollingVwapSettings {
  const settings = createDefaultRollingVwapSettings()
  settings.multipliers = {
    multiplier1: config.multipliers[0],
    multiplier2: config.multipliers[1],
    multiplier3: config.multipliers[2],
  }
  settings.bandOpacities = {
    band1: config.bandOpacities[0],
    band2: config.bandOpacities[1],
    band3: config.bandOpacities[2],
  }
  settings.bandLineStyles = {
    band1: config.bandLineStyles[0],
    band2: config.bandLineStyles[1],
    band3: config.bandLineStyles[2],
  }
  settings.bandLineWidths = {
    band1: config.bandLineWidths[0],
    band2: config.bandLineWidths[1],
    band3: config.bandLineWidths[2],
  }
  settings.fillOpacity = config.fillOpacity
  return settings
}

function makeInstances(config: RollingVwapHarnessConfig, settings: RollingVwapSettings): RollingVwapInstance[] {
  return Array.from({ length: config.instanceCount }, (_, index) => ({
    id: `rv-${index + 1}`,
    enabled: config.enabled,
    settings,
    displaySequence: index + 1,
  }))
}

function chartOptions() {
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    layout: {
      background: { type: ColorType.Solid, color: '#FFFFFF' },
      textColor: '#111111',
      attributionLogo: false,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: false },
    },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, rightOffset: 0 },
    crosshair: {
      mode: 2,
      vertLine: { visible: false, labelVisible: false },
      horzLine: { visible: false, labelVisible: false },
    },
  }
}

function resetContainers() {
  for (const id of ['base', 'consolidated']) {
    const element = document.getElementById(id)
    if (element) element.innerHTML = ''
  }
}

function wrapSeries(series: ISeriesApi<'Line'>, side: ChartSide): void {
  const update = series.update.bind(series) as (point: unknown) => void
  const setData = series.setData.bind(series) as (data: unknown) => void
  ;(series as unknown as { update: (point: unknown) => void }).update = (point) => {
    side.updateCount += 1
    update(point)
  }
  ;(series as unknown as { setData: (data: unknown) => void }).setData = (data) => {
    side.setDataCount += 1
    setData(data)
  }
}

function createCommonSide(container: HTMLElement, config: RollingVwapHarnessConfig): ChartSide {
  const chart = createChart(container, chartOptions())
  const candle = chart.addSeries(CandlestickSeries, {
    upColor: '#DBDBDB',
    downColor: '#808080',
    wickUpColor: '#DBDBDB',
    wickDownColor: '#808080',
    borderVisible: false,
  })
  candle.setData(state.candles.map(toCandlePoint))

  if (config.markers > 0) {
    const markers: SeriesMarker<Time>[] = Array.from({ length: config.markers }, (_, index) => {
      const candleIndex = Math.min(
        state.candles.length - 1,
        Math.round((index / config.markers) * (state.candles.length - 1)),
      )
      return {
        time: state.candles[candleIndex].time as UTCTimestamp,
        position: index % 2 === 0 ? ('aboveBar' as const) : ('belowBar' as const),
        color: index % 2 === 0 ? '#22C55E' : '#EF4444',
        shape: index % 2 === 0 ? ('arrowDown' as const) : ('arrowUp' as const),
        text: '',
      }
    })
    createSeriesMarkers(candle, markers)
  }

  const emas: ISeriesApi<'Line'>[] = []
  if (config.fullPanel) {
    for (const period of EMA_PERIODS) {
      const series = chart.addSeries(LineSeries, {
        color: '#A3A3A3',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        title: '',
      })
      const line = computeEmaLine(state.candles, period)
      series.setData(line.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })))
      emas.push(series)
    }
  }

  return {
    chart,
    candle,
    rolling: [],
    emas,
    updateCount: 0,
    setDataCount: 0,
  }
}

// ---------------------------------------------------------------------------
// Native reference (pre-#262 shape) — harness only

function createBaseSide(
  container: HTMLElement,
  config: RollingVwapHarnessConfig,
): ChartSide {
  const side = createCommonSide(container, config)
  for (let index = 0; index < config.instanceCount; index += 1) {
    const settings = state.settings[index]
    const instance = state.instances[index]
    const points = computeRollingVwapPointsForSettings(state.candles, INTERVAL, settings)
    if (config.gap) {
      const gapIndex = Math.max(1, points.length - 5)
      points[gapIndex] = { ...points[gapIndex], upper1: null, lower1: null }
    }

    const label = rollingVwapInstancePeriodLabel(instance, INTERVAL)
    const center = side.chart.addSeries(LineSeries, {
      color: rollingVwapCenterLineRgbaColor(settings.lineColor, settings.lineOpacity),
      lineWidth: settings.lineWidth,
      lineStyle: lineChartStrokeStyleToChartLineStyle(settings.lineStyle),
      title: label,
      lastValueVisible: instance.enabled,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      pointMarkersVisible: false,
      visible: instance.enabled,
    })
    center.setData(rollingVwapPointsToLineData(points, 'vwap'))
    wrapSeries(center, side)

    const style = resolveRollingVwapBandPrimitiveStyle(settings)
    const bands = {} as NativeBands
    for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
      const band: RollingVwapBandPairKey =
        key === 'upper1' || key === 'lower1'
          ? 'band1'
          : key === 'upper2' || key === 'lower2'
            ? 'band2'
            : 'band3'
      const series = side.chart.addSeries(LineSeries, {
        color: style.outlines[key].color,
        lineWidth: style.outlines[key].widthPx,
        lineStyle: lineChartStrokeStyleToChartLineStyle(style.outlines[key].lineStyle),
        lastValueVisible: false,
        priceLineVisible: false,
        title: '',
        crosshairMarkerVisible: false,
        pointMarkersVisible: false,
        visible: bandVisible(settings, instance, band),
      })
      series.setData(rollingVwapPointsToLineData(points, key))
      bands[key] = series
      wrapSeries(series, side)
    }

    const fills = {} as NativeFills
    for (const band of ['band1', 'band2', 'band3'] as const) {
      fills[band] = attachSessionVwapBandSeriesPrimitive(center, {
        points: bandFillPoints(points, band),
        visible: bandVisible(settings, instance, band),
        fillStyle: style.fillStyle,
      })
    }

    side.rolling.push({ instance, settings, center, bands, fills, bundle: null, points })
  }
  return side
}

// ---------------------------------------------------------------------------
// Consolidated production bundle

function createConsolidatedSide(
  container: HTMLElement,
  config: RollingVwapHarnessConfig,
): ChartSide {
  const side = createCommonSide(container, config)
  for (let index = 0; index < config.instanceCount; index += 1) {
    const settings = state.settings[index]
    const instance = state.instances[index]
    const points = computeRollingVwapPointsForSettings(state.candles, INTERVAL, settings)
    if (config.gap) {
      const gapIndex = Math.max(1, points.length - 5)
      points[gapIndex] = { ...points[gapIndex], upper1: null, lower1: null }
    }

    const bundle = createRollingVwapChartSeriesBundle(side.chart, settings, {
      title: rollingVwapInstancePeriodLabel(instance, INTERVAL),
      lineWidth: settings.lineWidth,
      lineColor: settings.lineColor,
      lineOpacity: settings.lineOpacity,
      lineStyle: settings.lineStyle,
    })
    wrapSeries(bundle.center, side)
    setRollingVwapInstanceSeriesVisibility(bundle, instance, INTERVAL)
    setRollingVwapChartSeriesData(bundle, points)

    side.rolling.push({
      instance,
      settings,
      center: bundle.center,
      bands: null,
      fills: null,
      bundle,
      points,
    })
  }
  return side
}

// ---------------------------------------------------------------------------
// Candle/point application

function applyBaseLive(side: ChartSide, rolling: InstanceSide): void {
  if (!rolling.bands || !rolling.fills) return
  const points = computeRollingVwapPointsForSettings(
    state.candles,
    INTERVAL,
    rolling.settings,
  )
  if (points.length === 0) return
  const last = points[points.length - 1]
  rolling.center.update(rollingVwapPointsToLineData([last], 'vwap')[0])
  for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
    rolling.bands[key].update(rollingVwapPointsToLineData([last], key)[0])
  }
  for (const band of ['band1', 'band2', 'band3'] as const) {
    rolling.fills[band].updateBandData(bandFillPoints(points, band))
  }
}

function applyConsolidatedLive(rolling: InstanceSide): void {
  if (!rolling.bundle) return
  applyRollingVwapLiveFromCandles(state.candles, rolling.bundle, INTERVAL, rolling.settings)
}

function applySideTick(side: ChartSide, variant: 'base' | 'consolidated'): void {
  const last = state.candles[state.candles.length - 1]
  side.candle.update(toCandlePoint(last))
  if (side.emas.length > 0) {
    for (let emaIndex = 0; emaIndex < side.emas.length; emaIndex += 1) {
      const line = computeEmaLine(state.candles, EMA_PERIODS[emaIndex])
      if (line.length === 0) continue
      const point = line[line.length - 1]
      side.emas[emaIndex].update({ time: last.time as UTCTimestamp, value: point.value })
    }
  }
  // Every enabled instance updates on a tick, exactly like the panel.
  for (const rolling of side.rolling) {
    if (!rolling.instance.enabled) continue
    if (variant === 'base') applyBaseLive(side, rolling)
    else applyConsolidatedLive(rolling)
  }
}

function mutateLastCandle(index: number): void {
  const last = state.candles[state.candles.length - 1]
  const delta = Math.sin(index / 3) * 25
  last.close = Math.max(1_000, last.close + delta)
  last.high = Math.max(last.high, last.close + 5)
  last.low = Math.min(last.low, last.close - 5)
}

// ---------------------------------------------------------------------------
// Style / visibility / scale

function applySideStyle(side: ChartSide, variant: 'base' | 'consolidated'): void {
  for (const rolling of side.rolling) {
    const { settings, instance } = rolling
    if (variant === 'base') {
      if (!rolling.bands || !rolling.fills) continue
      const style = resolveRollingVwapBandPrimitiveStyle(settings)
      rolling.center.applyOptions({
        color: rollingVwapCenterLineRgbaColor(settings.lineColor, settings.lineOpacity),
        lineWidth: settings.lineWidth,
        lineStyle: lineChartStrokeStyleToChartLineStyle(settings.lineStyle),
        title: rollingVwapInstancePeriodLabel(instance, INTERVAL),
        lastValueVisible: instance.enabled,
        visible: instance.enabled,
      })
      for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
        const band: RollingVwapBandPairKey =
          key === 'upper1' || key === 'lower1'
            ? 'band1'
            : key === 'upper2' || key === 'lower2'
              ? 'band2'
              : 'band3'
        rolling.bands[key].applyOptions({
          color: style.outlines[key].color,
          lineWidth: style.outlines[key].widthPx,
          lineStyle: lineChartStrokeStyleToChartLineStyle(style.outlines[key].lineStyle),
          visible: bandVisible(settings, instance, band),
        })
      }
      for (const band of ['band1', 'band2', 'band3'] as const) {
        rolling.fills[band].setFillStyle(style.fillStyle)
        rolling.fills[band].setBandVisible(bandVisible(settings, instance, band))
      }
    } else if (rolling.bundle) {
      rolling.bundle.bands.setStyle(resolveRollingVwapBandPrimitiveStyle(settings))
      rolling.bundle.center.applyOptions({
        color: rollingVwapCenterLineRgbaColor(settings.lineColor, settings.lineOpacity),
        lineWidth: settings.lineWidth,
        lineStyle: lineChartStrokeStyleToChartLineStyle(settings.lineStyle),
      })
      setRollingVwapInstanceSeriesVisibility(rolling.bundle, instance, INTERVAL)
    }
  }
}

function applyScaleTo(
  side: ChartSide,
  options: {
    mode?: PriceScaleMode
    invert?: boolean
    autoScale?: boolean
    margins?: { top: number; bottom: number } | null
    range?: { from: number; to: number } | null
  },
): void {
  const scale: IPriceScaleApi = side.chart.priceScale('right')
  scale.applyOptions({
    mode: options.mode ?? PriceScaleMode.Normal,
    invertScale: options.invert === true,
    scaleMargins: options.margins ?? { top: 0.1, bottom: 0.1 },
  })
  scale.setAutoScale(options.autoScale !== false && options.range === undefined)
  if (options.range) scale.setVisibleRange(options.range)
}

// ---------------------------------------------------------------------------
// Pixel comparison

function capture(container: HTMLElement): ImageData {
  const target = document.createElement('canvas')
  target.width = container.clientWidth
  target.height = container.clientHeight
  const context = target.getContext('2d')
  if (!context) throw new Error('no 2d context')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, target.width, target.height)
  const containerRect = container.getBoundingClientRect()
  for (const canvas of container.querySelectorAll('canvas')) {
    const rect = canvas.getBoundingClientRect()
    context.drawImage(
      canvas,
      Math.round(rect.left - containerRect.left),
      Math.round(rect.top - containerRect.top),
      Math.round(rect.width),
      Math.round(rect.height),
    )
  }
  return context.getImageData(0, 0, target.width, target.height)
}

function compareSides(): {
  total: number
  diff: number
  structural: number
  ink: [number, number]
  maxDelta: number
} {
  if (!state.base || !state.consolidated) throw new Error('charts not created')
  const base = capture(document.getElementById('base') as HTMLElement)
  const consolidated = capture(document.getElementById('consolidated') as HTMLElement)
  if (base.width !== consolidated.width || base.height !== consolidated.height) {
    throw new Error('canvas size mismatch')
  }
  let diff = 0
  let structural = 0
  let inkBase = 0
  let inkConsolidated = 0
  let maxDelta = 0
  for (let index = 0; index < base.data.length; index += 4) {
    const dr = Math.abs(base.data[index] - consolidated.data[index])
    const dg = Math.abs(base.data[index + 1] - consolidated.data[index + 1])
    const db = Math.abs(base.data[index + 2] - consolidated.data[index + 2])
    const delta = Math.max(dr, dg, db)
    if (delta > 0) diff += 1
    if (delta > 32) structural += 1
    if (delta > maxDelta) maxDelta = delta
    if (base.data[index] < 245 || base.data[index + 1] < 245 || base.data[index + 2] < 245) {
      inkBase += 1
    }
    if (
      consolidated.data[index] < 245 ||
      consolidated.data[index + 1] < 245 ||
      consolidated.data[index + 2] < 245
    ) {
      inkConsolidated += 1
    }
  }
  return {
    total: base.width * base.height,
    diff,
    structural,
    ink: [inkBase, inkConsolidated],
    maxDelta,
  }
}

// ---------------------------------------------------------------------------
// Frame and update counters

let rafFrames = 0
let countersInstalled = false
let primitiveBaseline: Array<{ invalidations: number; rebuilds: number }> = []

function installCounters(): void {
  if (countersInstalled) return
  countersInstalled = true
  const original = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return original((time) => {
      rafFrames += 1
      callback(time)
    })
  }
}

function primitiveStats() {
  const stats = []
  for (const side of [state.base, state.consolidated]) {
    if (!side) continue
    for (const rolling of side.rolling) {
      if (rolling.bundle) stats.push(rolling.bundle.bands.stats())
    }
  }
  return stats
}

function resetCounters(): void {
  for (const side of [state.base, state.consolidated]) {
    if (!side) continue
    side.updateCount = 0
    side.setDataCount = 0
  }
  rafFrames = 0
  primitiveBaseline = primitiveStats().map((item) => ({
    invalidations: item.invalidations,
    rebuilds: item.rebuilds,
  }))
}

function stats() {
  const consolidatedStats = primitiveStats()
  return {
    devicePixelRatio: window.devicePixelRatio,
    rafFrames,
    base: state.base
      ? { updates: state.base.updateCount, setData: state.base.setDataCount }
      : null,
    consolidated: state.consolidated
      ? {
          updates: state.consolidated.updateCount,
          setData: state.consolidated.setDataCount,
        }
      : null,
    primitive: consolidatedStats.map((item, index) => ({
      ...item,
      invalidations: item.invalidations - (primitiveBaseline[index]?.invalidations ?? 0),
      rebuilds: item.rebuilds - (primitiveBaseline[index]?.rebuilds ?? 0),
    })),
    candles: state.candles.length,
    points: state.consolidated?.rolling[0]?.points.length ?? 0,
    visibleRange: state.consolidated?.chart.timeScale().getVisibleRange() ?? null,
    logicalRange: state.consolidated?.chart.timeScale().getVisibleLogicalRange() ?? null,
    barSpacing: state.consolidated?.chart.timeScale().options().barSpacing ?? 0,
    priceRange: state.consolidated
      ? state.consolidated.chart.priceScale('right').getVisibleRange()
      : null,
    basePriceRange: state.base ? state.base.chart.priceScale('right').getVisibleRange() : null,
  }
}

function priceMode(): RollingVwapBandPriceMode {
  const mode = state.consolidated?.chart.priceScale('right').options().mode
  if (mode === PriceScaleMode.Percentage) return 'percentage'
  if (mode === PriceScaleMode.IndexedTo100) return 'indexed-to-100'
  return 'absolute'
}

function bandCoordinates() {
  const baseSide = state.base
  const consolidatedSide = state.consolidated
  if (!baseSide || !consolidatedSide) throw new Error('missing charts')
  const baseRolling = baseSide.rolling[0]
  const consolidatedRolling = consolidatedSide.rolling[0]
  if (!baseRolling?.bands || !consolidatedRolling) throw new Error('missing rolling')
  const points = consolidatedRolling.points
  const range = consolidatedSide.chart.timeScale().getVisibleRange()
  if (!range || typeof range.from !== 'number') throw new Error('no visible range')
  const projection = resolveRollingVwapBandProjection({
    mode: priceMode(),
    points,
    fromTime: range.from,
  })
  const first = Math.max(0, points.findIndex((point) => point.time >= (range.from as number)))
  const point = points[Math.min(points.length - 1, first + 5)]
  return ROLLING_VWAP_BAND_VALUE_KEYS.map((key) => {
    const band: RollingVwapBandPairKey =
      key === 'upper1' || key === 'lower1'
        ? 'band1'
        : key === 'upper2' || key === 'lower2'
          ? 'band2'
          : 'band3'
    const visible = bandVisible(consolidatedRolling.settings, consolidatedRolling.instance, band)
    const value = point[key]
    if (!visible) {
      return { key, value, projected: null, baseY: null, consolidatedY: null, delta: null }
    }
    const baseY = value === null ? null : baseRolling.bands![key].priceToCoordinate(value)
    const projected = projectRollingVwapBandOutlineValue(projection, key, value)
    const consolidatedY =
      projected === null ? null : consolidatedRolling.center.priceToCoordinate(projected)
    return {
      key,
      value,
      projected,
      baseY,
      consolidatedY,
      delta: baseY === null || consolidatedY === null ? null : Math.abs(baseY - consolidatedY),
    }
  })
}

function coordinateProbe(prices: number[]) {
  if (!state.base || !state.consolidated) throw new Error('missing charts')
  return prices.map((price) => ({
    price,
    base: state.base!.candle.priceToCoordinate(price),
    consolidated: state.consolidated!.candle.priceToCoordinate(price),
  }))
}

function pointSnapshot() {
  const points = state.consolidated?.rolling[0]?.bundle?.bands.getPoints()
  return points ? points.map((point) => ({ ...point })) : null
}

// ---------------------------------------------------------------------------
// API

async function create(config: Partial<RollingVwapHarnessConfig> = {}): Promise<void> {
  installCounters()
  destroy()
  resetContainers()
  const next = { ...DEFAULT_CONFIG, ...config }
  state.config = next
  state.candles = makeCandles(next.n)
  state.settings = Array.from({ length: next.instanceCount }, () => makeSettings(next))
  state.instances = makeInstances(next, state.settings[0])

  state.base = createBaseSide(document.getElementById('base') as HTMLElement, next)
  state.consolidated = createConsolidatedSide(
    document.getElementById('consolidated') as HTMLElement,
    next,
  )

  const from = Math.max(0, next.n - next.visible)
  for (const side of [state.base, state.consolidated]) {
    side.chart.timeScale().setVisibleLogicalRange({ from, to: next.n - 1 })
  }
  resetCounters()
  await waitFrames(4)
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count
    const step = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tick(count = 1): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    mutateLastCandle(index)
    if (state.base) applySideTick(state.base, 'base')
    if (state.consolidated) applySideTick(state.consolidated, 'consolidated')
  }
  await waitFrames(2)
}

async function setRange(from: number, to: number): Promise<void> {
  for (const side of [state.base, state.consolidated]) {
    side?.chart.timeScale().setVisibleLogicalRange({ from, to })
  }
  await waitFrames(3)
}

async function setScale(options: Parameters<typeof applyScaleTo>[1]): Promise<void> {
  for (const side of [state.base, state.consolidated]) {
    if (side) applyScaleTo(side, options)
  }
  await waitFrames(4)
}

async function setVisibility(
  enabled: boolean,
  multipliers?: [number, number, number],
): Promise<void> {
  state.instances[0].enabled = enabled
  if (multipliers) {
    state.instances[0].settings.multipliers = {
      multiplier1: multipliers[0],
      multiplier2: multipliers[1],
      multiplier3: multipliers[2],
    }
  }
  if (state.base) {
    for (const rolling of state.base.rolling) {
      if (!rolling.bands || !rolling.fills) continue
      const { settings, instance } = rolling
      rolling.center.applyOptions({
        visible: instance.enabled,
        lastValueVisible: instance.enabled,
      })
      for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
        const band: RollingVwapBandPairKey =
          key === 'upper1' || key === 'lower1'
            ? 'band1'
            : key === 'upper2' || key === 'lower2'
              ? 'band2'
              : 'band3'
        rolling.bands[key].applyOptions({ visible: bandVisible(settings, instance, band) })
      }
      for (const band of ['band1', 'band2', 'band3'] as const) {
        rolling.fills[band].setBandVisible(bandVisible(settings, instance, band))
      }
    }
  }
  if (state.consolidated) {
    for (const rolling of state.consolidated.rolling) {
      if (rolling.bundle) {
        setRollingVwapInstanceSeriesVisibility(rolling.bundle, rolling.instance, INTERVAL)
      }
    }
  }
  await waitFrames(3)
}

async function setStyle(patch: {
  bandOpacities?: [number, number, number]
  bandLineStyles?: ['solid' | 'dotted', 'solid' | 'dotted', 'solid' | 'dotted']
  bandLineWidths?: [number, number, number]
  fillOpacity?: number
}): Promise<void> {
  if (patch.bandOpacities) {
    state.instances[0].settings.bandOpacities = {
      band1: patch.bandOpacities[0],
      band2: patch.bandOpacities[1],
      band3: patch.bandOpacities[2],
    }
  }
  if (patch.bandLineStyles) {
    state.instances[0].settings.bandLineStyles = {
      band1: patch.bandLineStyles[0],
      band2: patch.bandLineStyles[1],
      band3: patch.bandLineStyles[2],
    }
  }
  if (patch.bandLineWidths) {
    state.instances[0].settings.bandLineWidths = {
      band1: patch.bandLineWidths[0],
      band2: patch.bandLineWidths[1],
      band3: patch.bandLineWidths[2],
    }
  }
  if (patch.fillOpacity !== undefined) state.instances[0].settings.fillOpacity = patch.fillOpacity
  if (state.base) applySideStyle(state.base, 'base')
  if (state.consolidated) applySideStyle(state.consolidated, 'consolidated')
  await waitFrames(3)
}

async function prependCandles(
  count: number,
  variant?: 'base' | 'consolidated',
): Promise<void> {
  const first = state.candles[0]
  const older = makeCandles(count, first.time - count * STEP_SECONDS, first.time ^ 0x9e3779b9)
  state.candles = [...older, ...state.candles]
  const newCandleData = state.candles.map(toCandlePoint)
  const sides = variant === undefined ? [state.base, state.consolidated] : [variant === 'base' ? state.base : state.consolidated]

  for (const side of sides) {
    if (!side) continue
    const range = side.chart.timeScale().getVisibleLogicalRange()
    side.candle.setData(newCandleData)
    if (side.emas.length > 0) {
      for (let index = 0; index < side.emas.length; index += 1) {
        const line = computeEmaLine(state.candles, EMA_PERIODS[index])
        side.emas[index].setData(
          line.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })),
        )
      }
    }
    for (const rolling of side.rolling) {
      const points = computeRollingVwapPointsForSettings(
        state.candles,
        INTERVAL,
        rolling.settings,
      )
      rolling.points = points
      if (rolling.bands && rolling.fills) {
        rolling.center.setData(rollingVwapPointsToLineData(points, 'vwap'))
        for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
          rolling.bands[key].setData(rollingVwapPointsToLineData(points, key))
        }
        for (const band of ['band1', 'band2', 'band3'] as const) {
          rolling.fills[band].updateBandData(bandFillPoints(points, band))
        }
      }
      if (rolling.bundle) setRollingVwapChartSeriesData(rolling.bundle, points)
    }
    if (range) {
      side.chart.timeScale().setVisibleLogicalRange({
        from: range.from + count,
        to: range.to + count,
      })
    }
  }
}

async function stepTickCadence(options: {
  variant: 'base' | 'consolidated'
  ticks: number
  cadenceMs: number
}): Promise<{
  handlerMs: number[]
  arrivalMs: number[]
  stats: ReturnType<typeof stats>
}> {
  const handlerMs: number[] = []
  const arrivalMs: number[] = []
  let previous = performance.now()
  resetCounters()
  for (let index = 0; index < options.ticks; index += 1) {
    await wait(options.cadenceMs)
    const now = performance.now()
    arrivalMs.push(now - previous)
    previous = now
    mutateLastCandle(index)
    const start = performance.now()
    const side = options.variant === 'base' ? state.base : state.consolidated
    if (!side) throw new Error('missing chart')
    applySideTick(side, options.variant)
    handlerMs.push(performance.now() - start)
  }
  await waitFrames(2)
  return { handlerMs, arrivalMs, stats: stats() }
}

async function stepPages(options: {
  variant: 'base' | 'consolidated'
  pages: number
  pageRows: number
}): Promise<{ perPageMs: number[]; stats: ReturnType<typeof stats> }> {
  const perPageMs: number[] = []
  resetCounters()
  for (let index = 0; index < options.pages; index += 1) {
    const start = performance.now()
    await prependCandles(options.pageRows, options.variant)
    perPageMs.push(performance.now() - start)
  }
  await waitFrames(3)
  return { perPageMs, stats: stats() }
}

function destroy(): void {
  for (const side of [state.base, state.consolidated]) {
    side?.chart.remove()
  }
  state.base = null
  state.consolidated = null
}

const harness = {
  create,
  tick,
  setRange,
  setScale,
  setVisibility,
  setStyle,
  prependCandles,
  stats,
  compare: compareSides,
  bandCoordinates,
  coordinateProbe,
  pointSnapshot,
  resetCounters,
  waitFrames,
  wait,
  stepTickCadence,
  stepPages,
  destroy,
}

declare global {
  interface Window {
    __rvwapHarness: typeof harness
  }
}

window.__rvwapHarness = harness

export {}
