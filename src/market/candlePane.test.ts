import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bindCandlePaneElementListeners,
  notifyCandlePaneChange,
  paneHoldsCandleSeries,
  registerCandleChartSeries,
  resolveCandlePane,
  resolveCandlePaneElement,
  resolveCandlePaneIndex,
  resolveCandlePriceScale,
} from './candlePane.ts'

type FakeElementListeners = Map<string, Set<EventListener>>

type FakeElement = {
  listeners: FakeElementListeners
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

function createFakeElement(): FakeElement {
  const listeners: FakeElementListeners = new Map()
  return {
    listeners,
    addEventListener: (type, listener) => {
      let listenersForType = listeners.get(type)
      if (!listenersForType) {
        listenersForType = new Set()
        listeners.set(type, listenersForType)
      }
      listenersForType.add(listener)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
  }
}

type FakePane = {
  paneIndex: () => number
  getHTMLElement: () => FakeElement | null
}

function createFakePane(panes: FakePane[], elements: FakeElement[]): FakePane {
  const pane: FakePane = {
    paneIndex: () => panes.indexOf(pane),
    getHTMLElement: () => elements[panes.indexOf(pane)] ?? null,
  }
  return pane
}

describe('candlePane', () => {
  it('resolves the pane of the registered candle series instead of pane 0', () => {
    const panes: FakePane[] = []
    const elements = [createFakeElement(), createFakeElement()]
    const candlePane = createFakePane(panes, elements)
    const liquidationPane = createFakePane(panes, elements)
    panes.push(liquidationPane, candlePane)

    const chart = { panes: () => panes }
    const series = { getPane: () => candlePane }
    registerCandleChartSeries(chart as never, series as never)

    assert.equal(resolveCandlePane(chart as never), candlePane)
    assert.equal(resolveCandlePaneElement(chart as never), elements[1])
  })

  it('falls back to pane 0 when no candle series is registered', () => {
    const pane = { getHTMLElement: () => null }
    assert.equal(resolveCandlePane({ panes: () => [pane] } as never), pane)
    assert.equal(resolveCandlePane({ panes: () => [] } as never), null)
  })

  it('resolves the candle pane index for new series creation', () => {
    const panes: FakePane[] = []
    const elements = [createFakeElement(), createFakeElement()]
    const candlePane = createFakePane(panes, elements)
    const liquidationPane = createFakePane(panes, elements)
    // Top position: liquidation pane 0, candles pane 1.
    panes.push(liquidationPane, candlePane)

    const chart = { panes: () => panes }
    assert.equal(resolveCandlePaneIndex(chart as never), 0)

    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    assert.equal(resolveCandlePaneIndex(chart as never), 1)
  })

  it('targets the candle pane price scale instead of pane 0', () => {
    const panes: FakePane[] = []
    const elements = [createFakeElement(), createFakeElement()]
    const candlePane = createFakePane(panes, elements)
    const liquidationPane = createFakePane(panes, elements)
    // Top position: liquidation pane 0, candles pane 1.
    panes.push(liquidationPane, candlePane)

    const paneIndexRequests: number[] = []
    const priceScale = { id: 'right' }
    const chart = {
      panes: () => panes,
      priceScale: (id: string, paneIndex?: number) => {
        assert.equal(id, 'right')
        paneIndexRequests.push(paneIndex ?? 0)
        return priceScale
      },
    }
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

    assert.equal(resolveCandlePriceScale(chart as never), priceScale)
    assert.deepEqual(paneIndexRequests, [1])
  })

  it('detects the pane that holds the registered candle series', () => {
    const panes: FakePane[] = []
    const elements = [createFakeElement(), createFakeElement()]
    const candlePane = createFakePane(panes, elements)
    const liquidationPane = createFakePane(panes, elements)
    panes.push(liquidationPane, candlePane)

    const chart = { panes: () => panes }
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

    assert.equal(paneHoldsCandleSeries(chart as never, candlePane as never), true)
    assert.equal(paneHoldsCandleSeries(chart as never, liquidationPane as never), false)
    // Unknown charts keep their default path instead of guessing pane 0.
    assert.equal(
      paneHoldsCandleSeries({ panes: () => [candlePane] } as never, candlePane as never),
      false,
    )
  })

  it('moves bound listeners to the new candle pane element after a pane reorder', () => {
    const panes: FakePane[] = []
    const elements = [createFakeElement(), createFakeElement()]
    const candlePane = createFakePane(panes, elements)
    const otherPane = createFakePane(panes, elements)
    panes.push(candlePane, otherPane)

    const chart = { panes: () => panes }
    const series = { getPane: () => candlePane }
    registerCandleChartSeries(chart as never, series as never)

    const listener = (() => {}) as EventListener
    const binding = bindCandlePaneElementListeners(chart as never, [
      { type: 'pointerdown', listener },
    ])
    assert.equal(elements[0].listeners.get('pointerdown')?.has(listener), true)

    // Top position: the liquidation pane becomes pane 0, moving candles to pane 1.
    panes.splice(0, 2, otherPane, candlePane)
    notifyCandlePaneChange(chart as never)

    assert.equal(elements[0].listeners.get('pointerdown')?.has(listener), false)
    assert.equal(elements[1].listeners.get('pointerdown')?.has(listener), true)

    binding.dispose()
    assert.equal(elements[1].listeners.get('pointerdown')?.has(listener), false)
  })
})
