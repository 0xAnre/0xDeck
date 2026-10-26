import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bindChartPaneRoleElementListeners,
  registerChartPaneRoleSeries,
  resolveChartPaneElementRole,
  resolveChartPaneElementTargets,
  resolveChartPaneRoleElement,
  resolveChartPaneRolePane,
  unregisterChartPaneRoleSeries,
} from './chartPaneRoles.ts'
import { notifyCandlePaneChange, registerCandleChartSeries } from './candlePane.ts'

type FakeElement = {
  listeners: Map<string, Set<EventListener>>
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
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
  const chart = { panes: () => panes }
  return { chart, panes, elements, createPane }
}

describe('chartPaneRoles', () => {
  it('resolves a role pane by series identity, not by pane index', () => {
    const harness = createHarness(3)
    const { chart, panes, elements, createPane } = harness
    const rsiPane = createPane()
    const candlePane = createPane()
    // RSI is pane 0 while the candle pane is pane 1 (e.g. liquidation pane above).
    panes.push(rsiPane, candlePane)

    assert.equal(resolveChartPaneRolePane(chart as never, 'rsi'), null)
    assert.equal(resolveChartPaneRoleElement(chart as never, 'rsi'), null)

    registerChartPaneRoleSeries(chart as never, 'rsi', { getPane: () => rsiPane } as never)
    assert.equal(resolveChartPaneRolePane(chart as never, 'rsi'), rsiPane)
    assert.equal(resolveChartPaneRoleElement(chart as never, 'rsi'), elements[0])

    // Panes move: the role still resolves to its own series' pane.
    panes.splice(0, 2, candlePane, rsiPane)
    assert.equal(resolveChartPaneRoleElement(chart as never, 'rsi'), elements[1])
  })

  it('falls back to null for unregistered roles and forgets unregistered series', () => {
    const harness = createHarness(2)
    const { chart, panes, createPane } = harness
    const pane = createPane()
    panes.push(pane)
    const series = { getPane: () => pane }

    assert.equal(resolveChartPaneRoleElement(chart as never, 'aggregated-liquidations'), null)
    registerChartPaneRoleSeries(chart as never, 'aggregated-liquidations', series as never)
    assert.equal(resolveChartPaneRolePane(chart as never, 'aggregated-liquidations'), pane)

    // Unregistering with a stale series reference keeps the current registration.
    unregisterChartPaneRoleSeries(chart as never, 'aggregated-liquidations', {
      getPane: () => pane,
    } as never)
    assert.equal(resolveChartPaneRolePane(chart as never, 'aggregated-liquidations'), pane)

    unregisterChartPaneRoleSeries(chart as never, 'aggregated-liquidations', series as never)
    assert.equal(resolveChartPaneRoleElement(chart as never, 'aggregated-liquidations'), null)
  })

  it('lists the candle pane plus every registered role pane once', () => {
    const harness = createHarness(4)
    const { chart, panes, elements, createPane } = harness
    const candlePane = createPane()
    const rsiPane = createPane()
    const orderBookPane = createPane()
    const liquidationPane = createPane()
    panes.push(liquidationPane, candlePane, rsiPane, orderBookPane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'rsi', { getPane: () => rsiPane } as never)
    registerChartPaneRoleSeries(chart as never, 'order-book-depth', {
      getPane: () => orderBookPane,
    } as never)
    registerChartPaneRoleSeries(chart as never, 'aggregated-liquidations', {
      getPane: () => liquidationPane,
    } as never)

    assert.deepEqual(resolveChartPaneElementTargets(chart as never), [
      { role: 'candle', element: elements[1] },
      { role: 'rsi', element: elements[2] },
      { role: 'aggregated-liquidations', element: elements[0] },
      { role: 'order-book-depth', element: elements[3] },
    ])
    assert.equal(resolveChartPaneElementRole(chart as never, elements[1] as never), 'candle')
    assert.equal(resolveChartPaneElementRole(chart as never, elements[2] as never), 'rsi')
    assert.equal(resolveChartPaneElementRole(chart as never, elements[3] as never), 'order-book-depth')
    assert.equal(resolveChartPaneElementRole(chart as never, elements[0] as never), 'aggregated-liquidations')
    assert.equal(resolveChartPaneElementRole(chart as never, createFakeElement() as never), null)
  })

  it('rebinds after the deferred pane-widget frame when the widget appears late', () => {
    const harness = createHarness(2)
    const { chart, panes, elements, createPane } = harness
    const candlePane = createPane()
    panes.push(candlePane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

    // A freshly added pane has no DOM widget until the next invalidation frame.
    let widgetReady = false
    const latePane: FakePane = {
      paneIndex: () => panes.indexOf(latePane),
      getHTMLElement: () => (widgetReady ? elements[1] : null),
    }
    panes.push(latePane)

    const frames: Array<() => void> = []
    const previousRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(() => callback(0))
      return frames.length
    }) as typeof globalThis.requestAnimationFrame

    try {
      const roles: string[] = []
      bindChartPaneRoleElementListeners(chart as never, (role) => {
        roles.push(role)
        return () => {}
      })
      assert.deepEqual(roles, ['candle'])

      registerChartPaneRoleSeries(chart as never, 'rsi', {
        getPane: () => latePane,
      } as never)
      assert.deepEqual(roles, ['candle'])

      widgetReady = true
      for (const frame of frames.splice(0)) frame()
      assert.deepEqual(roles, ['candle', 'rsi'])
    } finally {
      globalThis.requestAnimationFrame = previousRaf
    }
  })

  it('binds role listeners and moves them when panes are reordered or removed', () => {
    const harness = createHarness(3)
    const { chart, panes, elements, createPane } = harness
    const candlePane = createPane()
    const rsiPane = createPane()
    panes.push(candlePane, rsiPane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'rsi', { getPane: () => rsiPane } as never)

    const bound: Array<{ role: string; element: FakeElement; release: () => void }> = []
    const controller = bindChartPaneRoleElementListeners(chart as never, (role, element) => {
      const listener = (() => {}) as EventListener
      element.addEventListener('dblclick', listener)
      const entry = {
        role,
        element: element as unknown as FakeElement,
        release: () => element.removeEventListener('dblclick', listener),
      }
      bound.push(entry)
      return entry.release
    })

    assert.deepEqual(
      bound.map((entry) => entry.role),
      ['candle', 'rsi'],
    )
    assert.equal(elements[0].listeners.get('dblclick')?.size, 1)
    assert.equal(elements[1].listeners.get('dblclick')?.size, 1)

    // Top position: the RSI pane moves above the candles. The pane widgets are
    // reused by index, so both elements switch roles and are rebound once.
    panes.splice(0, 2, rsiPane, candlePane)
    notifyCandlePaneChange(chart as never)
    assert.deepEqual(
      bound.slice(2).map((entry) => entry.role),
      ['candle', 'rsi'],
    )
    assert.equal(elements[0].listeners.get('dblclick')?.size, 1)
    assert.equal(elements[1].listeners.get('dblclick')?.size, 1)

    // Removing the RSI pane leaves a single binding on the element that now
    // renders the candle pane.
    panes.splice(0, 1)
    unregisterChartPaneRoleSeries(chart as never, 'rsi')
    assert.equal(elements[0].listeners.get('dblclick')?.size, 1)
    assert.equal(elements[1].listeners.get('dblclick')?.size ?? 0, 0)

    controller.dispose()
    assert.equal(elements[0].listeners.get('dblclick')?.size ?? 0, 0)
    assert.equal(elements[1].listeners.get('dblclick')?.size ?? 0, 0)
  })
})
