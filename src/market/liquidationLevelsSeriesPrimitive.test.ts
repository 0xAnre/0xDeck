import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  attachLiquidationLevelsSeriesPrimitive,
  liquidationLevelsStatusLabel,
  priceLevelStatusLabel,
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
  alpha: number
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
    globalAlpha: 1,
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
      fills.push({
        style: String(this.fillStyle),
        x,
        y,
        width: w,
        height: h,
        alpha: this.globalAlpha,
      })
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

  it('draws only the honest label when the visible window is empty', () => {
    const empty = setup({ rows: [['far', 1_000, 1]] })
    empty.primitive.updateAllViews()
    const renderer = empty.primitive.paneViews()[0].renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(empty.plotWidth, empty.paneHeight)
    renderer.draw(canvas.target as never)
    assert.equal(canvas.fills.length, 0)
    assert.equal(canvas.texts.length, 1)
  })

  it('draws nothing when disabled or the price scale cannot be read', () => {
    const disabled = setup({ enabled: false })
    disabled.primitive.updateAllViews()
    assert.equal(disabled.primitive.paneViews()[0].renderer(), null)

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

  it('keeps the price rows aligned on a pane taller than the row cap', () => {
    const h = setup({
      paneHeight: 5_000,
      rows: [
        ['top', 199.9, 1],
        ['middle', 150, 2],
        ['bottom', 100, 3],
      ],
    })
    h.primitive.updateAllViews()
    const renderer = h.primitive.paneViews()[0].renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(h.plotWidth, 5_000)
    renderer.draw(canvas.target as never)
    assert.equal(canvas.fills.length, 3)

    const priceToY = (price: number) =>
      h.paneHeight * (1 - (price - h.prices.bottom) / (h.prices.top - h.prices.bottom))
    // 2000 capped rows of 2.5 CSS px each: rows 1, 1000 and 1999, each painted
    // from floor(row * 2.5) so the row's whole price extent is covered.
    const expectedY = [2, 2_500, 4_997]
    assert.deepEqual(
      canvas.fills.map((fill) => fill.y).sort((a, b) => a - b),
      expectedY,
    )
    // The bottom price maps to the pane's bottom edge (y = 5000), which is
    // outside the pixel range; its row must still reach that edge (next check).
    for (const price of [199.9, 150]) {
      const y = priceToY(price)
      const covering = canvas.fills.find(
        (fill) => fill.y <= y + 0.001 && y < fill.y + fill.height,
      )
      assert.ok(covering, `a row must cover the price ${price} at y=${y}`)
    }
    const bottom = canvas.fills.find((fill) => fill.y === 4_997)
    assert.ok(bottom, 'the bottom price must paint at the pane bottom, not at y≈1999')
    assert.equal(bottom.height, 3)
    assert.equal(bottom.y + bottom.height, 5_000)
  })

  it('keeps DPR-2 bitmap rows aligned on a tall pane', () => {
    const h = setup({
      paneHeight: 5_000,
      rows: [['bottom', 100, 1]],
    })
    h.primitive.updateAllViews()
    const renderer = h.primitive.paneViews()[0].renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(h.plotWidth, 5_000, 2)
    renderer.draw(canvas.target as never)
    assert.equal(canvas.fills.length, 1)
    const fill = canvas.fills[0]
    // CSS row [4997.5, 5000) → bitmap [9995, 10000); 5 bitmap px at 2.5 CSS px.
    assert.equal(fill.x + fill.width, h.plotWidth * 2)
    assert.equal(fill.y, 9_995)
    assert.equal(fill.height, 5)
  })

  it('paints the status label when the visible window holds no positions', () => {
    const h = setup({ rows: [['far', 1_000_000, 1]] })
    h.primitive.updateAllViews()
    const renderer = h.primitive.paneViews()[0].renderer()
    assert.ok(renderer, 'the label alone must still paint')
    const canvas = fakeCanvas(h.plotWidth, h.paneHeight)
    renderer.draw(canvas.target as never)
    assert.equal(canvas.fills.length, 0)
    assert.equal(canvas.texts.length, 1)
    assert.equal(canvas.texts[0].text, 'LEV LIQ · LIVE 2s ago')
  })

  it('paints both sides of a mixed row with equal extents and parity', () => {
    const h = setup({
      rows: [
        ['long', 100, 5],
        ['short', 100, -5],
      ],
      maxWidthPercent: 25,
    })
    h.primitive.updateAllViews()
    const renderer = h.primitive.paneViews()[0].renderer()
    assert.ok(renderer)
    const canvas = fakeCanvas(h.plotWidth, h.paneHeight)
    renderer.draw(canvas.target as never)
    // Both sides exist and have the same extent, so both are drawn; the second
    // one uses half alpha so the equal-width overlap does not hide the first.
    assert.equal(canvas.fills.length, 2)
    const green = canvas.fills.find((fill) => fill.style.includes('34, 197, 94'))
    const red = canvas.fills.find((fill) => fill.style.includes('239, 68, 68'))
    assert.ok(green && red)
    assert.equal(green.width, red.width)
    assert.equal(green.x + green.width, h.plotWidth)
    assert.equal(red.x + red.width, h.plotWidth)
    assert.equal(green.alpha, 1)
    assert.equal(red.alpha, 0.5)
  })

  it('stacks one status label per enabled profile', () => {
    const h = setup()
    const texts = [0, 1, 2].map((labelRow) => {
      const primitive = new LiquidationLevelsSeriesPrimitive(() => ({
        ...h.context,
        labelRow,
      }))
      primitive.attached({
        chart: h.chart as never,
        series: h.series as never,
        requestUpdate: () => {},
      })
      primitive.updateAllViews()
      const renderer = primitive.paneViews()[0].renderer()
      assert.ok(renderer)
      const canvas = fakeCanvas(h.plotWidth, h.paneHeight)
      renderer.draw(canvas.target as never)
      assert.equal(canvas.texts.length, 1)
      const text = canvas.texts[0]
      primitive.detached()
      return text
    })
    // Fixed 12 CSS px rows, never the same line for two profiles.
    assert.deepEqual(
      texts.map((text) => text.y),
      [4, 16, 28],
    )
  })

  it('labels a trigger-order profile with its own prefix', () => {
    assert.deepEqual(
      priceLevelStatusLabel({
        kind: 'stop-loss',
        phase: 'live',
        resyncing: false,
        lastAppliedAt: 1_000,
        nowMs: 4_000,
      }),
      { text: 'SL · LIVE 3s ago', tone: 'live' },
    )
    assert.deepEqual(
      priceLevelStatusLabel({
        kind: 'take-profit',
        phase: 'live',
        resyncing: false,
        lastAppliedAt: 1_000,
        nowMs: 40_000,
      }),
      { text: 'TP · LIVE 39s ago', tone: 'live' },
    )
    // A live connection whose channel has been quiet is stale per channel.
    assert.deepEqual(
      priceLevelStatusLabel({
        kind: 'stop-loss',
        phase: 'live',
        resyncing: false,
        lastAppliedAt: 1_000,
        lastFileAt: 1_000,
        nowMs: 40_000,
      }),
      { text: 'SL · STALE 39s', tone: 'stale' },
    )
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
