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
  fire: (type: string, event: Event) => void
  hasListener: (type: string) => boolean
  style: { cursor: string }
  setPointerCapture: (pointerId: number) => void
  hasPointerCapture: (pointerId: number) => boolean
  releasePointerCapture: (pointerId: number) => void
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
    fire: (type, event) => {
      for (const listener of listeners.get(type) ?? []) {
        listener(event)
      }
    },
    hasListener: (type) => (listeners.get(type)?.size ?? 0) > 0,
    style: { cursor: '' },
    setPointerCapture: () => {},
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
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

function pointerEvent(type: string, clientY: number, button = 0, clientX?: number): PointerEvent {
  return {
    type,
    button,
    clientX: clientX ?? 10,
    clientY,
    pointerId: 1,
  } as PointerEvent
}

describe('attachChartObjectSettingsPanePointer — overlay indicator selection', () => {
  function setup() {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    const rsiPane = createPane()
    panes.push(candlePane, rsiPane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'rsi', {
      getPane: () => rsiPane,
    } as never)

    const selections: ChartObjectSettingsTarget[] = []
    let deselects = 0
    const activations: ChartObjectSettingsTarget[] = []
    const controller = attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: (paneX, paneY, paneRole) => buildContext(chart, [], paneRole, paneY),
      onActivate: (target) => {
        activations.push(target)
      },
      onSelectOverlay: (target) => {
        selections.push(target)
      },
      onDeselectOverlay: () => {
        deselects += 1
      },
    })

    return {
      elements,
      controller,
      selections,
      activations,
      deselectCount: () => deselects,
    }
  }

  it('selects the overlay indicator on a single click without opening settings', () => {
    const { elements, controller, selections, activations } = setup()

    elements[1].fire('pointerdown', pointerEvent('pointerdown', 120))
    elements[1].fire('pointerup', pointerEvent('pointerup', 121))

    assert.deepEqual(selections, [{ kind: 'market-indicator', indicatorId: 'rsi' }])
    assert.deepEqual(activations, [])
    controller.dispose()
  })

  it('does not select when the press turns into a drag', () => {
    const { elements, controller, selections } = setup()

    elements[1].fire('pointerdown', pointerEvent('pointerdown', 120))
    elements[1].fire('pointerup', pointerEvent('pointerup', 160))

    assert.deepEqual(selections, [])
    controller.dispose()
  })

  it('releases the previous selection when the press hits nothing selectable', () => {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    panes.push(candlePane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

    let deselects = 0
    const controller = attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: () => null,
      onActivate: () => {},
      onSelectOverlay: () => {},
      onDeselectOverlay: () => {
        deselects += 1
      },
    })

    elements[0].fire('pointerdown', pointerEvent('pointerdown', 40))
    assert.equal(deselects, 1)
    controller.dispose()
  })

  it('keeps the selection while a press lands on the selected overlay', () => {
    const { chart, panes, elements, createPane } = createChartHarness()
    const candlePane = createPane()
    const rsiPane = createPane()
    panes.push(candlePane, rsiPane)
    registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)
    registerChartPaneRoleSeries(chart as never, 'rsi', {
      getPane: () => rsiPane,
    } as never)

    let deselects = 0
    const controller = attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: (paneX, paneY, paneRole) => buildContext(chart, [], paneRole, paneY),
      onActivate: () => {},
      onSelectOverlay: () => {},
      onDeselectOverlay: () => {
        deselects += 1
      },
    })

    elements[1].fire('pointerdown', pointerEvent('pointerdown', 120))
    assert.equal(deselects, 0)
    controller.dispose()
  })

  it('shows the shared pointer cursor over a selectable overlay indicator', () => {
    const { elements, controller } = setup()
    const rsiElement = elements[1]

    rsiElement.fire('pointermove', pointerEvent('pointermove', 120))
    assert.equal(rsiElement.style.cursor, 'pointer')

    rsiElement.fire('pointerleave', pointerEvent('pointerleave', 120))
    assert.equal(rsiElement.style.cursor, 'default')
    controller.dispose()
  })

  it('removes the single-click listeners on dispose', () => {
    const { elements, controller } = setup()
    controller.dispose()
    assert.equal(elements[1].hasListener('pointerdown'), false)
    assert.equal(elements[1].hasListener('pointerup'), false)
    assert.equal(elements[1].hasListener('pointermove'), false)
    assert.equal(elements[1].hasDblClickListener(), false)
  })
})
