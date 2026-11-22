import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type IRange,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { AnchoredVwapBandFillSeriesPrimitive } from '../../src/market/anchoredVwapBandFillSeriesPrimitive.ts'
import {
  applyAnchoredVwapDrawingChartPresentation,
  createAnchoredVwapDrawingChartSeriesBundle,
  removeAnchoredVwapDrawingChartSeriesBundle,
  setAnchoredVwapDrawingChartSeriesData,
  setAnchoredVwapDrawingInstanceSeriesVisibility,
  type AnchoredVwapDrawingChartSeriesBundle,
} from '../../src/market/anchoredVwapDrawingChartSeries.ts'
import {
  createDefaultAnchoredVwapDrawingSettings,
  type AnchoredVwapDrawingSettings,
} from '../../src/market/anchoredVwapDrawingSettings.ts'
import type { AnchoredVwapDrawingPoint } from '../../src/market/anchoredVwapDrawing.ts'
import type { AnchoredVwapInstance } from '../../src/market/anchoredVwapInstances.ts'
import type { MarketCandle } from '../../src/market/types.ts'

/**
 * Real installed-lightweight-charts (5.2.x) counter harness for the Anchored VWAP
 * band-fill primitive scheduling (#258).
 *
 * It imports the production modules and the same `lightweight-charts` package the
 * app installs, then counts library-driven `updateAllViews()` calls, the
 * `requestUpdate()` callbacks the primitive receives, coordinate conversions,
 * animation frames and real canvas fill/clear paths. Assertions are counters over
 * fixed windows, never wall-clock budgets.
 */

type AttachParam = Parameters<AnchoredVwapBandFillSeriesPrimitive['attached']>[0]

type Point = { x: number; y: number }
type ExpectedRun = { upper: Point[]; lower: Point[] }
type FillRecord = { fillStyle: string; points: number[]; frame: number }

type HarnessStats = {
  requestUpdates: number
  viewUpdates: number
  attachCalls: number
  timeConversions: number
  priceConversions: number
  rafCallbacks: number
  clears: number
  fills: FillRecord[]
  lastFrameFills: FillRecord[]
  pixelRatio: number
  barSpacing: number
  logicalRange: IRange<number> | null
  visibleRange: IRange<number> | null
  toolCount: number
}

type ToolState = {
  bundle: AnchoredVwapDrawingChartSeriesBundle
  instance: AnchoredVwapInstance
  settings: AnchoredVwapDrawingSettings
  label: string
}

type CreateOptions = {
  bars: number
  visibleBars: number
  fillOpacity: number
  toolCount?: number
  bandCount?: number
  hidden?: boolean
  width?: number
  height?: number
}

const START_TIME = 1_700_000_000
const BAR_SECONDS = 60

const counters = {
  requestUpdates: 0,
  viewUpdates: 0,
  attachCalls: 0,
  timeConversions: 0,
  priceConversions: 0,
  rafCallbacks: 0,
  clears: 0,
}

const recorder = {
  container: null as HTMLElement | null,
  fills: [] as FillRecord[],
  frame: 0,
  installed: false,
  pathByContext: new WeakMap<CanvasRenderingContext2D, number[]>(),
}

const harnessState = {
  chart: null as IChartApi | null,
  candleSeries: null as ISeriesApi<'Candlestick'> | null,
  candles: [] as MarketCandle[],
  points: [] as AnchoredVwapDrawingPoint[],
  tools: [] as ToolState[],
  visibleBars: 80,
  bandCount: 1,
}

let firstPrimitive: AnchoredVwapBandFillSeriesPrimitive | null = null

const originalUpdateAllViews = AnchoredVwapBandFillSeriesPrimitive.prototype.updateAllViews
AnchoredVwapBandFillSeriesPrimitive.prototype.updateAllViews = function (
  this: AnchoredVwapBandFillSeriesPrimitive,
): void {
  counters.viewUpdates += 1
  originalUpdateAllViews.call(this)
}

const originalAttached = AnchoredVwapBandFillSeriesPrimitive.prototype.attached
AnchoredVwapBandFillSeriesPrimitive.prototype.attached = function (
  this: AnchoredVwapBandFillSeriesPrimitive,
  param: AttachParam,
): void {
  counters.attachCalls += 1
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- the harness needs the attached primitive to call the library hook on demand
  if (firstPrimitive === null) firstPrimitive = this
  originalAttached.call(this, {
    ...param,
    requestUpdate: () => {
      counters.requestUpdates += 1
      param.requestUpdate()
    },
  })
}

