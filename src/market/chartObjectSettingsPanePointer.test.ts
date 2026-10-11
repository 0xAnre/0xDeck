import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachChartObjectSettingsPanePointer } from './chartObjectSettingsPanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'

function createPaneHarness() {
  const listeners = new Map<string, EventListener>()
  const paneElement = {
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener)
    },
    removeEventListener: (type: string) => {
      listeners.delete(type)
    },
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement

  const chart = {
    panes: () => [{ getHTMLElement: () => paneElement }],
    timeScale: () => ({
      coordinateToTime: () => 120,
      coordinateToLogical: (x: number) => x,
      timeToIndex: () => 1,
      logicalToCoordinate: (logical: number) => logical,
      timeToCoordinate: (time: number) => time,
    }),
  }

  return { listeners, chart }
}

describe('chartObjectSettingsPanePointer', () => {
  it('does not activate settings on pointerdown or pointerup', () => {
    const { listeners, chart } = createPaneHarness()
    const activated: ChartObjectSettingsTarget[] = []

    attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: () => ({
        chart: chart as never,
        series: {} as never,
        paneX: 10,
        paneY: 10,
        interval: '1h',
        intervalDurationSeconds: 3600,
        lastBarUnixTime: 100,
        activeIndicators: [],
        loadedVwapLevel: null,
        loadedVwapInterval: null,
        bundle: {} as never,
        rectangleInteraction: { phase: 'inactive', selectedId: null, draft: null },
        lineInteraction: { phase: 'inactive', selectedId: null, draft: null },
        fixedRangeVolumeProfileInteraction: { phase: 'inactive', selectedId: null, draft: null },
        rectangleInstances: [],
        lineInstances: [],
        fixedRangeVolumeProfileInstances: [],
        fixedRangeVolumeProfileRuntime: {},
        rollingVwapInstances: [],
      }),
      onActivate: (target) => {
        activated.push(target)
      },
    })

    assert.equal(listeners.has('dblclick'), true)
    assert.equal(listeners.has('pointerdown'), false)
    assert.equal(listeners.has('pointerup'), false)
    assert.equal(activated.length, 0)
  })

  it('activates settings on double-click when hit test matches', () => {
    const { listeners, chart } = createPaneHarness()
    const series = {
      coordinateToPrice: (y: number) => 100 - y,
      priceToCoordinate: (price: number) => 100 - price,
      data: () => [{ time: 100 }, { time: 200 }],
    }
    let activated: ChartObjectSettingsTarget | null = null
    let prevented = false
    let stopped = false

    attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: (paneX, paneY) => ({
        chart: chart as never,
        series: series as never,
        paneX,
        paneY,
        interval: '1h',
        intervalDurationSeconds: 3600,
        lastBarUnixTime: 200,
        activeIndicators: [],
        loadedVwapLevel: null,
        loadedVwapInterval: null,
        bundle: {} as never,
        rectangleInteraction: { phase: 'inactive', selectedId: null, draft: null },
        lineInteraction: { phase: 'inactive', selectedId: null, draft: null },
        fixedRangeVolumeProfileInteraction: {
          phase: 'inactive',
          selectedId: null,
          draft: null,
        },
        rectangleInstances: [
          {
            id: 'rect-1',
            fromTime: 100,
            toTime: 200,
            lowPrice: 20,
            highPrice: 80,
            locked: true,
          },
        ],
        lineInstances: [],
        fixedRangeVolumeProfileInstances: [],
        fixedRangeVolumeProfileRuntime: {},
        rollingVwapInstances: [],
      }),
      onActivate: (target) => {
        activated = target
      },
    })

    const onDoubleClick = listeners.get('dblclick')
    assert.ok(onDoubleClick)

    onDoubleClick?.({
      button: 0,
      clientX: 150,
      clientY: 50,
      preventDefault: () => {
        prevented = true
      },
      stopPropagation: () => {
        stopped = true
      },
    } as MouseEvent)

    assert.deepEqual(activated, { kind: 'rectangle', instanceId: 'rect-1' })
    assert.equal(prevented, true)
    assert.equal(stopped, true)
  })

  it('does nothing on double-click when hit test misses', () => {
    const { listeners, chart } = createPaneHarness()
    let activated = false

    attachChartObjectSettingsPanePointer(chart as never, {
      getHitTestContext: () => null,
      onActivate: () => {
        activated = true
      },
    })

    listeners.get('dblclick')?.({
      button: 0,
      clientX: 0,
      clientY: 0,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as MouseEvent)

    assert.equal(activated, false)
  })
})
