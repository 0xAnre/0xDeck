import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  bindCandlePaneElementListeners,
  resolveCandlePriceScale,
} from './candlePane.ts'
import { pointerMovementWithinClickTolerance } from './chartObjectState.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import {
  isValidRightDragRange,
  resolveRightDragSpanFactors,
  scaleLogicalRangeAroundAnchor,
  scalePriceRangeAroundAnchor,
  type RightDragChartRange,
} from './rightDragChartScaling.ts'

/**
 * How long a native context-menu request is suppressed after a drag ends.
 * Chromium on Windows asks for the menu on button release, i.e. after the
 * gesture has already ended; this tail keeps the released drag from opening
 * the menu behind the user's back.
 */
export const RIGHT_DRAG_CONTEXT_MENU_TAIL_MS = 750

export type RightDragChartScalingCallbacks = {
  /** The candle series of the same chart (price coordinate conversion). */
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  /**
   * True while another interaction owns chart navigation (a drawing is being
   * created, moved or resized). The gesture then stays out of the way instead
   * of fighting the drawing for the same pointer.
   */
  isBlocked?: () => boolean
  /** Called after a gesture that actually changed a range (viewport capture). */
  onGestureEnd?: () => void
}

export type RightDragChartScalingController = {
  dispose: () => void
}

type ActiveGesture = {
  pointerId: number
  startClientX: number
  startClientY: number
  anchorLogical: number
  anchorPrice: number
  initialTimeRange: RightDragChartRange
  initialPriceRange: RightDragChartRange
  dragged: boolean
}

function toFiniteRange(value: {
  from: number
  to: number
} | null): RightDragChartRange | null {
  if (!value) return null
  const range = { from: Number(value.from), to: Number(value.to) }
  return isValidRightDragRange(range) ? range : null
}

/**
 * Right-button press-and-hold on the candle pane scales time and price around
 * the pressed chart point. Bound through `bindCandlePaneElementListeners`, so
 * the listeners follow the pane that owns the registered candle series across
 * reorders and never touch the RSI or Aggregated Liquidations panes.
 *
 * Uses only public lightweight-charts 5 APIs:
 * `timeScale().getVisibleLogicalRange()/setVisibleLogicalRange()/
 * coordinateToLogical()`, `priceScale('right', candlePane).getVisibleRange()/
 * setVisibleRange()/setAutoScale()`, and `series.coordinateToPrice()`.
 *
 * A plain right click never mutates a range: scaling starts after
 * `pointerMovementWithinClickTolerance`. Vertical movement opts the candle
 * price scale into the existing manual range mode (`setAutoScale(false)` +
 * `setVisibleRange`), which the panel's viewport capture then persists;
 * horizontal-only gestures never touch the price scale, so autoscale stays on.
 * The native context menu is suppressed while a right-button gesture is
 * pending or active on this pane (browsers request it on button press, which
 * would otherwise interrupt the drag) and for a short tail after a drag.
 */
