import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachChartObjectSettingsPanePointer } from './chartObjectSettingsPanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'

function createChartHarness() {
  const listeners = new Map<string, EventListener>()
  const paneElement = {
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener)
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type)
      }
    },
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement

  const chart = {
    panes: () => [{ getHTMLElement: () => paneElement }],
  }

  return {
    chart,
    paneElement,
    listeners,
    firePaneDblClick: (event: MouseEvent) => {
      listeners.get('dblclick')?.(event)
    },
    hasDblClickListener: () => listeners.has('dblclick'),
  }
}

describe('attachChartObjectSettingsPanePointer', () => {
  it('attaches native pane dblclick and removes it on dispose', () => {
    const harness = createChartHarness()
    const controller = attachChartObjectSettingsPanePointer(harness.chart as never, {
      getHitTestContext: () => null,
      onActivate: () => {},
    })
    assert.equal(harness.hasDblClickListener(), true)
    controller.dispose()
    assert.equal(harness.hasDblClickListener(), false)
  })

  it('does not activate when double-click has no hit target', () => {
    const harness = createChartHarness()
    const activations: ChartObjectSettingsTarget[] = []
    attachChartObjectSettingsPanePointer(harness.chart as never, {
      getHitTestContext: () => null,
      onActivate: (target) => {
        activations.push(target)
      },
    })

    harness.firePaneDblClick({
      button: 0,
      clientX: 12,
      clientY: 34,
    } as MouseEvent)
    assert.equal(activations.length, 0)
  })
})
