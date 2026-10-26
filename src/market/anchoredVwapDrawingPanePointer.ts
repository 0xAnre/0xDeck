import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { bindCandlePaneElementListeners, resolveCandlePaneElement } from './candlePane.ts'
import { preferDrawingPointerTargetAmongPeers } from './drawingPointerArbitration.ts'
import type { FixedRangeVolumeProfileHitTarget } from './fixedRangeVolumeProfileHitTest.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import {
  applyAnchoredVwapDrawingSelection,
  cancelAnchoredVwapDrawingInteraction,
  commitAnchoredVwapAnchorDrag,
  createAnchoredVwapFromAnchorTime,
  isAnchoredVwapDrawingNavigationLocked,
  isAnchoredVwapDrawingToolArmed,
  restoreAnchoredVwapDragAnchor,
  startAnchoredVwapAnchorDrag,
  type AnchoredVwapDrawingInteractionState,
} from './anchoredVwapDrawingInteraction.ts'
import { releaseDrawingCursor, updateDrawingCursor } from './drawingCursor.ts'
import { hitTestAnchoredVwapDrawings } from './anchoredVwapDrawingHitTest.ts'
import { projectAnchoredVwapDrawingInstance } from './anchoredVwapDrawingRenderGeometry.ts'
import {
  isAnchoredVwapInstanceHidden,
  isAnchoredVwapInstanceLocked,
  type AnchoredVwapInstance,
} from './anchoredVwapInstances.ts'
import { resolveAnchoredVwapAnchorTimeFromPointer } from './anchoredVwapDrawing.ts'
import type { LineHitTarget } from './lineHitTest.ts'
import { resolvePointerChartPoint } from './rectangleChartCoordinates.ts'
import { buildRectangleChartTimeContext } from './rectangleChartTime.ts'
import type { RectangleHitTarget } from './rectangleHitTest.ts'
import type { MarketCandle } from './types.ts'

export type AnchoredVwapDrawingPanePointerCallbacks = {
  getSnapshot: () => {
    interaction: AnchoredVwapDrawingInteractionState
    instances: readonly AnchoredVwapInstance[]
    candles: readonly MarketCandle[]
  }
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  onInteractionChange: (state: AnchoredVwapDrawingInteractionState) => void
  onInstancesChange: (instances: AnchoredVwapInstance[]) => void
  onInstanceUpdated: (instance: AnchoredVwapInstance) => void
  onRequestRender: () => void
  isAlternateToolActive: () => boolean
  getCompetingLineHit: (paneX: number, paneY: number) => LineHitTarget | null
  getCompetingRectangleHit: (paneX: number, paneY: number) => RectangleHitTarget | null
  getCompetingFrvpHit: (paneX: number, paneY: number) => FixedRangeVolumeProfileHitTarget | null
}

export type AnchoredVwapDrawingPanePointerController = {
  dispose: () => void
}

function focusPane(paneElement: HTMLElement): void {
  if (typeof paneElement.focus !== 'function') return
  if (paneElement.tabIndex < 0) paneElement.tabIndex = -1
  paneElement.focus()
}