function installRecorder(): void {
  if (recorder.installed) return
  recorder.installed = true
  const proto = CanvasRenderingContext2D.prototype
  const beginPath = proto.beginPath
  proto.beginPath = function (this: CanvasRenderingContext2D): void {
    recorder.pathByContext.set(this, [])
    beginPath.call(this)
  }
  const moveTo = proto.moveTo
  proto.moveTo = function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['moveTo']>
  ): void {
    recorder.pathByContext.get(this)?.push(args[0], args[1])
    moveTo.apply(this, args)
  }
  const lineTo = proto.lineTo
  proto.lineTo = function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['lineTo']>
  ): void {
    recorder.pathByContext.get(this)?.push(args[0], args[1])
    lineTo.apply(this, args)
  }
  const fill = proto.fill
  proto.fill = function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['fill']>
  ): void {
    const path = recorder.pathByContext.get(this)
    if (recorder.container?.contains(this.canvas) === true && path !== undefined) {
      recorder.fills.push({
        fillStyle: typeof this.fillStyle === 'string' ? this.fillStyle : '',
        points: path.slice(),
        frame: recorder.frame,
      })
    }
    fill.apply(this, args)
  }
  const clearRect = proto.clearRect
  proto.clearRect = function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['clearRect']>
  ): void {
    if (recorder.container?.contains(this.canvas) === true) counters.clears += 1
    clearRect.apply(this, args)
  }
  const requestFrame = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    requestFrame((time) => {
      recorder.frame += 1
      counters.rafCallbacks += 1
      callback(time)
    })
}

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0
    const tick = (): void => {
      seen += 1
      if (seen >= count) resolve()
      else window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  })
}

function resetCounters(): void {
  counters.requestUpdates = 0
  counters.viewUpdates = 0
  counters.attachCalls = 0
  counters.timeConversions = 0
  counters.priceConversions = 0
  counters.rafCallbacks = 0
  counters.clears = 0
  recorder.fills = []
}

function withFillOpacity(
  settings: AnchoredVwapDrawingSettings,
  opacityPercent: number,
  bandCount: number,
): AnchoredVwapDrawingSettings {
  const band = (
    pair: AnchoredVwapDrawingSettings['band1'],
    index: number,
  ): AnchoredVwapDrawingSettings['band1'] => ({
    ...pair,
    visible: index < bandCount,
    fillOpacity: opacityPercent,
  })
  return {
    ...settings,
    band1: band(settings.band1, 0),
    band2: band(settings.band2, 1),
    band3: band(settings.band3, 2),
  }
}

function makeCandles(count: number): MarketCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 60_000 + Math.sin(index / 31) * 260 + (index % 7)
    return {
      symbol: 'BTCUSDT',
      interval: '1m',
      time: START_TIME + index * BAR_SECONDS,
      open: close - 14,
      high: close + 40,
      low: close - 40,
      close,
      volume: 4 + (index % 9),
      closed: true,
    }
  })
}

function makeAnchoredPoints(candles: readonly MarketCandle[]): AnchoredVwapDrawingPoint[] {
  return candles.map((candle, index) => {
    const spread = 1 + (index % 5) * 0.15
    const center = candle.close - 40
    return {
      time: candle.time,
      vwap: center,
      upper1: center + spread,
      lower1: center - spread,
      upper2: center + spread * 2,
      lower2: center - spread * 2,
      upper3: center + spread * 3,
      lower3: center - spread * 3,
    }
  })
}

function ensureContainer(): HTMLElement {
  const container = document.getElementById('chart')
  if (container === null) throw new Error('missing #chart container')
  return container
}

function destroyChart(): void {
  harnessState.tools = []
  harnessState.candles = []
  harnessState.points = []
  harnessState.candleSeries = null
  harnessState.chart?.remove()
  harnessState.chart = null
  firstPrimitive = null
  const container = ensureContainer()
  container.replaceChildren()
  container.style.width = '900px'
  container.style.height = '460px'
  recorder.container = container
}

function instrumentConversions(chart: IChartApi, series: ISeriesApi<'Line'>): void {
  const timeScale = chart.timeScale() as unknown as {
    timeToCoordinate: (time: UTCTimestamp) => number | null
  }
  const timeToCoordinate = timeScale.timeToCoordinate.bind(timeScale)
  timeScale.timeToCoordinate = (time: UTCTimestamp): number | null => {
    counters.timeConversions += 1
    return timeToCoordinate(time)
  }
  const priced = series as unknown as {
    priceToCoordinate: (price: number) => number | null
  }
  const priceToCoordinate = priced.priceToCoordinate.bind(series)
  priced.priceToCoordinate = (price: number): number | null => {
    counters.priceConversions += 1
    return priceToCoordinate(price)
  }
}