export function attachRightDragChartScaling(
  chart: IChartApi,
  callbacks: RightDragChartScalingCallbacks,
): RightDragChartScalingController {
  let paneElement: HTMLElement | null = null
  let gesture: ActiveGesture | null = null
  let suppressContextMenuUntil = 0

  const resolvePriceScale = () => resolveCandlePriceScale(chart)

  const readVisibleTimeRange = (): RightDragChartRange | null =>
    toFiniteRange(chart.timeScale().getVisibleLogicalRange())

  const readVisiblePriceRange = (
    series: ISeriesApi<SeriesType, Time>,
    paneHeight: number,
  ): RightDragChartRange | null => {
    const direct = toFiniteRange(resolvePriceScale().getVisibleRange())
    if (direct) return direct
    // Autoscaled scales may not report a range before a layout pass; derive it
    // from the pane coordinates instead of guessing from the series data.
    if (!Number.isFinite(paneHeight) || paneHeight <= 0) return null
    const top = series.coordinateToPrice(0)
    const bottom = series.coordinateToPrice(paneHeight)
    if (top === null || bottom === null) return null
    const derived = { from: Number(bottom), to: Number(top) }
    return isValidRightDragRange(derived) ? derived : null
  }

  const applyGesture = (active: ActiveGesture, deltaX: number, deltaY: number): void => {
    const factors = resolveRightDragSpanFactors(deltaX, deltaY)

    if (factors.time !== 1) {
      const nextTimeRange = scaleLogicalRangeAroundAnchor(
        active.initialTimeRange,
        active.anchorLogical,
        factors.time,
      )
      if (nextTimeRange) {
        chart.timeScale().setVisibleLogicalRange(nextTimeRange)
      }
    }

    if (factors.price !== 1) {
      const nextPriceRange = scalePriceRangeAroundAnchor(
        active.initialPriceRange,
        active.anchorPrice,
        factors.price,
      )
      if (nextPriceRange) {
        const priceScale = resolvePriceScale()
        priceScale.setAutoScale(false)
        priceScale.setVisibleRange(nextPriceRange)
      }
    }
  }

  const removeWindowListeners = () => {
    if (typeof window === 'undefined') return
    window.removeEventListener('pointerup', onWindowPointerEnd as EventListener, true)
    window.removeEventListener('pointercancel', onWindowPointerEnd as EventListener, true)
  }

  const addWindowListeners = () => {
    if (typeof window === 'undefined') return
    window.addEventListener('pointerup', onWindowPointerEnd as EventListener, true)
    window.addEventListener('pointercancel', onWindowPointerEnd as EventListener, true)
  }

  /**
   * Ends the gesture and reports whether it had actually scaled something.
   * The gesture is cleared before releasing capture so a synchronous
   * `lostpointercapture` re-entry finds no state to end twice.
   */
  const endGesture = (pointerId: number): boolean => {
    if (!gesture) return false
    const dragged = gesture.dragged
    gesture = null
    removeWindowListeners()
    const element = paneElement
    if (element && typeof element.hasPointerCapture === 'function') {
      try {
        if (element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId)
        }
      } catch {
        // The browser already dropped capture (pointercancel, element detach).
      }
    }
    return dragged
  }

  const finishDrag = (pointerId: number): void => {
    const dragged = endGesture(pointerId)
    if (!dragged) return
    suppressContextMenuUntil = Date.now() + RIGHT_DRAG_CONTEXT_MENU_TAIL_MS
    callbacks.onGestureEnd?.()
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 2) return
    // Never chord with a left-button pan/drawing drag that is already down.
    if ((event.buttons & 1) !== 0) return
    if (gesture !== null) return
    if (callbacks.isBlocked?.()) return

    const element = paneElement
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return
    if (rect.width <= 0 || rect.height <= 0) return

    const series = callbacks.getSeries()
    if (!series) return

    const paneX = resolvePaneRelativePointerX(event, element)
    const paneY = event.clientY - rect.top
    if (!Number.isFinite(paneX) || !Number.isFinite(paneY)) return

    const timeScale = chart.timeScale()
    const initialTimeRange = readVisibleTimeRange()
    const anchorLogical = Number(timeScale.coordinateToLogical(paneX))
    const initialPriceRange = readVisiblePriceRange(series, rect.height)
    const anchorPrice = series.coordinateToPrice(paneY)
    if (!initialTimeRange || !Number.isFinite(anchorLogical)) return
    if (!initialPriceRange || anchorPrice === null) return
    const anchorPriceNumber = Number(anchorPrice)
    if (!Number.isFinite(anchorPriceNumber)) return

    // A new press may itself become a drag: suppress the menu from now on.
    suppressContextMenuUntil = 0
    gesture = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      anchorLogical,
      anchorPrice: anchorPriceNumber,
      initialTimeRange,
      initialPriceRange,
      dragged: false,
    }
    addWindowListeners()
    try {
      element.setPointerCapture(event.pointerId)
    } catch {
      // Window-level pointerup/pointercancel still end the gesture.
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const active = gesture
    if (!active || event.pointerId !== active.pointerId) return
    if (!active.dragged) {
      if (
        pointerMovementWithinClickTolerance(
          active.startClientX,
          active.startClientY,
          event.clientX,
          event.clientY,
        )
      ) {
        return
      }
      active.dragged = true
    }
    event.preventDefault()
    applyGesture(
      active,
      event.clientX - active.startClientX,
      event.clientY - active.startClientY,
    )
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    finishDrag(event.pointerId)
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    finishDrag(event.pointerId)
  }

  /** Capture can be lost while the button is still down (element detach). */
  const onLostPointerCapture = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    finishDrag(event.pointerId)
  }

  /**
   * Fail-safe for a release outside the pane when pointer capture did not take
   * effect. Runs in the capture phase, before bubble-phase pane listeners.
   */
  const onWindowPointerEnd = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    finishDrag(event.pointerId)
  }

  const onContextMenu = (event: MouseEvent) => {
    const gestureActive = gesture !== null
    const inTail = Date.now() < suppressContextMenuUntil
    if (!gestureActive && !inTail) return
    event.preventDefault()
    event.stopPropagation()
  }

  const paneElementBinding = bindCandlePaneElementListeners(
    chart,
    [
      { type: 'pointerdown', listener: onPointerDown as EventListener },
      { type: 'pointermove', listener: onPointerMove as EventListener },
      { type: 'pointerup', listener: onPointerUp as EventListener },
      { type: 'pointercancel', listener: onPointerCancel as EventListener },
      { type: 'lostpointercapture', listener: onLostPointerCapture as EventListener },
      { type: 'contextmenu', listener: onContextMenu as EventListener },
    ],
    (next) => {
      if (gesture !== null) {
        // The pane moved mid-gesture: commit what was scaled, drop the rest.
        finishDrag(gesture.pointerId)
      }
      paneElement = next
    },
  )

  return {
    dispose: () => {
      if (gesture !== null) {
        endGesture(gesture.pointerId)
      }
      removeWindowListeners()
      paneElementBinding.dispose()
      paneElement = null
    },
  }
}
