import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { preferDrawingPointerTarget } from './drawingPointerArbitration.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import type { LineHitTarget } from './lineHitTest.ts'
import {
  applyRectangleSelection,
  cancelRectangleInteraction,
  commitRectangleCreate,
  commitRectangleMove,
  commitRectangleResize,
  isRectangleChartNavigationLocked,
  startRectangleCreateDraft,
  startRectangleMoveDraft,
  startRectangleResizeDraft,
  updateRectangleCreatePreview,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import { hitTestRectangles } from './rectangleHitTest.ts'
import { projectRectangleInstanceToScreenBox } from './rectangleRenderGeometry.ts'
import { resolvePointerChartPoint } from './rectangleChartCoordinates.ts'
import {
  buildRectangleChartTimeContext,
  resolveRectangleTimeToCoordinate,
  type RectangleChartTimeContext,
} from './rectangleChartTime.ts'

export type RectanglePanePointerCallbacks = {
  getSnapshot: () => {
    interaction: RectangleInteractionState
    instances: readonly RectangleInstance[]
  }
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  onInteractionChange: (state: RectangleInteractionState) => void
  onInstanceCompleted: (instance: RectangleInstance) => void
  onInstanceUpdated: (instance: RectangleInstance) => void
  onRequestRender: () => void
  onPointerPreviewChange: (time: number | null, price: number | null) => void
  getPointerPreview: () => { time: number | null; price: number | null }
  isAlternateToolActive: () => boolean
  getCompetingLineHit: (paneX: number, paneY: number) => LineHitTarget | null
}

export type RectanglePanePointerController = {
  dispose: () => void
}

function focusRectangleInteractionPane(paneElement: HTMLElement): void {
  if (typeof paneElement.focus !== 'function') return
  if (paneElement.tabIndex < 0) paneElement.tabIndex = -1
  paneElement.focus()
}

export function attachRectanglePanePointer(
  chart: IChartApi,
  callbacks: RectanglePanePointerCallbacks,
): RectanglePanePointerController {
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

  const resolveTimeContext = (): RectangleChartTimeContext | null => {
    const series = callbacks.getSeries()
    if (!series) return null
    return buildRectangleChartTimeContext(
      chart,
      callbacks.getLastBarUnixTime(),
      callbacks.getIntervalDurationSeconds(),
    )
  }

  const projectInstance = (instance: RectangleInstance) => {
    const series = callbacks.getSeries()
    if (!series) return null
    const timeContext = resolveTimeContext()
    return projectRectangleInstanceToScreenBox(
      instance,
      (time, edge) => resolveRectangleTimeToCoordinate(chart, time, edge, timeContext),
      (price) => series.priceToCoordinate(price),
    )
  }

  const syncPointerPreview = (paneX: number, paneY: number) => {
    const series = callbacks.getSeries()
    if (!series) return
    const point = resolvePointerChartPoint(chart, series, paneX, paneY, resolveTimeContext())
    if (!point) return
    callbacks.onPointerPreviewChange(point.time, point.price)
    const snapshot = callbacks.getSnapshot()
    let next = snapshot.interaction
    if (next.phase === 'creating') {
      next = updateRectangleCreatePreview(next, point.time, point.price)
    }
    if (next !== snapshot.interaction) {
      callbacks.onInteractionChange(next)
    }
    callbacks.onRequestRender()
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (callbacks.isAlternateToolActive()) return
    const snapshot = callbacks.getSnapshot()
    const interaction = snapshot.interaction
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)

    if (interaction.phase === 'armed') {
      const series = callbacks.getSeries()
      if (!series) return
      const point = resolvePointerChartPoint(chart, series, paneX, paneY, resolveTimeContext())
      if (!point) return
      event.preventDefault()
      event.stopPropagation()
      focusRectangleInteractionPane(paneElement)
      const next = startRectangleCreateDraft(interaction, point.time, point.price)
      if (next === interaction) return
      activePointerId = event.pointerId
      paneElement.setPointerCapture(event.pointerId)
      callbacks.onPointerPreviewChange(point.time, point.price)
      callbacks.onInteractionChange(next)
      callbacks.onRequestRender()
      return
    }

    if (interaction.phase === 'inactive') {
      const hit = hitTestRectangles(
        snapshot.instances,
        interaction.selectedId,
        paneX,
        paneY,
        projectInstance,
      )
      if (!hit) {
        if (interaction.selectedId !== null) {
          callbacks.onInteractionChange(applyRectangleSelection(interaction, null))
          callbacks.onRequestRender()
        }
        return
      }
      if (
        preferDrawingPointerTarget(callbacks.getCompetingLineHit(paneX, paneY), hit) !==
        'rectangle'
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      focusRectangleInteractionPane(paneElement)
      if (hit.kind !== 'interior') {
        const instance = snapshot.instances.find((item) => item.id === hit.instanceId)
        if (!instance) return
        const next = startRectangleResizeDraft(interaction, instance, hit.kind)
        if (next === interaction) return
        activePointerId = event.pointerId
        paneElement.setPointerCapture(event.pointerId)
        syncPointerPreview(paneX, paneY)
        callbacks.onInteractionChange(next)
        return
      }
      const instance = snapshot.instances.find((item) => item.id === hit.instanceId)
      if (!instance) return
      const series = callbacks.getSeries()
      if (!series) return
      const point = resolvePointerChartPoint(chart, series, paneX, paneY, resolveTimeContext())
      if (!point) return
      const next = startRectangleMoveDraft(interaction, instance, point.time, point.price)
      if (next === interaction) return
      activePointerId = event.pointerId
      paneElement.setPointerCapture(event.pointerId)
      syncPointerPreview(paneX, paneY)
      callbacks.onInteractionChange(next)
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    const snapshot = callbacks.getSnapshot()
    if (!isRectangleChartNavigationLocked(snapshot.interaction)) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    syncPointerPreview(paneX, paneY)
  }

  const releasePointer = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    if (paneElement.hasPointerCapture(event.pointerId)) {
      paneElement.releasePointerCapture(event.pointerId)
    }
    activePointerId = null
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (activePointerId !== event.pointerId) return
    const snapshot = callbacks.getSnapshot()
    const series = callbacks.getSeries()
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    const point = series
      ? resolvePointerChartPoint(chart, series, paneX, paneY, resolveTimeContext())
      : null

    if (snapshot.interaction.phase === 'creating') {
      let interaction = snapshot.interaction
      if (point) {
        interaction = updateRectangleCreatePreview(interaction, point.time, point.price)
      }
      const result = commitRectangleCreate(interaction, snapshot.instances)
      callbacks.onInteractionChange(result.state)
      if (result.completedInstance) {
        callbacks.onInstanceCompleted(result.completedInstance)
      }
      callbacks.onPointerPreviewChange(null, null)
      releasePointer(event)
      callbacks.onRequestRender()
      return
    }

    if (snapshot.interaction.phase === 'resizing') {
      const preview = callbacks.getPointerPreview()
      const commitTime = point?.time ?? preview.time
      const commitPrice = point?.price ?? preview.price
      if (commitTime !== null && commitPrice !== null) {
        const result = commitRectangleResize(
          snapshot.interaction,
          snapshot.instances,
          commitTime,
          commitPrice,
        )
        callbacks.onInteractionChange(result.state)
        if (result.updatedInstance) {
          callbacks.onInstanceUpdated(result.updatedInstance)
        }
      } else {
        callbacks.onInteractionChange(cancelRectangleInteraction(snapshot.interaction))
      }
      callbacks.onPointerPreviewChange(null, null)
      releasePointer(event)
      callbacks.onRequestRender()
      return
    }

    if (snapshot.interaction.phase === 'moving') {
      const preview = callbacks.getPointerPreview()
      const commitTime = point?.time ?? preview.time
      const commitPrice = point?.price ?? preview.price
      if (commitTime !== null && commitPrice !== null) {
        const result = commitRectangleMove(
          snapshot.interaction,
          snapshot.instances,
          commitTime,
          commitPrice,
        )
        callbacks.onInteractionChange(result.state)
        if (result.updatedInstance) {
          callbacks.onInstanceUpdated(result.updatedInstance)
        }
      } else {
        callbacks.onInteractionChange(cancelRectangleInteraction(snapshot.interaction))
      }
      callbacks.onPointerPreviewChange(null, null)
      releasePointer(event)
      callbacks.onRequestRender()
      return
    }

    releasePointer(event)
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    const snapshot = callbacks.getSnapshot()
    if (isRectangleChartNavigationLocked(snapshot.interaction)) {
      const cancelled = cancelRectangleInteraction(snapshot.interaction)
      callbacks.onPointerPreviewChange(null, null)
      callbacks.onInteractionChange(cancelled)
      callbacks.onRequestRender()
    }
    releasePointer(event)
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