function addTool(fillOpacity: number, hidden: boolean, bandCount: number): ToolState {
  const chart = harnessState.chart
  if (!chart) throw new Error('chart is not ready')
  const index = harnessState.tools.length
  const label = `Anchored VWAP ${index + 1}`
  const settings = withFillOpacity(
    createDefaultAnchoredVwapDrawingSettings(),
    fillOpacity,
    bandCount,
  )
  const bundle = createAnchoredVwapDrawingChartSeriesBundle(chart, settings, label)
  if (index === 0) instrumentConversions(chart, bundle.center)
  const instance: AnchoredVwapInstance = {
    id: `anchored-vwap-${index + 1}`,
    anchorTime: harnessState.points[0]?.time ?? START_TIME,
    displaySequence: index + 1,
    hidden,
    settings,
  }
  setAnchoredVwapDrawingChartSeriesData(bundle, harnessState.points)
  setAnchoredVwapDrawingInstanceSeriesVisibility(bundle, instance, label)
  const tool = { bundle, instance, settings, label }
  harnessState.tools.push(tool)
  return tool
}

async function create(options: CreateOptions): Promise<void> {
  installRecorder()
  destroyChart()
  resetCounters()
  const container = ensureContainer()
  const width = options.width ?? 900
  const height = options.height ?? 460
  container.style.width = `${width}px`
  container.style.height = `${height}px`
  recorder.container = container
  harnessState.visibleBars = options.visibleBars
  harnessState.bandCount = options.bandCount ?? 1

  const chart = createChart(container, {
    width,
    height,
    layout: { background: { color: '#0b0b0b' }, textColor: '#cccccc' },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    timeScale: { borderVisible: false, timeVisible: true },
    rightPriceScale: { borderVisible: false },
    leftPriceScale: { visible: false },
    handleScroll: false,
    handleScale: false,
  })
  harnessState.chart = chart
  const candles = makeCandles(options.bars)
  harnessState.candles = candles
  const candleSeries = chart.addSeries(CandlestickSeries, {})
  candleSeries.setData(
    candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
  )
  harnessState.candleSeries = candleSeries
  harnessState.points = makeAnchoredPoints(candles)

  for (let index = 0; index < (options.toolCount ?? 1); index += 1) {
    addTool(options.fillOpacity, options.hidden === true, harnessState.bandCount)
  }

  chart.timeScale().setVisibleLogicalRange({
    from: options.bars - options.visibleBars,
    to: options.bars - 1,
  })
  await nextFrames(4)
  resetCounters()
}

function setFillOpacity(opacityPercent: number): void {
  for (const tool of harnessState.tools) {
    tool.settings = withFillOpacity(tool.settings, opacityPercent, harnessState.bandCount)
    tool.instance = { ...tool.instance, settings: tool.settings }
    applyAnchoredVwapDrawingChartPresentation(tool.bundle, tool.instance, tool.label)
    setAnchoredVwapDrawingInstanceSeriesVisibility(tool.bundle, tool.instance, tool.label)
  }
}

function setVisible(visible: boolean): void {
  for (const tool of harnessState.tools) {
    tool.instance = { ...tool.instance, hidden: !visible }
    setAnchoredVwapDrawingInstanceSeriesVisibility(tool.bundle, tool.instance, tool.label)
  }
}

function setPoints(count: number): void {
  const points = harnessState.points.slice(0, Math.max(2, count))
  for (const tool of harnessState.tools) {
    setAnchoredVwapDrawingChartSeriesData(tool.bundle, points)
  }
}

function updateAttachment(index = 0): void {
  harnessState.tools[index]?.bundle.bandFill.update()
}

function addAnotherTool(): void {
  addTool(harnessState.tools[0]?.settings.band1.fillOpacity ?? 24, false, harnessState.bandCount)
}

function removeTool(index = 0): void {
  const chart = harnessState.chart
  const tool = harnessState.tools[index]
  if (!chart || !tool) return
  removeAnchoredVwapDrawingChartSeriesBundle(chart, tool.bundle)
  harnessState.tools.splice(index, 1)
}

