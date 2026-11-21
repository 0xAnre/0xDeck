import {
  createChart,
  LineSeries,
  PriceScaleMode,
  type IChartApi,
  type IRange,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  SessionVwapBandSeriesPrimitive,
  attachSessionVwapBandSeriesPrimitive,
  type SessionVwapBandSeriesAttachment,
} from '../../src/market/sessionVwapBandSeriesPrimitive.ts'
import {
  sessionVwapBandSampleWindow,
  type SessionVwapBandPoint,
} from '../../src/market/sessionVwapBandRenderGeometry.ts'
import {
  createDailyVwapLineSeries,
  setDailyVwapLineSeriesData,
  setDailyVwapLineSeriesVisible,
} from '../../src/market/dailyVwapChartSeries.ts'
import {
  createWeeklyVwapLineSeries,
  setWeeklyVwapLineSeriesData,
  setWeeklyVwapLineSeriesVisible,
} from '../../src/market/weeklyVwapChartSeries.ts'
import {
  createMonthlyVwapLineSeries,
  setMonthlyVwapLineSeriesData,
  setMonthlyVwapLineSeriesVisible,
} from '../../src/market/monthlyVwapChartSeries.ts'
import {
  createQuarterlyVwapLineSeries,
  setQuarterlyVwapLineSeriesData,
  setQuarterlyVwapLineSeriesVisible,
} from '../../src/market/quarterlyVwapChartSeries.ts'
import {
  createYearlyVwapLineSeries,
  setYearlyVwapLineSeriesData,
  setYearlyVwapLineSeriesVisible,
} from '../../src/market/yearlyVwapChartSeries.ts'
import { computeDailyVwap } from '../../src/market/dailyVwap.ts'
import { computeWeeklyVwap } from '../../src/market/weeklyVwap.ts'
import { computeMonthlyVwap } from '../../src/market/monthlyVwap.ts'
import { computeQuarterlyVwap } from '../../src/market/quarterlyVwap.ts'
import { computeYearlyVwap } from '../../src/market/yearlyVwap.ts'
import {
  createRollingVwapChartSeriesBundle,
  rollingVwapBandFillPoints,
  setRollingVwapChartSeriesData,
  setRollingVwapInstanceSeriesVisibility,
  type RollingVwapChartSeriesBundle,
} from '../../src/market/rollingVwapChartSeries.ts'
import {
  computeRollingVwapPointsForSettings,
  createDefaultRollingVwapSettings,
  type RollingVwapSettings,
} from '../../src/market/rollingVwapSettings.ts'
import type { SessionVwapLineSeriesBundle } from '../../src/market/sessionVwapChartSeries.ts'
import type { CandleInterval, MarketCandle } from '../../src/market/types.ts'

const END_TIME = 1_700_000_000
const DAY_SECONDS = 86_400
const HOUR_SECONDS = 3_600

type FillRecord = {
  fillStyle: string
  points: number[]
  frame: number
}

type ExpectedBandPoint = {
  x: number
  yUpper: number
  yLower: number
}

type ExpectedRun = {
  upper: Array<{ x: number; y: number }>
  lower: Array<{ x: number; y: number }>
}

type HarnessStats = {
  sampleReads: number
  timeConversions: number
  priceConversions: number
  requestUpdates: number
  clears: number
  rafCallbacks: number
  viewUpdates: number
  pixelRatio: number
  fills: FillRecord[]
  lastFrameFills: FillRecord[]
  visibleRange: IRange<number> | null
  logicalRange: IRange<number> | null
  barSpacing: number
}

type ScaleOptions = {
  autoScale?: boolean
  range?: IRange<number>
  invert?: boolean
  mode?: PriceScaleMode
}

type HarnessOptions = {
  barCount: number
  visibleBars: number
  fillStyle?: string
  width?: number
  height?: number
}

type AttachParam = Parameters<SessionVwapBandSeriesPrimitive['attached']>[0]

type HarnessState = {
  chart: IChartApi | null
  series: ISeriesApi<'Line'> | null
  attachment: SessionVwapBandSeriesAttachment | null
  primitive: SessionVwapBandSeriesPrimitive | null
  rawPoints: SessionVwapBandPoint[]
  trackedPoints: SessionVwapBandPoint[]
  visibleBars: number
  fillStyle: string
  sampleReads: number
  timeConversions: number
  priceConversions: number
  requestUpdates: number
  viewUpdates: number
  extraAttachments: SessionVwapBandSeriesAttachment[]
}