export function attachAnchoredVwapDrawingPanePointer(
  chart: IChartApi,
  callbacks: AnchoredVwapDrawingPanePointerCallbacks,
): AnchoredVwapDrawingPanePointerController {
  const initialPaneElement = resolveCandlePaneElement(chart)
  if (!initialPaneElement) {
    return { dispose: () => {} }
  }
  let paneElement = initialPaneElement

  let activePointerId: number | null = null

  const resolvePaneY = (event: PointerEvent): number => {
    const rect = paneElement.getBoundingClientRect()
    return event.clientY - rect.top
  }

  const timeContext = () =>
    buildRectangleChartTimeContext(
      chart,
      callbacks.getLastBarUnixTime(),
      callbacks.getIntervalDurationSeconds(),
    )

  const projectInstance = (instance: AnchoredVwapInstance) => {
    const series = callbacks.getSeries()
    if (!series) return null
    return projectAnchoredVwapDrawingInstance(
      chart,
      series,
      callbacks.getSnapshot().candles,
      instance,
      timeContext(),
    )
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (callbacks.isAlternateToolActive()) return
    const snapshot = callbacks.getSnapshot()
    const interaction = snapshot.interaction
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)

    if (isAnchoredVwapDrawingToolArmed(interaction)) {
      const anchorTime = resolveAnchoredVwapAnchorTimeFromPointer(snapshot.candles, (() => {
        const series = callbacks.getSeries()
        if (!series) return NaN
        const point = resolvePointerChartPoint(chart, series, paneX, paneY, timeContext())
        return point?.time ?? NaN
      })())
      if (anchorTime === null) return
      const created = createAnchoredVwapFromAnchorTime(snapshot.instances, anchorTime)
      if (!created) return
      event.preventDefault()
      event.stopPropagation()
      focusPane(paneElement)
      callbacks.onInstancesChange(created.instances)
      callbacks.onInteractionChange(
        applyAnchoredVwapDrawingSelection(
          { phase: 'inactive', selectedId: created.instance.id, draft: null },
          created.instance.id,
        ),
      )
      callbacks.onRequestRender()
      return
    }

    if (interaction.phase === 'inactive') {
      const avwapHit = hitTestAnchoredVwapDrawings(
        snapshot.instances,
        interaction.selectedId,
        paneX,
        paneY,
        projectInstance,
      )
      const lineHit = callbacks.getCompetingLineHit(paneX, paneY)
      const rectangleHit = callbacks.getCompetingRectangleHit(paneX, paneY)
      const frvpHit = callbacks.getCompetingFrvpHit(paneX, paneY)
      const preferred = preferDrawingPointerTargetAmongPeers(
        lineHit,
        rectangleHit,
        frvpHit,
        avwapHit,
      )
      if (preferred !== null && preferred !== 'anchored-vwap') {
        if (interaction.selectedId !== null) {
          callbacks.onInteractionChange(applyAnchoredVwapDrawingSelection(interaction, null))
        }
        return
      }
      if (!avwapHit) {
        if (interaction.selectedId !== null) {
          callbacks.onInteractionChange(applyAnchoredVwapDrawingSelection(interaction, null))
          callbacks.onRequestRender()
        }
        return
      }
      const instance = snapshot.instances.find((item) => item.id === avwapHit.instanceId)
      if (!instance || isAnchoredVwapInstanceHidden(instance)) return
      event.preventDefault()
      event.stopPropagation()
      focusPane(paneElement)
      callbacks.onInteractionChange(
        applyAnchoredVwapDrawingSelection(interaction, avwapHit.instanceId),
      )
      if (avwapHit.kind === 'anchor' && !isAnchoredVwapInstanceLocked(instance)) {
        activePointerId = event.pointerId
        paneElement.setPointerCapture(event.pointerId)
        callbacks.onInteractionChange(
          startAnchoredVwapAnchorDrag(
            applyAnchoredVwapDrawingSelection(interaction, avwapHit.instanceId),
            avwapHit.instanceId,
            instance.anchorTime,
          ),
        )
      }
      callbacks.onRequestRender()
    }
  }

  /** Feed this tool's winning hit target to the shared cursor mapping. */
  const syncHoverCursor = (event: PointerEvent) => {
    const snapshot = callbacks.getSnapshot()
    if (
      isAnchoredVwapDrawingNavigationLocked(snapshot.interaction) ||
      isAnchoredVwapDrawingToolArmed(snapshot.interaction) ||
      callbacks.isAlternateToolActive()
    ) {
      releaseDrawingCursor(paneElement, 'anchored-vwap')
      return
    }
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    const avwapHit = hitTestAnchoredVwapDrawings(
      snapshot.instances,
      snapshot.interaction.selectedId,
      paneX,
      paneY,
      projectInstance,
    )
    if (!avwapHit) {
      releaseDrawingCursor(paneElement, 'anchored-vwap')
      return
    }
    if (
      preferDrawingPointerTargetAmongPeers(
        callbacks.getCompetingLineHit(paneX, paneY),
        callbacks.getCompetingRectangleHit(paneX, paneY),
        callbacks.getCompetingFrvpHit(paneX, paneY),
        avwapHit,
      ) !== 'anchored-vwap'
    ) {
      releaseDrawingCursor(paneElement, 'anchored-vwap')
      return
    }
    const instance = snapshot.instances.find((item) => item.id === avwapHit.instanceId)
    updateDrawingCursor(paneElement, 'anchored-vwap', {
      kind: avwapHit.kind,
      movable: false,
      locked: instance ? isAnchoredVwapInstanceLocked(instance) : false,
      hidden: instance ? isAnchoredVwapInstanceHidden(instance) : false,
    })
  }

  const onPointerMove = (event: PointerEvent) => {
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase !== 'dragging-anchor' || !snapshot.interaction.draft) {
      syncHoverCursor(event)
      return
    }
    // A drag owns the pointer: no hover cursor mid-gesture.
    releaseDrawingCursor(paneElement, 'anchored-vwap')
    if (activePointerId !== event.pointerId) return
    const series = callbacks.getSeries()
    if (!series) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    const point = resolvePointerChartPoint(chart, series, paneX, paneY, timeContext())
    if (!point) return
    const anchorTime = resolveAnchoredVwapAnchorTimeFromPointer(snapshot.candles, point.time)
    if (anchorTime === null) return
    const instance = snapshot.instances.find(
      (item) => item.id === snapshot.interaction.draft?.instanceId,
    )
    if (!instance || instance.anchorTime === anchorTime) return
    callbacks.onInstanceUpdated({ ...instance, anchorTime })
    callbacks.onRequestRender()
  }

  const onPointerLeave = () => {
    releaseDrawingCursor(paneElement, 'anchored-vwap')
  }

  const releasePointer = (event: PointerEvent) => {
    activePointerId = null
    // Never keep the anchor cursor after the drag ended.
    releaseDrawingCursor(paneElement, 'anchored-vwap')
    try {
      paneElement.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase === 'dragging-anchor') {
      callbacks.onInteractionChange(commitAnchoredVwapAnchorDrag(snapshot.interaction))
    }
    releasePointer(event)
    callbacks.onRequestRender()
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    const snapshot = callbacks.getSnapshot()
    if (isAnchoredVwapDrawingNavigationLocked(snapshot.interaction)) {
      const restored = restoreAnchoredVwapDragAnchor(snapshot.interaction, snapshot.instances)
      if (restored) callbacks.onInstanceUpdated(restored)
      callbacks.onInteractionChange(cancelAnchoredVwapDrawingInteraction(snapshot.interaction))
      callbacks.onRequestRender()
    }
    releasePointer(event)
  }

  const paneElementBinding = bindCandlePaneElementListeners(
    chart,
    [
      { type: 'pointerdown', listener: onPointerDown as EventListener },
      { type: 'pointermove', listener: onPointerMove as EventListener },
      { type: 'pointerup', listener: onPointerUp as EventListener },
      { type: 'pointercancel', listener: onPointerCancel as EventListener },
      { type: 'pointerleave', listener: onPointerLeave as EventListener },
    ],
    (next) => {
      if (paneElement !== next) releaseDrawingCursor(paneElement, 'anchored-vwap')
      paneElement = next
    },
  )

  return {
    dispose: () => {
      releaseDrawingCursor(paneElement, 'anchored-vwap')
      paneElementBinding.dispose()
    },
  }
}
