import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachDrawingPaneDeselect } from './drawingPaneDeselect.ts'
import { registerChartPaneRoleSeries } from './chartPaneRoles.ts'
import { registerCandleChartSeries } from './candlePane.ts'

type FakeElement = {
  listeners: Map<string, Set<EventListener>>
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
  fire: (type: string, event: unknown) => void
  hasListener: (type: string) => boolean
}

function createFakeElement(): FakeElement {
  const listeners = new Map<string, Set<EventListener>>()
  return {
    listeners,
    addEventListener: (type, listener) => {
      let forType = listeners.get(type)
      if (!forType) {
        forType = new Set()
        listeners.set(type, forType)
      }
      forType.add(listener)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
    fire: (type, event) => {
      for (const listener of listeners.get(type) ?? []) listener(event as Event)
    },
    hasListener: (type) => (listeners.get(type)?.size ?? 0) > 0,
  }
}

type FakePane = {
  paneIndex: () => number
  getHTMLElement: () => FakeElement | null
}

function createHarness(paneCount: number) {
  const panes: FakePane[] = []
  const elements = Array.from({ length: paneCount }, () => createFakeElement())
  const createPane = (): FakePane => {
    const pane: FakePane = {
      paneIndex: () => panes.indexOf(pane),
      getHTMLElement: () => elements[panes.indexOf(pane)] ?? null,
    }
    return pane
  }
  return { chart: { panes: () => panes }, panes, elements, createPane }
}

function pointerDown(button: number): unknown {
  return { button }
}

describe('attachDrawingPaneDeselect', () => {
  it('clears the selection on a left click in the RSI and liquidation panes only', () => {
    const { chart, panes, elements, createPane } = createHarness(3)
    const candlePane = createPane()
    const rsiPane = createPane()
    const liquidationPane = createPane()
    panes.push(liquidationPane, candlePane, rsiPane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'rsi', { getPane: () => rsiPane } as never)
    registerChartPaneRoleSeries(chart as never, 'aggregated-liquidations', {
      getPane: () => liquidationPane,
    } as never)

    let cleared = 0
    const controller = attachDrawingPaneDeselect(chart as never, {
      onEmptyPanePointerDown: () => {
        cleared += 1
      },
    })

    assert.equal(elements[1].hasListener('pointerdown'), false)
    assert.equal(elements[0].hasListener('pointerdown'), true)
    assert.equal(elements[2].hasListener('pointerdown'), true)

    elements[0].fire('pointerdown', pointerDown(0))
    elements[2].fire('pointerdown', pointerDown(0))
    assert.equal(cleared, 2)

    // Not a left click: no selection change.
    elements[0].fire('pointerdown', pointerDown(2))
    assert.equal(cleared, 2)

    controller.dispose()
    assert.equal(elements[0].hasListener('pointerdown'), false)
    assert.equal(elements[2].hasListener('pointerdown'), false)
  })

  it('stays silent while another panel owns the keyboard claim', () => {
    const { chart, panes, elements, createPane } = createHarness(2)
    const candlePane = createPane()
    const rsiPane = createPane()
    panes.push(candlePane, rsiPane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'rsi', { getPane: () => rsiPane } as never)

    let cleared = 0
    attachDrawingPaneDeselect(chart as never, {
      shouldHandle: () => false,
      onEmptyPanePointerDown: () => {
        cleared += 1
      },
    })

    elements[1].fire('pointerdown', pointerDown(0))
    assert.equal(cleared, 0)
  })
})
