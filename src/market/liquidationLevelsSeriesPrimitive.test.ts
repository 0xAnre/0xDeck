import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  attachLiquidationLevelsSeriesPrimitive,
  liquidationLevelsStatusLabel,
  resolveLiquidationLevelsPaneProfile,
  LiquidationLevelsSeriesPrimitive,
  type LiquidationLevelsPrimitiveContext,
} from './liquidationLevelsSeriesPrimitive.ts'
import { createLiquidationLevelsIndex } from './liquidationLevelsIndex.ts'
import { DEFAULT_LIQUIDATION_LEVELS_SETTINGS } from './liquidationLevelsSettings.ts'
import type { LiquidationLevelBook } from './liquidationLevelsProtocol.ts'

interface Fill {
  style: string
  x: number
  y: number
  width: number
  height: number
}

interface Stroke {
  style: string
  x: number
  y: number
  width: number
  height: number
}

function fakeCanvas(width: number, height: number, dpr = 1) {
  const fills: Fill[] = []
  const strokes: Stroke[] = []
  const texts: Array<{ text: string; x: number; y: number }> = []
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: String(this.fillStyle), x, y, width: w, height: h })
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      strokes.push({ style: String(this.strokeStyle), x, y, width: w, height: h })
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y })
    },
  }
  const target = {
    useBitmapCoordinateSpace: (
      fn: (scope: {
        context: typeof context
        horizontalPixelRatio: number
        verticalPixelRatio: number
        bitmapSize: { width: number; height: number }
      }) => void,
    ) =>
      fn({
        context,
        horizontalPixelRatio: dpr,
        verticalPixelRatio: dpr,
        bitmapSize: { width: width * dpr, height: height * dpr },
      }),
  }
  return { target, fills, strokes, texts }
}

function bookWith(rows: Array<[string, number, number]>): LiquidationLevelBook {
  const positions = new Map()
  for (const [user, price, size] of rows) {
    positions.set(user, { user, price, size, ts: 1 })
  }
  return { epoch: 'e1', seq: 1, headTs: 1_700_000_000_000, positions }
}

function setup(options: {
  paneHeight?: number
  plotWidth?: number
  priceScaleWidth?: number
  topPrice?: number
  bottomPrice?: number
  rows?: Array<[string, number, number]>
  enabled?: boolean
  selected?: boolean
  maxWidthPercent?: number
} = {}) {
  const paneHeight = options.paneHeight ?? 400
  const plotWidth = options.plotWidth ?? 800
  const priceScaleWidth = options.priceScaleWidth ?? 60
  const topPrice = options.topPrice ?? 200
  const bottomPrice = options.bottomPrice ?? 100
  const index = createLiquidationLevelsIndex()
  index.replaceBook(
    bookWith(options.rows ?? [
      ['long', 150, 10],
      ['short', 125, -4],
    ]),
  )
  const prices = { top: topPrice, bottom: bottomPrice }
  const pane = {
    getHeight: () => paneHeight,
    getHTMLElement: () => ({ clientWidth: plotWidth + priceScaleWidth }) as HTMLElement,
    paneIndex: () => 0,
  }
  let requestUpdateCount = 0
  const chart = {
    timeScale: () => ({ width: () => plotWidth + priceScaleWidth }),
    priceScale: () => ({ width: () => 0 }),
  }
  const series = {
    getPane: () => pane,
    coordinateToPrice: (y: number) =>
      prices.bottom + (1 - y / paneHeight) * (prices.top - prices.bottom),
    priceScale: () => ({ width: () => priceScaleWidth }),
  }
  const context: LiquidationLevelsPrimitiveContext = {
    enabled: options.enabled ?? true,
    settings: {
      ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
      maxWidthPercent: options.maxWidthPercent ?? 25,
    },
    index,
    selected: options.selected ?? false,
    label: () => ({ text: 'LEV LIQ · LIVE 2s ago', tone: 'live' }),
  }
  const primitive = new LiquidationLevelsSeriesPrimitive(() => context)
  const attached = {
    chart: chart as never,
    series: series as never,
    requestUpdate: () => {
      requestUpdateCount += 1
    },
  }
  primitive.attached(attached)

  return {
    primitive,
    index,
    context,
    paneHeight,
    plotWidth,
    prices,
    chart,
    series,
    // Node cannot observe real frames: count the primitive's own requests and
    // the renderer's draw calls separately (as the chart-object standard says).
    requests: () => requestUpdateCount,
    detach: () => primitive.detached(),
  }
}

