import type { IChartApi } from 'lightweight-charts'
import {
  bindChartPaneRoleElementListeners,
  type ChartPaneElementRole,
} from './chartPaneRoles.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import {
  hitTestChartObjectSettingsTarget,
  type ChartObjectSettingsHitTestContext,
} from './chartObjectSettingsHitTest.ts'

export type ChartObjectSettingsPanePointerCallbacks = {
  getHitTestContext: (
    paneX: number,
    paneY: number,
    paneRole: ChartPaneElementRole,
  ) => ChartObjectSettingsHitTestContext | null
  onActivate: (target: ChartObjectSettingsTarget) => void
}

export type ChartObjectSettingsPanePointerController = {
  dispose: () => void
}

/**
 * Double-click to settings on every pane that owns a chart object: the candle
 * pane (drawings and overlay series), the RSI pane and the Aggregated
 * Liquidations pane. Listeners follow the pane elements because panes are added,
 * removed and reordered at runtime.
 */
export function attachChartObjectSettingsPanePointer(
  chart: IChartApi,
  callbacks: ChartObjectSettingsPanePointerCallbacks,
): ChartObjectSettingsPanePointerController {
  const paneElementBinding = bindChartPaneRoleElementListeners(
    chart,
    (role: ChartPaneElementRole, paneElement: HTMLElement) => {
      const onPaneDblClick = (event: MouseEvent) => {
        if (event.button !== 0) return
        const rect = paneElement.getBoundingClientRect()
        const paneX = resolvePaneRelativePointerX(event, paneElement)
        const paneY = event.clientY - rect.top
        const ctx = callbacks.getHitTestContext(paneX, paneY, role)
        if (!ctx) return
        const target = hitTestChartObjectSettingsTarget(ctx)
        if (!target) return
        callbacks.onActivate(target)
      }

      // Native pane dblclick: chart.subscribeDblClick misses drawing hits because
      // line/rectangle pointerdown calls preventDefault (suppresses compat mouse clicks)
      // and move/resize capture can cancel the chart's internal click-sequence dblclick.
      paneElement.addEventListener('dblclick', onPaneDblClick as EventListener)
      return () => {
        paneElement.removeEventListener('dblclick', onPaneDblClick as EventListener)
      }
    },
  )

  return {
    dispose: () => {
      paneElementBinding.dispose()
    },
  }
}
