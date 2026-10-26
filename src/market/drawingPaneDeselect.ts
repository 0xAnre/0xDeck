import type { IChartApi } from 'lightweight-charts'
import { bindChartPaneRoleElementListeners } from './chartPaneRoles.ts'

export type DrawingPaneDeselectCallbacks = {
  /** A left click landed in a pane that hosts no drawings. */
  onEmptyPanePointerDown: () => void
  /** Panel ownership check (`isActiveRectangleKeyboardPanel`). */
  shouldHandle?: () => boolean
}

export type DrawingPaneDeselectController = {
  dispose: () => void
}

/**
 * Empty-space click on the RSI / Aggregated Liquidations panes clears the
 * drawing selection exactly like an empty-space click on the candle pane. The
 * listener is passive: it never creates, moves or cancels a drawing, so chart
 * pan/zoom and an armed tool stay untouched.
 */
export function attachDrawingPaneDeselect(
  chart: IChartApi,
  callbacks: DrawingPaneDeselectCallbacks,
): DrawingPaneDeselectController {
  return bindChartPaneRoleElementListeners(chart, (role, element) => {
    if (role === 'candle') return () => {}

    const onPointerDown = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (pointerEvent.button !== 0) return
      if (callbacks.shouldHandle && !callbacks.shouldHandle()) return
      callbacks.onEmptyPanePointerDown()
    }

    element.addEventListener('pointerdown', onPointerDown)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
    }
  })
}
