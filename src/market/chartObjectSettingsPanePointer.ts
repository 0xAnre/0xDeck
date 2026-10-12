import type { IChartApi } from 'lightweight-charts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import {
  hitTestChartObjectSettingsTarget,
  type ChartObjectSettingsHitTestContext,
} from './chartObjectSettingsHitTest.ts'

export type ChartObjectSettingsPanePointerCallbacks = {
  getHitTestContext: (paneX: number, paneY: number) => ChartObjectSettingsHitTestContext | null
  onActivate: (target: ChartObjectSettingsTarget) => void
}

export type ChartObjectSettingsPanePointerController = {
  dispose: () => void
}

export function attachChartObjectSettingsPanePointer(
  chart: IChartApi,
  callbacks: ChartObjectSettingsPanePointerCallbacks,
): ChartObjectSettingsPanePointerController {
  const pane = chart.panes()[0]
  const paneElement = pane.getHTMLElement()
  if (!paneElement) {
    return { dispose: () => {} }
  }

  const resolvePaneY = (event: MouseEvent): number => {
    const rect = paneElement.getBoundingClientRect()
    return event.clientY - rect.top
  }

  const onPaneDblClick = (event: MouseEvent) => {
    if (event.button !== 0) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    const ctx = callbacks.getHitTestContext(paneX, paneY)
    if (!ctx) return
    const target = hitTestChartObjectSettingsTarget(ctx)
    if (!target) return
    callbacks.onActivate(target)
  }

  // Native pane dblclick: chart.subscribeDblClick misses drawing hits because
  // line/rectangle pointerdown calls preventDefault (suppresses compat mouse clicks)
  // and move/resize capture can cancel the chart's internal click-sequence dblclick.
  paneElement.addEventListener('dblclick', onPaneDblClick)

  return {
    dispose: () => {
      paneElement.removeEventListener('dblclick', onPaneDblClick)
    },
  }
}
