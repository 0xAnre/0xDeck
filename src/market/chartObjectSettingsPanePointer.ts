import type { IChartApi } from 'lightweight-charts'
import {
  bindChartPaneRoleElementListeners,
  type ChartPaneElementRole,
} from './chartPaneRoles.ts'
import { pointerMovementWithinClickTolerance } from './chartObjectState.ts'
import { releaseDrawingCursor, updateDrawingCursor } from './drawingCursor.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import {
  hitTestChartObjectSettingsTarget,
  type ChartObjectSettingsHitTestContext,
} from './chartObjectSettingsHitTest.ts'
import {
  resolveOverlayIndicatorSelectionTarget,
  type OverlayIndicatorSelectionTarget,
} from './overlayIndicatorSelection.ts'

const OVERLAY_INDICATOR_CURSOR_TOOL = 'overlay-indicator'

export type ChartObjectSettingsPanePointerCallbacks = {
  getHitTestContext: (
    paneX: number,
    paneY: number,
    paneRole: ChartPaneElementRole,
  ) => ChartObjectSettingsHitTestContext | null
  onActivate: (target: ChartObjectSettingsTarget) => void
  /**
   * Single click resolved an overlay indicator under the pointer (gap G3).
   * Optional so the module stays usable by callers that only need settings.
   */
  onSelectOverlay?: (target: OverlayIndicatorSelectionTarget) => void
  /** The press resolved no overlay indicator: empty pane space or a drawing. */
  onDeselectOverlay?: () => void
}

export type ChartObjectSettingsPanePointerController = {
  dispose: () => void
}

type PressedPointer = { x: number; y: number }

/**
 * Pointer interactions on every pane that owns a chart object: the candle pane
 * (drawings and overlay series), the RSI pane and the Aggregated Liquidations
 * pane. Listeners follow the pane elements because panes are added, removed and
 * reordered at runtime.
 *
 * Single click selects an overlay indicator (drawings keep their own tool
 * pointer modules); double click opens that object's settings. Both resolutions
 * use `hitTestChartObjectSettingsTarget`, so drawing-before-overlay precedence,
 * peer arbitration and the armed/in-progress lock come from the shared hit test
 * instead of a second interaction system.
 */
export function attachChartObjectSettingsPanePointer(
  chart: IChartApi,
  callbacks: ChartObjectSettingsPanePointerCallbacks,
): ChartObjectSettingsPanePointerController {
  const paneElementBinding = bindChartPaneRoleElementListeners(
    chart,
    (role: ChartPaneElementRole, paneElement: HTMLElement) => {
      let pressed: PressedPointer | null = null

      const resolveTarget = (event: MouseEvent): ChartObjectSettingsTarget | null => {
        const rect = paneElement.getBoundingClientRect()
        const paneX = resolvePaneRelativePointerX(event, paneElement)
        const paneY = event.clientY - rect.top
        const ctx = callbacks.getHitTestContext(paneX, paneY, role)
        if (!ctx) return null
        return hitTestChartObjectSettingsTarget(ctx)
      }

      const onPaneDblClick = (event: MouseEvent) => {
        if (event.button !== 0) return
        const target = resolveTarget(event)
        if (!target) return
        callbacks.onActivate(target)
      }

      const onPanePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return
        pressed = { x: event.clientX, y: event.clientY }
        // Selection is decided on pointer up (click vs drag): a press that turns
        // into a pan must not select. Any press that is not on an overlay
        // indicator already releases the previous selection, which is what the
        // drawing tools do for empty space on pointer down.
        if (resolveOverlayIndicatorSelectionTarget(resolveTarget(event))) return
        callbacks.onDeselectOverlay?.()
      }

      const onPanePointerUp = (event: PointerEvent) => {
        const start = pressed
        pressed = null
        if (event.button !== 0) return
        if (!start) return
        if (
          !pointerMovementWithinClickTolerance(
            start.x,
            start.y,
            event.clientX,
            event.clientY,
          )
        ) {
          return
        }
        const selection = resolveOverlayIndicatorSelectionTarget(resolveTarget(event))
        if (!selection) return
        callbacks.onSelectOverlay?.(selection)
      }

      const onPanePointerCancel = () => {
        pressed = null
      }

      const onPanePointerMove = (event: PointerEvent) => {
        if (pressed !== null) {
          // A press/drag owns the pointer: no hover cursor mid-gesture.
          releaseDrawingCursor(paneElement, OVERLAY_INDICATOR_CURSOR_TOOL)
          return
        }
        const selection = resolveOverlayIndicatorSelectionTarget(resolveTarget(event))
        if (!selection) {
          releaseDrawingCursor(paneElement, OVERLAY_INDICATOR_CURSOR_TOOL)
          return
        }
        // Overlay indicators are selectable but never movable or resizable.
        updateDrawingCursor(paneElement, OVERLAY_INDICATOR_CURSOR_TOOL, {
          kind: 'body',
          movable: false,
        })
      }

      const onPanePointerLeave = () => {
        pressed = null
        releaseDrawingCursor(paneElement, OVERLAY_INDICATOR_CURSOR_TOOL)
      }

      // Native pane dblclick: chart.subscribeDblClick misses drawing hits because
      // line/rectangle pointerdown calls preventDefault (suppresses compat mouse clicks)
      // and move/resize capture can cancel the chart's internal click-sequence dblclick.
      paneElement.addEventListener('dblclick', onPaneDblClick as EventListener)
      paneElement.addEventListener('pointerdown', onPanePointerDown as EventListener)
      paneElement.addEventListener('pointerup', onPanePointerUp as EventListener)
      paneElement.addEventListener('pointercancel', onPanePointerCancel as EventListener)
      paneElement.addEventListener('pointermove', onPanePointerMove as EventListener)
      paneElement.addEventListener('pointerleave', onPanePointerLeave as EventListener)
      return () => {
        releaseDrawingCursor(paneElement, OVERLAY_INDICATOR_CURSOR_TOOL)
        paneElement.removeEventListener('dblclick', onPaneDblClick as EventListener)
        paneElement.removeEventListener('pointerdown', onPanePointerDown as EventListener)
        paneElement.removeEventListener('pointerup', onPanePointerUp as EventListener)
        paneElement.removeEventListener('pointercancel', onPanePointerCancel as EventListener)
        paneElement.removeEventListener('pointermove', onPanePointerMove as EventListener)
        paneElement.removeEventListener('pointerleave', onPanePointerLeave as EventListener)
      }
    },
  )

  return {
    dispose: () => {
      paneElementBinding.dispose()
    },
  }
}
