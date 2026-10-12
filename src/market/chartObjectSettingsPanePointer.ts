import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
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
  const onDblClick = (param: MouseEventParams<Time>) => {
    if (!param.point) return
    const paneX = param.point.x
    const paneY = param.point.y
    const ctx = callbacks.getHitTestContext(paneX, paneY)
    if (!ctx) return
    const target = hitTestChartObjectSettingsTarget(ctx)
    if (!target) return
    callbacks.onActivate(target)
  }

  chart.subscribeDblClick(onDblClick)

  return {
    dispose: () => {
      chart.unsubscribeDblClick(onDblClick)
    },
  }
}
