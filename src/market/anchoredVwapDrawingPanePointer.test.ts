import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachAnchoredVwapDrawingPanePointer } from './anchoredVwapDrawingPanePointer.ts'
import { INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE } from './anchoredVwapDrawingInteraction.ts'
import { createAnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number): MarketCandle {
  return {
    time,
    open: 10,
    high: 12,
    low: 8,
    close: 10,
    volume: 100,
    interval: '1h',
  }
}

function createPaneHarness() {
  const listeners = new Map<string, EventListener>()
  const paneElement = {
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener)
    },
    removeEventListener: (type: string) => {
      listeners.delete(type)
    },
    hasPointerCapture: () => true,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    focus: () => {},
    tabIndex: -1,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement

  const chart = {
    panes: () => [{ getHTMLElement: () => paneElement }],
    timeScale: () => ({
      coordinateToTime: (x: number) => (x <= 50 ? 100 : 200),
      coordinateToLogical: (x: number) => x,
      timeToIndex: () => 0,
      logicalToCoordinate: (logical: number) => logical,
      timeToCoordinate: (time: number) => (time === 100 ? 50 : 150),
    }),
  }

  return { listeners, paneElement, chart }
}

describe('anchoredVwapDrawingPanePointer', () => {
  it('restores the original anchor on pointercancel during anchor drag', () => {
    const { listeners, chart } = createPaneHarness()
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    let instances = [instance]
    let interaction = INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE
    const candles = [candle(100), candle(200), candle(300)]

    attachAnchoredVwapDrawingPanePointer(chart as never, {
      getSnapshot: () => ({ interaction, instances, candles }),
      getChart: () => chart as never,
      getSeries: () =>
        ({
          coordinateToPrice: () => 10,
          priceToCoordinate: () => 50,
          data: () => [{ time: 100 }, { time: 200 }, { time: 300 }],
        }) as never,
      onInteractionChange: (next) => {
        interaction = next
      },
      onInstancesChange: (next) => {
        instances = next
      },
      onInstanceUpdated: (updated) => {
        instances = instances.map((item) => (item.id === updated.id ? updated : item))
      },
      onRequestRender: () => {},
      isAlternateToolActive: () => false,
      getCompetingLineHit: () => null,
      getCompetingRectangleHit: () => null,
      getCompetingFrvpHit: () => null,
      getIntervalDurationSeconds: () => 3600,
      getLastBarUnixTime: () => 300,
    })

    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 50,
      clientY: 50,
      pointerId: 3,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as PointerEvent)
    assert.equal(interaction.phase, 'dragging-anchor')
    assert.equal(interaction.draft?.initialAnchorTime, 100)

    listeners.get('pointermove')?.({
      clientX: 150,
      clientY: 50,
      pointerId: 3,
    } as PointerEvent)
    assert.notEqual(instances[0]?.anchorTime, 100)

    listeners.get('pointercancel')?.({ pointerId: 3 } as PointerEvent)
    assert.equal(interaction.phase, 'inactive')
    assert.equal(interaction.draft, null)
    assert.equal(instances[0]?.anchorTime, 100)
  })
})
