import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { preferDrawingPointerTargetAmongPeers } from './drawingPointerArbitration.ts'
import type { FixedRangeVolumeProfileHitTarget } from './fixedRangeVolumeProfileHitTest.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import {
  applyAnchoredVwapDrawingSelection,
  commitAnchoredVwapAnchorDrag,
  createAnchoredVwapFromAnchorTime,
  isAnchoredVwapDrawingToolArmed,
  startAnchoredVwapAnchorDrag,
  type AnchoredVwapDrawingInteractionState,
} from './anchoredVwapDrawingInteraction.ts'
import { hitTestAnchoredVwapDrawings } from './anchoredVwapDrawingHitTest.ts'
import { computeAnchoredVwapDrawingPointsForInstance } from './anchoredVwapDrawingChartSeries.ts'
import { anchorScreenYFromPoints } from './anchoredVwapDrawingHitTest.ts'
import {
  isAnchoredVwapInstanceHidden,
  isAnchoredVwapInstanceLocked,
  type AnchoredVwapInstance,
} from './anchoredVwapInstances.ts'
import { resolveAnchoredVwapAnchorTimeFromPointer } from './anchoredVwapDrawing.ts'
import type { LineHitTarget } from './lineHitTest.ts'
import { resolvePointerChartPoint } from './rectangleChartCoordinates.ts'
import {
  buildRectangleChartTimeContext,
  resolveRectangleTimeToCoordinate,
} from './rectangleChartTime.ts'
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
  const pane = chart.panes()[0]
  const paneElement = pane.getHTMLElement()
  if (!paneElement) {
    return { dispose: () => {} }
  }

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
    const anchorX = resolveRectangleTimeToCoordinate(
      chart,
      instance.anchorTime,
      'start',
      timeContext(),
    )
    const points = computeAnchoredVwapDrawingPointsForInstance(
      callbacks.getSnapshot().candles,
      instance,
    )
    const anchorY = anchorScreenYFromPoints(points, (price) => series.priceToCoordinate(price))
    const bodySegments: { x1: number; y1: number; x2: number; y2: number }[] = []
    let prev: { x: number; y: number } | null = null
    for (const point of points) {
      if (point.vwap === null) continue
      const x = resolveRectangleTimeToCoordinate(chart, point.time, 'start', timeContext())
      const y = series.priceToCoordinate(point.vwap)
      if (x === null || y === null) continue
      if (prev) {
        bodySegments.push({ x1: prev.x, y1: prev.y, x2: x, y2: y })
      }
      prev = { x, y }
    }
    return { anchorX, anchorY, bodySegments }
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
      const preferred = preferDrawingPointerTargetAmongPeers(lineHit, rectangleHit, frvpHit)
      if (preferred !== null) {
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

  const onPointerMove = (event: PointerEvent) => {
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase !== 'dragging-anchor' || !snapshot.interaction.draft) return
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

  const onPointerUp = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase === 'dragging-anchor') {
      callbacks.onInteractionChange(commitAnchoredVwapAnchorDrag(snapshot.interaction))
    }
    activePointerId = null
    try {
      paneElement.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
    callbacks.onRequestRender()
  }

  paneElement.addEventListener('pointerdown', onPointerDown)
  paneElement.addEventListener('pointermove', onPointerMove)
  paneElement.addEventListener('pointerup', onPointerUp)
  paneElement.addEventListener('pointercancel', onPointerUp)

  return {
    dispose: () => {
      paneElement.removeEventListener('pointerdown', onPointerDown)
      paneElement.removeEventListener('pointermove', onPointerMove)
      paneElement.removeEventListener('pointerup', onPointerUp)
      paneElement.removeEventListener('pointercancel', onPointerUp)
    },
  }
}