describe('liquidation level series primitive', () => {
  it('requests once on attach and never from a render pass', () => {
    const h = setup()
    assert.equal(h.requests(), 1)
    for (let index = 0; index < 5; index += 1) {
      h.primitive.updateAllViews()
    }
    assert.equal(h.requests(), 1)
    h.primitive.invalidate()
    assert.equal(h.requests(), 2)
    // A view rebuild on its own still requests nothing, even with new data.
    h.index.replaceBook(bookWith([['x', 160, 3]]))
    h.primitive.updateAllViews()
    assert.equal(h.requests(), 2)
  })

  it('paints bars right-aligned to the plot edge with one shared scale', () => {
    const h = setup()
    h.primitive.updateAllViews()
    const view = h.primitive.paneViews()[0]
    const renderer = view.renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(h.plotWidth, h.paneHeight)
    renderer.draw(canvas.target as never)

    assert.equal(canvas.fills.length, 2)
    for (const fill of canvas.fills) {
      assert.equal(fill.x + fill.width, h.plotWidth)
    }
    const longFill = canvas.fills.find((fill) => fill.style.includes('34, 197, 94'))
    const shortFill = canvas.fills.find((fill) => fill.style.includes('239, 68, 68'))
    assert.ok(longFill && shortFill)
    // 10 vs 4 on one scale: the short bar is 40% of the long bar.
    assert.equal(longFill.width, Math.round(h.plotWidth * 0.25))
    assert.equal(shortFill.width, Math.round((4 / 10) * h.plotWidth * 0.25))
    assert.equal(canvas.texts.length, 1)
    assert.equal(canvas.texts[0].text, 'LEV LIQ · LIVE 2s ago')
  })

  it('caps DPR-2 bitmap geometry at the same CSS extent', () => {
    const h = setup()
    h.primitive.updateAllViews()
    const renderer = h.primitive.paneViews()[0].renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(h.plotWidth, h.paneHeight, 2)
    renderer.draw(canvas.target as never)
    assert.ok(canvas.fills.length > 0)
    for (const fill of canvas.fills) {
      assert.equal(fill.x + fill.width, h.plotWidth * 2)
      assert.ok(fill.height >= 1)
    }
  })

  it('draws nothing when disabled, empty or outside the price scale', () => {
    const disabled = setup({ enabled: false })
    disabled.primitive.updateAllViews()
    assert.equal(disabled.primitive.paneViews()[0].renderer(), null)

    const empty = setup({ rows: [['far', 1_000, 1]] })
    empty.primitive.updateAllViews()
    assert.equal(empty.primitive.paneViews()[0].renderer(), null)

    const noConversion = setup({ topPrice: 100, bottomPrice: 100 })
    noConversion.primitive.updateAllViews()
    assert.equal(noConversion.primitive.paneViews()[0].renderer(), null)
  })

  it('draws a selection halo without touching persisted styles', () => {
    const h = setup({ selected: true })
    h.primitive.updateAllViews()
    const renderer = h.primitive.paneViews()[0].renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(h.plotWidth, h.paneHeight)
    renderer.draw(canvas.target as never)
    assert.equal(canvas.strokes.length, canvas.fills.length)
  })

  it('stops requesting and painting after dispose', () => {
    const h = setup()
    h.primitive.updateAllViews()
    h.detach()
    h.primitive.invalidate()
    h.primitive.updateAllViews()
    assert.equal(h.requests(), 1)
    assert.equal(h.primitive.paneViews()[0].renderer(), null)
  })

  it('bounds rows by the pane height instead of the book size', () => {
    const rows: Array<[string, number, number]> = []
    for (let index = 0; index < 500; index += 1) {
      rows.push([`p${index}`, 101 + (index % 99), 1])
    }
    const h = setup({ paneHeight: 5_000, rows })
    h.primitive.updateAllViews()
    const renderer = h.primitive.paneViews()[0].renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(h.plotWidth, 5_000)
    renderer.draw(canvas.target as never)
    assert.ok(canvas.fills.length > 0)
    assert.ok(canvas.fills.length <= 2_000)
  })

  it('resolves the candle-pane profile from live conversions, without a cache', () => {
    const h = setup()
    const first = resolveLiquidationLevelsPaneProfile({
      chart: h.chart as never,
      series: h.series as never,
      index: h.index,
    })
    assert.ok(first)
    assert.equal(first.plotWidth, h.plotWidth)
    assert.equal(first.topPrice, h.prices.top)
    // Change the price scale: the next resolution reflects it immediately.
    h.prices.top = 400
    const second = resolveLiquidationLevelsPaneProfile({
      chart: h.chart as never,
      series: h.series as never,
      index: h.index,
    })
    assert.ok(second)
    assert.equal(second.topPrice, 400)
    assert.notDeepEqual(first.profile.rows, second.profile.rows)
  })

  it('detaches through the attach helper and stops scheduling', () => {
    const h = setup()
    let attachedPrimitive: LiquidationLevelsSeriesPrimitive | null = null
    const series = {
      attachPrimitive: (primitive: LiquidationLevelsSeriesPrimitive) => {
        attachedPrimitive = primitive
        primitive.attached({
          chart: h.chart as never,
          series: h.series as never,
          requestUpdate: () => {},
        })
      },
      detachPrimitive: (primitive: LiquidationLevelsSeriesPrimitive) => {
        primitive.detached()
      },
    }
    const attachment = attachLiquidationLevelsSeriesPrimitive(
      series as never,
      () => h.context,
    )
    assert.ok(attachedPrimitive)
    attachment.update()
    attachment.dispose()
    attachment.update()
    assert.equal(attachedPrimitive?.paneViews()[0].renderer(), null)
  })

  it('labels the profile as current and honest about staleness', () => {
    assert.deepEqual(
      liquidationLevelsStatusLabel({
        phase: 'live',
        resyncing: false,
        lastAppliedAt: 1_000,
        nowMs: 4_000,
      }),
      { text: 'LEV LIQ · LIVE 3s ago', tone: 'live' },
    )
    assert.deepEqual(
      liquidationLevelsStatusLabel({
        phase: 'stale',
        resyncing: false,
        lastAppliedAt: 1_000,
        nowMs: 43_000,
      }),
      { text: 'LEV LIQ · STALE 42s', tone: 'stale' },
    )
    assert.deepEqual(
      liquidationLevelsStatusLabel({
        phase: 'connecting',
        resyncing: false,
        lastAppliedAt: null,
        nowMs: 0,
      }),
      { text: 'LEV LIQ · SYNCING', tone: 'pending' },
    )
    assert.deepEqual(
      liquidationLevelsStatusLabel({
        phase: 'live',
        resyncing: true,
        lastAppliedAt: 1_000,
        nowMs: 2_000,
      }),
      { text: 'LEV LIQ · SYNCING', tone: 'pending' },
    )
  })
})
