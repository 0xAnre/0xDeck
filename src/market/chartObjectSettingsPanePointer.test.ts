import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachChartObjectSettingsPanePointer } from './chartObjectSettingsPanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import type { ChartPaneElementRole } from './chartPaneRoles.ts'
import { registerChartPaneRoleSeries } from './chartPaneRoles.ts'
import { registerCandleChartSeries } from './candlePane.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'
import { INITIAL_LINE_INTERACTION_STATE } from './lineInteraction.ts'
import { INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE } from './anchoredVwapDrawingInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'
import type { ChartObjectSettingsHitTestContext } from './chartObjectSettingsHitTest.ts'

type FakeElement = {
  listeners: Map<string, Set<EventListener>>
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
  getBoundingClientRect: () => DOMRect
  hasDblClickListener: () => boolean
  fireDblClick: (event: MouseEvent) => void
}

function createFakeElement(top = 0): FakeElement {
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
    getBoundingClientRect: () => ({
      left: 0,
      top,
      width: 100,
      height: 100,
      right: 100,
      bottom: top + 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
    hasDblClickListener: () => (listeners.get('dblclick')?.size ?? 0) > 0,
    fireDblClick: (event: MouseEvent) => {
      for (const listener of listeners.get('dblclick') ?? []) {
        listener(event)
      }
    },
  }
}

type FakePane = {
  paneIndex: () => number
  getHTMLElement: () => FakeElement | null
}

function createChartHarness() {
  const panes: FakePane[] = []
  const elements = [createFakeElement(0), createFakeElement(100), createFakeElement(200)]
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

function buildContext(
  chart: unknown,
  rolesSeen: ChartPaneElementRole[],
  paneRole: ChartPaneElementRole,
  paneY: number,
): ChartObjectSettingsHitTestContext {
  rolesSeen.push(paneRole)
  return {
    chart: chart as never,
    series: { priceToCoordinate: () => 0 } as never,
    paneRole,
    paneX: 10,
    paneY,
    interval: '1m',
    intervalDurationSeconds: 60,
    lastBarUnixTime: null,
    activeIndicators: ['rsi', 'aggregated-liquidations'],
    loadedVwapLevel: null,
    loadedVwapInterval: null,
    bundle: {
      candle: { priceToCoordinate: () => 0 },
      emas: [],
      ema100: { priceToCoordinate: () => 0 },
      ema200: { priceToCoordinate: () => 0 },
      dailyVwap: null,
      weeklyVwap: null,
      monthlyVwap: null,
      quarterlyVwap: null,
      yearlyVwap: null,
      rollingVwaps: new Map(),
      anchoredVwaps: new Map(),
      rsi: null,
    } as never,
    rectangleInteraction: INITIAL_RECTANGLE_INTERACTION_STATE,
    lineInteraction: INITIAL_LINE_INTERACTION_STATE,
    anchoredVwapDrawingInteraction: INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
    fixedRangeVolumeProfileInteraction: INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    rectangleInstances: [],
    lineInstances: [],
    fixedRangeVolumeProfileInstances: [],
    fixedRangeVolumeProfileRuntime: {},
    rollingVwapInstances: [],
    anchoredVwapInstances: [],
  }
}

function dblClickEvent(clientY: number): MouseEvent {
  return { button: 0, clientX: 10, clientY } as MouseEvent
}

describe('attachChartObjectSettingsPanePointer', () => {
  it('attaches native pane dblclick and removes it on dispose', () => {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    panes.push(candlePane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

    const controller = attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: () => null,
      onActivate: () => {},
    })
    assert.equal(elements[0].hasDblClickListener(), true)
    controller.dispose()
    assert.equal(elements[0].hasDblClickListener(), false)
  })

  it('does not activate when double-click has no hit target', () => {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    panes.push(candlePane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

    const activations: ChartObjectSettingsTarget[] = []
    attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: () => null,
      onActivate: (target) => {
        activations.push(target)
      },
    })

    elements[0].fireDblClick(dblClickEvent(34))
    assert.equal(activations.length, 0)
  })

  it('opens the RSI indicator dialog when the RSI pane is double-clicked', () => {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    const rsiPane = createPane()
    panes.push(candlePane, rsiPane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'rsi', {
      getPane: () => rsiPane,
    } as never)

    const activations: ChartObjectSettingsTarget[] = []
    const rolesSeen: ChartPaneElementRole[] = []
    attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: (paneX, paneY, paneRole) =>
        buildContext(chart, rolesSeen, paneRole, paneY),
      onActivate: (target) => {
        activations.push(target)
      },
    })

    assert.equal(elements[1].hasDblClickListener(), true)
    elements[1].fireDblClick(dblClickEvent(120))

    assert.deepEqual(activations, [{ kind: 'market-indicator', indicatorId: 'rsi' }])
    assert.deepEqual(rolesSeen, ['rsi'])
  })

  it('opens the Aggregated Liquidations dialog when its pane is double-clicked', () => {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    const liquidationPane = createPane()
    panes.push(liquidationPane, candlePane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'aggregated-liquidations', {
      getPane: () => liquidationPane,
    } as never)

    const activations: ChartObjectSettingsTarget[] = []
    attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: (paneX, paneY, paneRole) =>
        buildContext(chart, [], paneRole, paneY),
      onActivate: (target) => {
        activations.push(target)
      },
    })

    // Position: Top — the liquidation pane is pane 0, candles pane 1.
    elements[0].fireDblClick(dblClickEvent(30))
    assert.deepEqual(activations, [{ kind: 'aggregated-liquidations' }])
  })

  it('follows the pane element when a role pane is added later', () => {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    panes.push(candlePane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

    const activations: ChartObjectSettingsTarget[] = []
    attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: (paneX, paneY, paneRole) =>
        buildContext(chart, [], paneRole, paneY),
      onActivate: (target) => {
        activations.push(target)
      },
    })
    assert.equal(elements[1].hasDblClickListener(), false)

    const rsiPane = createPane()
    panes.push(rsiPane)
    // Pane widgets are created on the next frame; the deferred notification
    // is what rebinds, so emulate the chart becoming ready first.
    registerChartPaneRoleSeries(chart as never, 'rsi', {
      getPane: () => rsiPane,
    } as never)

    assert.equal(elements[1].hasDblClickListener(), true)
    elements[1].fireDblClick(dblClickEvent(140))
    assert.deepEqual(activations, [{ kind: 'market-indicator', indicatorId: 'rsi' }])
  })
})
