import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MouseEventParams, Time } from 'lightweight-charts'
import { attachChartObjectSettingsPanePointer } from './chartObjectSettingsPanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'

function createChartHarness() {
  let dblClickHandler: ((param: MouseEventParams<Time>) => void) | null = null
  const chart = {
    subscribeDblClick: (handler: (param: MouseEventParams<Time>) => void) => {
      dblClickHandler = handler
    },
    unsubscribeDblClick: (handler: (param: MouseEventParams<Time>) => void) => {
      if (dblClickHandler === handler) {
        dblClickHandler = null
      }
    },
  }
  return {
    chart,
    fireDblClick: (param: MouseEventParams<Time>) => {
      dblClickHandler?.(param)
    },
    hasHandler: () => dblClickHandler !== null,
  }
}

describe('attachChartObjectSettingsPanePointer', () => {
  it('subscribes to chart double-click and unsubscribes on dispose', () => {
    const harness = createChartHarness()
    const controller = attachChartObjectSettingsPanePointer(harness.chart as never, {
      getHitTestContext: () => null,
      onActivate: () => {},
    })
    assert.equal(harness.hasHandler(), true)
    controller.dispose()
    assert.equal(harness.hasHandler(), false)
  })

  it('does not activate when double-click has no point or no hit target', () => {
    const harness = createChartHarness()
    const activations: ChartObjectSettingsTarget[] = []
    attachChartObjectSettingsPanePointer(harness.chart as never, {
      getHitTestContext: () => null,
      onActivate: (target) => {
        activations.push(target)
      },
    })

    harness.fireDblClick({} as MouseEventParams<Time>)
    harness.fireDblClick({ point: { x: 12, y: 34 } } as MouseEventParams<Time>)
    assert.equal(activations.length, 0)
  })
})
