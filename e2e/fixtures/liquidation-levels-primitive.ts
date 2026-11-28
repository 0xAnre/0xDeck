import {
  CandlestickSeries,
  createChart,
  LineSeries,
  type IChartApi,
  type IPaneApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { createLiquidationLevelsIndex } from '../../src/market/liquidationLevelsIndex.ts'
import {
  attachLiquidationLevelsSeriesPrimitive,
  LiquidationLevelsSeriesPrimitive,
} from '../../src/market/liquidationLevelsSeriesPrimitive.ts'
import {
  DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
  type LiquidationLevelsSettings,
} from '../../src/market/liquidationLevelsSettings.ts'
import type { LiquidationLevelBook } from '../../src/market/liquidationLevelsProtocol.ts'

/**
 * Real installed-lightweight-charts (5.2.x) harness for the live
 * liquidation-level profile primitive.
 *
 * It imports the production primitive and the same `lightweight-charts`
 * package the app installs, then counts:
 *  - `requestUpdate()` callbacks the primitive receives (requests, not frames);
 *  - library-driven `updateAllViews()` calls;
 *  - animation-frame callbacks;
 *  - real canvas `fillRect`/`strokeRect`/`fillText` calls, per frame and style.
 *
 * All assertions live in the spec and are counters over fixed windows; the
 * harness never asserts wall-clock time.
 */

type FillRecord = {
  style: string
  x: number
  y: number
  w: number
  h: number
  frame: number
  /** Real canvas bitmap ratio at draw time: bitmap px per CSS px. */
  canvasRatio: number
}
type StrokeRecord = FillRecord

type Harness = {
  create: (options: { paneHeight?: number; rows?: number }) => void
  resetCounters: () => void
  stats: () => unknown
  setEnabled: (enabled: boolean) => void
  setSettings: (patch: Partial<LiquidationLevelsSettings>) => void
  setSelected: (selected: boolean) => void
  replaceBook: (rows: Array<[string, number, number]>) => void
  setPriceRange: (from: number, to: number) => void
  autoScale: () => void
  panLogical: (from: number, to: number) => void
  resize: (width: number, height: number) => void
  addSecondPane: () => void
  setOtherPaneRange: (from: number, to: number) => void
  priceToY: (price: number) => number | null
  plotWidth: () => number
  paneCount: () => number
  candlePaneIndex: () => number
  /** Fill rows of the last painted frame, in CSS pixels, long side first. */
  lastFrameBars: () => Array<{ style: string; x: number; y: number; w: number; h: number }>
}

declare global {
  interface Window {
    __liquidationLevelsHarness: Harness
  }
}

const START_TIME = 1_700_000_000
const BAR_SECONDS = 60
const BAR_COUNT = 300
const GREEN = 'rgba(34, 197, 94, 0.6)'
const RED = 'rgba(239, 68, 68, 0.6)'

let frames = 0
let requestUpdates = 0
let viewUpdates = 0
let fills: FillRecord[] = []
let strokes: StrokeRecord[] = []
let texts: Array<{ text: string; x: number; y: number; frame: number }> = []

const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
window.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return originalRequestAnimationFrame((time) => {
    frames += 1
    callback(time)
  })
}

/** The canvas's own bitmap ratio, never an assumed devicePixelRatio. */
function canvasRatioOf(context: CanvasRenderingContext2D): number {
  const canvas = context.canvas
  const cssWidth = canvas.clientWidth || canvas.width
  return cssWidth > 0 ? canvas.width / cssWidth : 1
}

const originalFillRect = CanvasRenderingContext2D.prototype.fillRect
CanvasRenderingContext2D.prototype.fillRect = function (
  this: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  fills.push({
    style: String(this.fillStyle),
    x,
    y,
    w,
    h,
    frame: frames,
    canvasRatio: canvasRatioOf(this),
  })
  return originalFillRect.call(this, x, y, w, h)
}

const originalFillText = CanvasRenderingContext2D.prototype.fillText
CanvasRenderingContext2D.prototype.fillText = function (
  this: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) {
  texts.push({ text: String(text), x, y, frame: frames })
  return originalFillText.call(this, text, x, y)
}

const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect
CanvasRenderingContext2D.prototype.strokeRect = function (
  this: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  strokes.push({
    style: String(this.strokeStyle),
    x,
    y,
    w,
    h,
    frame: frames,
    canvasRatio: canvasRatioOf(this),
  })
  return originalStrokeRect.call(this, x, y, w, h)
}