const state: HarnessState = {
  chart: null,
  series: null,
  attachment: null,
  primitive: null,
  rawPoints: [],
  trackedPoints: [],
  visibleBars: 80,
  fillStyle: 'rgba(12, 34, 56, 0.5)',
  sampleReads: 0,
  timeConversions: 0,
  priceConversions: 0,
  requestUpdates: 0,
  viewUpdates: 0,
  extraAttachments: [],
}

const recorder = {
  container: null as HTMLElement | null,
  fills: [] as FillRecord[],
  clears: 0,
  rafCallbacks: 0,
  frame: 0,
  installed: false,
  pathByContext: new WeakMap<CanvasRenderingContext2D, number[]>(),
}

const originalUpdateAllViews = SessionVwapBandSeriesPrimitive.prototype.updateAllViews
SessionVwapBandSeriesPrimitive.prototype.updateAllViews = function (
  this: SessionVwapBandSeriesPrimitive,
): void {
  state.viewUpdates += 1
  originalUpdateAllViews.call(this)
}

const originalAttached = SessionVwapBandSeriesPrimitive.prototype.attached
SessionVwapBandSeriesPrimitive.prototype.attached = function (
  this: SessionVwapBandSeriesPrimitive,
  param: AttachParam,
): void {
  if (state.primitive === null) state.primitive = this
  originalAttached.call(this, {
    ...param,
    requestUpdate: () => {
      state.requestUpdates += 1
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
    if (recorder.container?.contains(this.canvas) === true) recorder.clears += 1
    clearRect.apply(this, args)
  }
  const requestFrame = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    requestFrame((time) => {
      recorder.frame += 1
      recorder.rafCallbacks += 1
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
  state.sampleReads = 0
  state.timeConversions = 0
  state.priceConversions = 0
  state.requestUpdates = 0
  state.viewUpdates = 0
  recorder.fills = []
  recorder.clears = 0
  recorder.rafCallbacks = 0
}

function trackPoints(points: SessionVwapBandPoint[]): SessionVwapBandPoint[] {
  return new Proxy(points, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) state.sampleReads += 1
      return Reflect.get(target, property, receiver)
    },
  })
}

function makeBandPoints(count: number): SessionVwapBandPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const center = 100 + Math.sin(index / 9) * 6
    const halfWidth = 1 + (index % 4) * 0.25
    return {
      time: END_TIME - (count - 1 - index) * 60,
      upper1: center + halfWidth,
      lower1: center - halfWidth,
    }
  })
}

function bandLineData(points: readonly SessionVwapBandPoint[]) {
  return points.map((point) => {
    if (
      point.upper1 === null ||
      point.lower1 === null ||
      !Number.isFinite(point.upper1) ||
      !Number.isFinite(point.lower1)
    ) {
      return { time: point.time as UTCTimestamp }
    }
    return {
      time: point.time as UTCTimestamp,
      value: (point.upper1 + point.lower1) / 2,
    }
  })
}

function makeCandles(count: number, stepSeconds: number, interval: CandleInterval): MarketCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 60_000 + Math.sin(index / 31) * 250 + (index % 7)
    return {
      symbol: 'BTCUSDT',
      interval,
      time: END_TIME - (count - 1 - index) * stepSeconds,
      open: close - 12,
      high: close + 40,
      low: close - 40,
      close,
      volume: 5 + (index % 11),
      closed: true,
    }
  })
}

function ensureContainer(): HTMLElement {
  const container = document.getElementById('chart')
  if (container === null) throw new Error('missing #chart container')
  return container
}

function destroyChart(): void {
  for (const attachment of state.extraAttachments) attachment.dispose()
  state.extraAttachments = []
  state.attachment = null
  state.primitive = null
  state.series = null
  state.rawPoints = []
  state.trackedPoints = []
  state.chart?.remove()
  state.chart = null
  const container = ensureContainer()
  container.replaceChildren()
  container.style.width = '900px'
  container.style.height = '480px'
  recorder.container = container
}

