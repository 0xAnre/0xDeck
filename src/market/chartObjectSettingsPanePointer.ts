import type { IChartApi } from 'lightweight-charts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import {
  hitTestChartObjectSettingsTarget,
  type ChartObjectSettingsHitTestContext,
} from './chartObjectSettingsHitTest.ts'
import {
  completePaneDoubleClickSequenceForSettings,
  shouldSuppressChartObjectSettingsDoubleClick,
} from './paneDoubleClickPointerGuard.ts'

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

  const onDoubleClick = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (
      shouldSuppressChartObjectSettingsDoubleClick(
        paneElement,
        event.clientX,
        event.clientY,
      )
    ) {
      return
    }
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    const ctx = callbacks.getHitTestContext(paneX, paneY)
    if (!ctx) return
    const target = hitTestChartObjectSettingsTarget(ctx)
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    completePaneDoubleClickSequenceForSettings(paneElement)
    callbacks.onActivate(target)
  }

  paneElement.addEventListener('dblclick', onDoubleClick)

  return {
    dispose: () => {
      paneElement.removeEventListener('dblclick', onDoubleClick)
    },
  }
}