let chart: IChartApi | null = null
let candle: ISeriesApi<'Candlestick', Time> | null = null
let secondPaneSeries: ISeriesApi<'Line', Time> | null = null
let attachment: ReturnType<typeof attachLiquidationLevelsSeriesPrimitive> | null = null
const index = createLiquidationLevelsIndex()

let settings: LiquidationLevelsSettings = { ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS }
let enabled = true
let selected = false

function candles(): Array<{
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}> {
  const result = []
  for (let bar = 0; bar < BAR_COUNT; bar += 1) {
    const wave = Math.sin(bar / 9) * 18 + Math.sin(bar / 37) * 6
    const open = 125 + wave
    const close = open + Math.sin(bar / 3) * 2
    result.push({
      time: (START_TIME + bar * BAR_SECONDS) as UTCTimestamp,
      open,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close,
    })
  }
  return result
}

function bookWith(rows: Array<[string, number, number]>): LiquidationLevelBook {
  const positions = new Map()
  for (const [user, price, size] of rows) {
    positions.set(user, { user, price, size, ts: START_TIME * 1000 })
  }
  return { epoch: 'e1', seq: 1, headTs: START_TIME * 1000, positions }
}

function resolvePane(): IPaneApi<Time> | null {
  return candle?.getPane() ?? null
}

function plotWidthCss(): number {
  if (!chart || !candle) return 0
  const element = resolvePane()?.getHTMLElement()
  const total = element?.clientWidth ?? chart.timeScale().width()
  return total - candle.priceScale().width()
}

function profileFills(): FillRecord[] {
  return fills.filter((fill) => fill.style === GREEN || fill.style === RED)
}

function lastFrameBars() {
  const bars = profileFills()
  if (bars.length === 0) return []
  const lastFrame = bars[bars.length - 1].frame
  return bars
    .filter((fill) => fill.frame === lastFrame)
    .map((fill) => ({
      style: fill.style,
      x: fill.x / fill.canvasRatio,
      y: fill.y / fill.canvasRatio,
      w: fill.w / fill.canvasRatio,
      h: fill.h / fill.canvasRatio,
    }))
}

