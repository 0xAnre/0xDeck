import type { IChartApi } from 'lightweight-charts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import {
  hitTestChartObjectSettingsTarget,
  type ChartObjectSettingsHitTestContext,
} from './chartObjectSettingsHitTest.ts'
import { pointerMovementWithinClickTolerance } from './chartObjectState.ts'

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

  let pendingActivation: {
    pointerId: number
    startX: number
    startY: number
    target: ChartObjectSettingsTarget
  } | null = null

  const resolvePaneY = (event: PointerEvent): number => {
    const rect = paneElement.getBoundingClientRect()
    return event.clientY - rect.top
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    const ctx = callbacks.getHitTestContext(paneX, paneY)
    if (!ctx) {
      pendingActivation = null
      return
    }
    const target = hitTestChartObjectSettingsTarget(ctx)
    if (!target) {
      pendingActivation = null
      return
    }
    pendingActivation = {
      pointerId: event.pointerId,
      startX: paneX,
      startY: paneY,
      target,
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pendingActivation || pendingActivation.pointerId !== event.pointerId) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    if (
      !pointerMovementWithinClickTolerance(
        pendingActivation.startX,
        pendingActivation.startY,
        paneX,
        paneY,
      )
    ) {
      pendingActivation = null
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (!pendingActivation || pendingActivation.pointerId !== event.pointerId) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    if (
      pointerMovementWithinClickTolerance(
        pendingActivation.startX,
        pendingActivation.startY,
        paneX,
        paneY,
      )
    ) {
      callbacks.onActivate(pendingActivation.target)
    }
    pendingActivation = null
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (pendingActivation?.pointerId === event.pointerId) {
      pendingActivation = null
    }
  }

  paneElement.addEventListener('pointerdown', onPointerDown)
  paneElement.addEventListener('pointermove', onPointerMove)
  paneElement.addEventListener('pointerup', onPointerUp)
  paneElement.addEventListener('pointercancel', onPointerCancel)

  return {
    dispose: () => {
      paneElement.removeEventListener('pointerdown', onPointerDown)
      paneElement.removeEventListener('pointermove', onPointerMove)
      paneElement.removeEventListener('pointerup', onPointerUp)
      paneElement.removeEventListener('pointercancel', onPointerCancel)
    },
  }
}