function createChartInContainer(width: number, height: number): IChartApi {
  const container = ensureContainer()
  container.style.width = `${width}px`
  container.style.height = `${height}px`
  recorder.container = container
  return createChart(container, {
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
}

function instrumentSeries(chart: IChartApi, series: ISeriesApi<'Line'>): void {
  const timeScale = chart.timeScale() as unknown as {
    timeToCoordinate: (time: UTCTimestamp) => number | null
  }
  const timeToCoordinate = timeScale.timeToCoordinate.bind(timeScale)
  timeScale.timeToCoordinate = (time: UTCTimestamp): number | null => {
    state.timeConversions += 1
    return timeToCoordinate(time)
  }
  const priced = series as unknown as {
    priceToCoordinate: (price: number) => number | null
  }
  const priceToCoordinate = priced.priceToCoordinate.bind(series)
  priced.priceToCoordinate = (price: number): number | null => {
    state.priceConversions += 1
    return priceToCoordinate(price)
  }
}

function applyPoints(points: SessionVwapBandPoint[]): void {
  if (!state.series || !state.attachment) throw new Error('chart is not ready')
  state.rawPoints = points
  state.trackedPoints = trackPoints(points)
  state.series.setData(bandLineData(points))
  state.attachment.updateBandData(state.trackedPoints)
}

function setVisibleLogicalRange(from: number, to: number): void {
  state.chart?.timeScale().setVisibleLogicalRange({ from, to })
}

async function create(options: HarnessOptions): Promise<void> {
  installRecorder()
  destroyChart()
  resetCounters()
  state.fillStyle = options.fillStyle ?? state.fillStyle
  state.visibleBars = options.visibleBars
  const chart = createChartInContainer(options.width ?? 900, options.height ?? 480)
  state.chart = chart
  const series = chart.addSeries(LineSeries, {
    color: '#8a8a8a',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  })
  state.series = series
  instrumentSeries(chart, series)
  const points = makeBandPoints(options.barCount)
  state.rawPoints = points
  state.trackedPoints = trackPoints(points)
  series.setData(bandLineData(points))
  state.attachment = attachSessionVwapBandSeriesPrimitive(series, {
    points: state.trackedPoints,
    visible: true,
    fillStyle: state.fillStyle,
  })
  setVisibleLogicalRange(options.barCount - options.visibleBars, options.barCount - 1)
  await nextFrames(3)
  resetCounters()
}

async function setHistory(barCount: number): Promise<void> {
  const points = makeBandPoints(barCount)
  applyPoints(points)
  setVisibleLogicalRange(barCount - state.visibleBars, barCount - 1)
  await nextFrames(3)
}

async function setPoints(points: SessionVwapBandPoint[]): Promise<void> {
  applyPoints(points)
  await nextFrames(3)
}

async function setFillStyle(fillStyle: string): Promise<void> {
  state.fillStyle = fillStyle
  state.attachment?.setFillStyle(fillStyle)
  await nextFrames(2)
}

async function setVisible(visible: boolean): Promise<void> {
  state.attachment?.setBandVisible(visible)
  await nextFrames(2)
}

async function setScale(options: ScaleOptions): Promise<void> {
  const chart = state.chart
  if (!chart) throw new Error('chart is not ready')
  const scale = chart.priceScale('right')
  if (options.mode !== undefined) scale.applyOptions({ mode: options.mode })
  if (options.invert !== undefined) scale.applyOptions({ invertScale: options.invert })
  if (options.autoScale !== undefined) scale.setAutoScale(options.autoScale)
  if (options.range !== undefined) scale.setVisibleRange(options.range)
  await nextFrames(3)
}

async function resize(width: number, height: number): Promise<void> {
  state.chart?.resize(width, height)
  await nextFrames(3)
}

async function updateAttachment(): Promise<void> {
  state.attachment?.update()
  await nextFrames(2)
}

async function clearData(): Promise<void> {
  state.rawPoints = []
  state.trackedPoints = trackPoints([])
  state.series?.setData([])
  state.attachment?.updateBandData(state.trackedPoints)
  await nextFrames(3)
}

function forceViews(): void {
  state.primitive?.updateAllViews()
}

async function attachSecondFill(fillStyle: string): Promise<void> {
  if (!state.series) throw new Error('chart is not ready')
  const attachment = attachSessionVwapBandSeriesPrimitive(state.series, {
    points: state.trackedPoints,
    visible: true,
    fillStyle,
  })
  state.extraAttachments.push(attachment)
  await nextFrames(3)
}

function expectedRuns(): ExpectedRun[] {
  const chart = state.chart
  const series = state.series
  if (!chart || !series) return []
  const range = chart.timeScale().getVisibleRange()
  const fromTime = typeof range?.from === 'number' ? range.from : null
  const toTime = typeof range?.to === 'number' ? range.to : null
  if (fromTime === null || toTime === null) return []

  const savedTime = state.timeConversions
  const savedPrice = state.priceConversions
  const window = sessionVwapBandSampleWindow(state.rawPoints, { fromTime, toTime })
  const runs: ExpectedRun[] = []
  let current: ExpectedBandPoint[] = []
  const flush = (): void => {
    if (current.length === 0) return
    runs.push({
      upper: current.map((point) => ({ x: point.x, y: point.yUpper })),
      lower: [...current].reverse().map((point) => ({ x: point.x, y: point.yLower })),
    })
    current = []
  }
  for (let index = window.startIndex; index < window.endIndex; index += 1) {
    const point = state.rawPoints[index]
    if (
      point.upper1 === null ||
      point.lower1 === null ||
      !Number.isFinite(point.upper1) ||
      !Number.isFinite(point.lower1)
    ) {
      flush()
      continue
    }
    const x = chart.timeScale().timeToCoordinate(point.time as UTCTimestamp)
    const yUpper = series.priceToCoordinate(point.upper1)
    const yLower = series.priceToCoordinate(point.lower1)
    if (x === null || yUpper === null || yLower === null) {
      flush()
      continue
    }
    current.push({ x, yUpper, yLower })
  }
  flush()
  state.timeConversions = savedTime
  state.priceConversions = savedPrice
  return runs
}

function lastFrameFills(): FillRecord[] {
  if (recorder.fills.length === 0) return []
  const lastFrame = recorder.fills[recorder.fills.length - 1].frame
  return recorder.fills.filter((fill) => fill.frame === lastFrame)
}

function stats(): HarnessStats {
  const chart = state.chart
  return {
    sampleReads: state.sampleReads,
    timeConversions: state.timeConversions,
    priceConversions: state.priceConversions,
    requestUpdates: state.requestUpdates,
    viewUpdates: state.viewUpdates,
    clears: recorder.clears,
    rafCallbacks: recorder.rafCallbacks,
    pixelRatio: window.devicePixelRatio,
    fills: recorder.fills.map((fill) => ({ ...fill, points: fill.points.slice() })),
    lastFrameFills: lastFrameFills().map((fill) => ({ ...fill, points: fill.points.slice() })),
    visibleRange: chart?.timeScale().getVisibleRange() ?? null,
    logicalRange: chart?.timeScale().getVisibleLogicalRange() ?? null,
    barSpacing: chart?.timeScale().options().barSpacing ?? 0,
  }
}

function snapshotBundle<Key extends string>(bundle: SessionVwapLineSeriesBundle<Key>): string[] {
  return bundle.ordered.map((series) => JSON.stringify(series.data()))
}

function snapshotRolling(bundle: RollingVwapChartSeriesBundle): {
  center: string
  bands: Record<string, string>
  options: Record<string, unknown>
} {
  const bands: Record<string, string> = {}
  for (const key of Object.keys(bundle.bands)) {
    bands[key] = JSON.stringify(bundle.bands[key as keyof typeof bundle.bands].data())
  }
  const options: Record<string, unknown> = {}
  for (const key of Object.keys(bundle.bands)) {
    const series = bundle.bands[key as keyof typeof bundle.bands]
    const seriesOptions = series.options()
    options[key] = {
      color: seriesOptions.color,
      lineWidth: seriesOptions.lineWidth,
      lineStyle: seriesOptions.lineStyle,
    }
  }
  return { center: JSON.stringify(bundle.center.data()), bands, options }
}

let sessionPoints: Record<string, unknown> | null = null
let rollingPoints: Record<string, number | null>[] | null = null

async function runSessionConsumers(): Promise<Record<string, unknown>> {
  installRecorder()
  destroyChart()
  resetCounters()
  const chart = createChartInContainer(1000, 520)
  state.chart = chart
  const candles = makeCandles(3 * 365 * 6, 4 * HOUR_SECONDS, '4h')

  const daily = createDailyVwapLineSeries(chart, true)
  const weekly = createWeeklyVwapLineSeries(chart, true)
  const monthly = createMonthlyVwapLineSeries(chart, true)
  const quarterly = createQuarterlyVwapLineSeries(chart, true)
  const yearly = createYearlyVwapLineSeries(chart, true)

  const dailyData = computeDailyVwap(candles)
  const weeklyData = computeWeeklyVwap(candles)
  const monthlyData = computeMonthlyVwap(candles)
  const quarterlyData = computeQuarterlyVwap(candles)
  const yearlyData = computeYearlyVwap(candles)

  const fills = {
    daily: 'rgba(101, 11, 21, 0.5)',
    weekly: 'rgba(102, 22, 32, 0.5)',
    monthly: 'rgba(103, 33, 43, 0.5)',
    quarterly: 'rgba(104, 44, 54, 0.5)',
    yearly: 'rgba(105, 55, 65, 0.5)',
  }
  daily.band.setFillStyle(fills.daily)
  weekly.band.setFillStyle(fills.weekly)
  monthly.band.setFillStyle(fills.monthly)
  quarterly.band.setFillStyle(fills.quarterly)
  yearly.band.setFillStyle(fills.yearly)

  setDailyVwapLineSeriesData(daily, dailyData)
  setWeeklyVwapLineSeriesData(weekly, weeklyData)
  setMonthlyVwapLineSeriesData(monthly, monthlyData)
  setQuarterlyVwapLineSeriesData(quarterly, quarterlyData)
  setYearlyVwapLineSeriesData(yearly, yearlyData)
  chart.timeScale().setVisibleRange({
    from: END_TIME - 30 * DAY_SECONDS,
    to: END_TIME,
  })
  await nextFrames(4)

  const before = {
    daily: snapshotBundle(daily),
    weekly: snapshotBundle(weekly),
    monthly: snapshotBundle(monthly),
    quarterly: snapshotBundle(quarterly),
    yearly: snapshotBundle(yearly),
  }
  const shown = stats()
  const shownByStyle = Object.fromEntries(
    Object.entries(fills).map(([key, style]) => [
      key,
      shown.lastFrameFills.filter((fill) => fill.fillStyle === style).length,
    ]),
  )
  sessionPoints = {
    daily: dailyData.length,
    weekly: weeklyData.length,
    monthly: monthlyData.length,
    quarterly: quarterlyData.length,
    yearly: yearlyData.length,
  }

  setDailyVwapLineSeriesVisible(daily, false)
  setWeeklyVwapLineSeriesVisible(weekly, false)
  setMonthlyVwapLineSeriesVisible(monthly, false)
  setQuarterlyVwapLineSeriesVisible(quarterly, false)
  setYearlyVwapLineSeriesVisible(yearly, false)
  await nextFrames(3)
  resetCounters()
  await new Promise((resolve) => setTimeout(resolve, 300))
  const hidden = stats()

  setDailyVwapLineSeriesVisible(daily, true)
  setWeeklyVwapLineSeriesVisible(weekly, true)
  setMonthlyVwapLineSeriesVisible(monthly, true)
  setQuarterlyVwapLineSeriesVisible(quarterly, true)
  setYearlyVwapLineSeriesVisible(yearly, true)
  await nextFrames(3)
  const reenabled = stats()
  const reenabledByStyle = Object.fromEntries(
    Object.entries(fills).map(([key, style]) => [
      key,
      reenabled.lastFrameFills.filter((fill) => fill.fillStyle === style).length,
    ]),
  )
  const after = {
    daily: snapshotBundle(daily),
    weekly: snapshotBundle(weekly),
    monthly: snapshotBundle(monthly),
    quarterly: snapshotBundle(quarterly),
    yearly: snapshotBundle(yearly),
  }

  return {
    pointCounts: sessionPoints,
    fills,
    shownByStyle,
    hidden,
    reenabledByStyle,
    dataEqual: JSON.stringify(before) === JSON.stringify(after),
    reenabled,
  }
}

async function runRollingConsumer(): Promise<Record<string, unknown>> {
  installRecorder()
  destroyChart()
  resetCounters()
  const chart = createChartInContainer(1000, 520)
  state.chart = chart
  const candles = makeCandles(5_000, 60, '1m')
  const settings: RollingVwapSettings = createDefaultRollingVwapSettings()
  settings.multipliers = { multiplier1: 1, multiplier2: 2, multiplier3: 3 }
  const points = computeRollingVwapPointsForSettings(candles, '1m', settings)
  const bundle = createRollingVwapChartSeriesBundle(chart, settings, { title: 'RV' })
  const fills = {
    band1: 'rgba(11, 22, 33, 0.5)',
    band2: 'rgba(44, 55, 66, 0.5)',
    band3: 'rgba(77, 88, 99, 0.5)',
  }
  bundle.bandFills?.band1.setFillStyle(fills.band1)
  bundle.bandFills?.band2.setFillStyle(fills.band2)
  bundle.bandFills?.band3.setFillStyle(fills.band3)
  setRollingVwapChartSeriesData(bundle, points)
  setRollingVwapInstanceSeriesVisibility(
    bundle,
    { id: 'rv', enabled: true, settings, displaySequence: 1 },
    '1m',
  )
  chart.timeScale().setVisibleLogicalRange({ from: points.length - 120, to: points.length - 1 })
  await nextFrames(4)

  const before = snapshotRolling(bundle)
  const shown = stats()
  const shownByStyle = Object.fromEntries(
    Object.entries(fills).map(([key, style]) => [
      key,
      shown.lastFrameFills.filter((fill) => fill.fillStyle === style).length,
    ]),
  )

  settings.multipliers = { multiplier1: 1, multiplier2: 0, multiplier3: 0 }
  setRollingVwapInstanceSeriesVisibility(
    bundle,
    { id: 'rv', enabled: true, settings, displaySequence: 1 },
    '1m',
  )
  await nextFrames(3)
  resetCounters()
  bundle.bandFills?.band1.setFillStyle(fills.band1)
  await nextFrames(2)
  const disabledBands = stats()
  const disabledByStyle = Object.fromEntries(
    Object.entries(fills).map(([key, style]) => [
      key,
      disabledBands.lastFrameFills.filter((fill) => fill.fillStyle === style).length,
    ]),
  )

  setRollingVwapInstanceSeriesVisibility(
    bundle,
    { id: 'rv', enabled: false, settings, displaySequence: 1 },
    '1m',
  )
  await nextFrames(3)
  resetCounters()
  await new Promise((resolve) => setTimeout(resolve, 300))
  const hidden = stats()

  setRollingVwapInstanceSeriesVisibility(
    bundle,
    { id: 'rv', enabled: true, settings, displaySequence: 1 },
    '1m',
  )
  await nextFrames(3)
  const reenabled = stats()
  const reenabledByStyle = Object.fromEntries(
    Object.entries(fills).map(([key, style]) => [
      key,
      reenabled.lastFrameFills.filter((fill) => fill.fillStyle === style).length,
    ]),
  )
  const after = snapshotRolling(bundle)
  rollingPoints = points.map((point) => ({
    time: point.time,
    vwap: point.vwap,
    upper1: point.upper1,
    lower1: point.lower1,
  }))

  const dataEqual =
    before.center === after.center &&
    JSON.stringify(before.bands) === JSON.stringify(after.bands)
  return {
    pointCount: points.length,
    band1SourceRows: rollingVwapBandFillPoints(points, 'band1').length,
    fills,
    shownByStyle,
    disabledByStyle,
    hidden,
    reenabledByStyle,
    dataEqual,
    optionsEqual: JSON.stringify(before.options) === JSON.stringify(after.options),
    reenabled,
  }
}

function sessionPointCounts(): Record<string, unknown> | null {
  return sessionPoints
}

function rollingPointCount(): number {
  return rollingPoints?.length ?? 0
}

export type VwapHarnessApi = {
  create: (options: HarnessOptions) => Promise<void>
  setHistory: (barCount: number) => Promise<void>
  setPoints: (points: SessionVwapBandPoint[]) => Promise<void>
  setFillStyle: (fillStyle: string) => Promise<void>
  setVisible: (visible: boolean) => Promise<void>
  setScale: (options: ScaleOptions) => Promise<void>
  updateAttachment: () => Promise<void>
  resize: (width: number, height: number) => Promise<void>
  clearData: () => Promise<void>
  forceViews: () => void
  attachSecondFill: (fillStyle: string) => Promise<void>
  setVisibleLogicalRange: (from: number, to: number) => void
  waitFrames: (count: number) => Promise<void>
  expectedRuns: () => ExpectedRun[]
  stats: () => HarnessStats
  resetCounters: () => void
  runSessionConsumers: () => Promise<Record<string, unknown>>
  runRollingConsumer: () => Promise<Record<string, unknown>>
  sessionPointCounts: () => Record<string, unknown> | null
  rollingPointCount: () => number
  PriceScaleMode: typeof PriceScaleMode
}

declare global {
  interface Window {
    __vwapHarness: VwapHarnessApi
  }
}

window.__vwapHarness = {
  create,
  setHistory,
  setPoints,
  setFillStyle,
  setVisible,
  setScale,
  updateAttachment,
  resize,
  clearData,
  forceViews,
  attachSecondFill,
  setVisibleLogicalRange,
  waitFrames: nextFrames,
  expectedRuns,
  stats,
  resetCounters,
  runSessionConsumers,
  runRollingConsumer,
  sessionPointCounts,
  rollingPointCount,
  PriceScaleMode,
}