function clearData(): void {
  for (const tool of harnessState.tools) {
    setAnchoredVwapDrawingChartSeriesData(tool.bundle, [])
  }
}

function setVisibleLogicalRange(from: number, to: number): void {
  harnessState.chart?.timeScale().setVisibleLogicalRange({ from, to })
}

async function resize(width: number, height: number): Promise<void> {
  const container = ensureContainer()
  container.style.width = `${width}px`
  container.style.height = `${height}px`
  harnessState.chart?.resize(width, height)
  await nextFrames(3)
}

/** The library calls `updateAllViews()`; reproduce exactly that call. */
function forceViews(): void {
  firstPrimitive?.updateAllViews()
}

function expectedRuns(pairIndex = 0): ExpectedRun[] {
  const chart = harnessState.chart
  const series = harnessState.tools[0]?.bundle.center
  if (!chart || !series) return []
  const upperKey = `upper${pairIndex + 1}` as 'upper1'
  const lowerKey = `lower${pairIndex + 1}` as 'lower1'
  const savedTime = counters.timeConversions
  const savedPrice = counters.priceConversions
  const runs: ExpectedRun[] = []
  let upper: Point[] = []
  let lower: Point[] = []
  const flush = (): void => {
    if (upper.length === 0) return
    runs.push({ upper, lower: [...lower].reverse() })
    upper = []
    lower = []
  }
  for (const point of harnessState.points) {
    const upperValue = point[upperKey]
    const lowerValue = point[lowerKey]
    if (
      upperValue === null ||
      lowerValue === null ||
      !Number.isFinite(upperValue) ||
      !Number.isFinite(lowerValue)
    ) {
      flush()
      continue
    }
    const x = chart.timeScale().timeToCoordinate(point.time as UTCTimestamp)
    const yUpper = series.priceToCoordinate(upperValue)
    const yLower = series.priceToCoordinate(lowerValue)
    if (x === null || yUpper === null || yLower === null) {
      flush()
      continue
    }
    upper.push({ x, y: yUpper })
    lower.push({ x, y: yLower })
  }
  flush()
  counters.timeConversions = savedTime
  counters.priceConversions = savedPrice
  return runs
}

function lastFrameFills(): FillRecord[] {
  if (recorder.fills.length === 0) return []
  const lastFrame = recorder.fills[recorder.fills.length - 1].frame
  return recorder.fills.filter((fill) => fill.frame === lastFrame)
}

function stats(): HarnessStats {
  return {
    requestUpdates: counters.requestUpdates,
    viewUpdates: counters.viewUpdates,
    attachCalls: counters.attachCalls,
    timeConversions: counters.timeConversions,
    priceConversions: counters.priceConversions,
    rafCallbacks: counters.rafCallbacks,
    clears: counters.clears,
    fills: recorder.fills.map((fill) => ({ ...fill, points: fill.points.slice() })),
    lastFrameFills: lastFrameFills().map((fill) => ({ ...fill, points: fill.points.slice() })),
    pixelRatio: window.devicePixelRatio,
    barSpacing: harnessState.chart?.timeScale().options().barSpacing ?? 0,
    logicalRange: harnessState.chart?.timeScale().getVisibleLogicalRange() ?? null,
    visibleRange: harnessState.chart?.timeScale().getVisibleRange() ?? null,
    toolCount: harnessState.tools.length,
  }
}

export type AnchoredRedrawHarnessApi = {
  create: (options: CreateOptions) => Promise<void>
  addAnotherTool: () => void
  removeTool: (index?: number) => void
  setFillOpacity: (opacityPercent: number) => void
  setVisible: (visible: boolean) => void
  setPoints: (count: number) => void
  updateAttachment: (index?: number) => void
  clearData: () => void
  setVisibleLogicalRange: (from: number, to: number) => void
  resize: (width: number, height: number) => Promise<void>
  forceViews: () => void
  waitFrames: (count: number) => Promise<void>
  expectedRuns: (pairIndex?: number) => ExpectedRun[]
  stats: () => HarnessStats
  resetCounters: () => void
}

declare global {
  interface Window {
    __anchoredRedrawHarness: AnchoredRedrawHarnessApi
  }
}

window.__anchoredRedrawHarness = {
  create,
  addAnotherTool,
  removeTool,
  setFillOpacity,
  setVisible,
  setPoints,
  updateAttachment,
  clearData,
  setVisibleLogicalRange,
  resize,
  forceViews,
  waitFrames: nextFrames,
  expectedRuns,
  stats,
  resetCounters,
}