window.__liquidationLevelsHarness = {
  create(options = {}) {
    document.getElementById('chart')!.remove()
    const container = document.createElement('div')
    container.id = 'chart'
    container.style.width = '900px'
    container.style.height = `${options.paneHeight ?? 400}px`
    document.body.appendChild(container)
    fills = []
    strokes = []
    texts = []
    frames = 0
    requestUpdates = 0
    viewUpdates = 0

    const rowCount = options.rows ?? 5
    const rows: Array<[string, number, number]> = []
    for (let i = 0; i < rowCount; i += 1) {
      rows.push([
        `0x${i.toString(16).padStart(40, '0')}`,
        108 + i * 4,
        i % 2 === 0 ? i + 1 : -(i + 1),
      ])
    }
    index.replaceBook(bookWith(rows))

    const created = createChart(container, {
      width: 900,
      height: options.paneHeight ?? 400,
      layout: { background: { color: '#000000' }, textColor: '#dddddd' },
      rightPriceScale: { visible: true },
      timeScale: { visible: true },
      autoSize: false,
    })
    chart = created
    candle = created.addSeries(CandlestickSeries, {
      upColor: '#DBDBDB',
      downColor: '#808080',
      borderVisible: false,
      wickUpColor: '#DBDBDB',
      wickDownColor: '#808080',
    })
    candle.setData(candles())
    created.timeScale().fitContent()

    const nextPrimitive = new LiquidationLevelsSeriesPrimitive(() => ({
      enabled,
      settings,
      index,
      selected,
      label: () => ({ text: 'LEV LIQ · LIVE 1s ago', tone: 'live' }),
    }))
    const originalUpdateAllViews = nextPrimitive.updateAllViews.bind(nextPrimitive)
    nextPrimitive.updateAllViews = () => {
      viewUpdates += 1
      originalUpdateAllViews()
    }
    const originalInvalidate = nextPrimitive.invalidate.bind(nextPrimitive)
    nextPrimitive.invalidate = () => {
      requestUpdates += 1
      originalInvalidate()
    }
    candle.attachPrimitive(nextPrimitive)
    attachment = {
      primitive: nextPrimitive,
      update: () => nextPrimitive.invalidate(),
      dispose: () => {
        candle?.detachPrimitive(nextPrimitive)
        nextPrimitive.detached()
      },
    }
    // Attachment itself requests one paint; counters start after it settles.
    requestUpdates = 0
    viewUpdates = 0
    frames = 0
    fills = []
    strokes = []
    texts = []
  },

  resetCounters() {
    requestUpdates = 0
    viewUpdates = 0
    frames = 0
    fills = []
    strokes = []
    texts = []
  },

  stats() {
    const bars = profileFills()
    const ratio = bars.length > 0 ? bars[bars.length - 1].canvasRatio : 1
    const lastFrame = bars.length > 0 ? bars[bars.length - 1].frame : -1
    const profileStrokes = strokes.filter((stroke) => {
      const style = stroke.style.toLowerCase()
      return (
        style === '#22c55e' ||
        style === '#ef4444' ||
        style === 'rgb(34, 197, 94)' ||
        style === 'rgb(239, 68, 68)' ||
        style.startsWith('rgba(34, 197, 94') ||
        style.startsWith('rgba(239, 68, 68')
      )
    })
    const profileTexts = texts.filter((text) => text.text.includes('LEV LIQ'))
    const profile = candle
      ? (() => {
          const pane = resolvePane()
          const height = pane?.getHeight() ?? 0
          const top = candle!.coordinateToPrice(0)
          const bottom = candle!.coordinateToPrice(height)
          return { height, top, bottom }
        })()
      : null
    return {
      requestUpdates,
      viewUpdates,
      frames,
      pixelRatio: ratio,
      devicePixelRatio: window.devicePixelRatio,
      plotWidthCss: plotWidthCss(),
      paneHeightCss: resolvePane()?.getHeight() ?? 0,
      // Counters filtered to the profile's own paint calls; the library's axis
      // text/canvas calls are reported separately so a claim names its ink.
      fillCount: bars.length,
      allFillCalls: fills.length,
      allStrokeCalls: strokes.length,
      strokeStyles: [...new Set(strokes.map((stroke) => stroke.style))].slice(0, 8),
      strokeCount: profileStrokes.length,
      textFills: profileTexts.length,
      framesWithFills: new Set(bars.map((fill) => fill.frame)).size,
      lastFrameFills: bars.filter((fill) => fill.frame === lastFrame).length,
      greenFills: bars.filter((fill) => fill.style === GREEN).length,
      redFills: bars.filter((fill) => fill.style === RED).length,
      lastFrameText:
        profileTexts.length > 0 ? profileTexts[profileTexts.length - 1].text : null,
      lastFrameFillXMax:
        bars.filter((fill) => fill.frame === lastFrame).length === 0
          ? 0
          : Math.max(
              ...bars
                .filter((fill) => fill.frame === lastFrame)
                .map((fill) => fill.x + fill.w),
            ) / ratio,
      profile,
      candlePaneIndex: candle ? candle.getPane().paneIndex() : -1,
      paneCount: chart ? chart.panes().length : 0,
    }
  },

  setEnabled(next) {
    enabled = next
    attachment?.update()
  },
  setSettings(patch) {
    settings = { ...settings, ...patch }
    attachment?.update()
  },
  setSelected(next) {
    selected = next
    attachment?.update()
  },
  replaceBook(rows) {
    index.replaceBook(bookWith(rows))
    attachment?.update()
  },
  setPriceRange(from, to) {
    candle?.priceScale().setVisibleRange({ from, to })
  },
  autoScale() {
    candle?.priceScale().setAutoScale(true)
  },
  panLogical(from, to) {
    chart?.timeScale().setVisibleLogicalRange({ from, to })
  },
  resize(width, height) {
    const container = document.getElementById('chart')
    if (!container) return
    container.style.width = `${width}px`
    container.style.height = `${height}px`
    chart?.resize(width, height)
  },
  addSecondPane() {
    if (!chart) return
    secondPaneSeries = chart.addSeries(LineSeries, { color: '#888888' }, 1)
    secondPaneSeries.setData(
      candles().map((bar) => ({ time: bar.time, value: bar.close })),
    )
    secondPaneSeries.priceScale().applyOptions({ scaleMargins: { top: 0.2, bottom: 0.2 } })
  },
  setOtherPaneRange(from, to) {
    secondPaneSeries?.priceScale().setVisibleRange({ from, to })
  },
  priceToY(price) {
    return candle ? candle.priceToCoordinate(price) : null
  },
  plotWidth() {
    return plotWidthCss()
  },
  paneCount() {
    return chart?.panes().length ?? 0
  },
  candlePaneIndex() {
    return candle ? candle.getPane().paneIndex() : -1
  },
  lastFrameBars,
}
