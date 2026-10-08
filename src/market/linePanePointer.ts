import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { preferDrawingPointerTarget } from './drawingPointerArbitration.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import {
  applyLineSelection,
  cancelLineInteraction,
  commitLineCreate,
  commitLineMove,
  commitLineResize,
  isLineChartNavigationLocked,
  startLineCreateDraft,
  startLineMoveDraft,
  startLineResizeDraft,
  updateLineCreatePreview,
  type LineInteractionState,
} from './lineInteraction.ts'
import { hitTestLines } from './lineHitTest.ts'
import type { LineInstance } from './lineInstances.ts'
import { projectLineInstanceToScreenSegment } from './lineRenderGeometry.ts'
import type { RectangleHitTarget } from './rectangleHitTest.ts'
import { resolvePointerChartPoint } from './rectangleChartCoordinates.ts'
import {
  buildLineChartTimeContext,
  resolveLineTimeToCoordinate,
  type LineChartTimeContext,
} from './lineChartTime.ts'

export type LinePanePointerCallbacks = {
  getSnapshot: () => {
    interaction: LineInteractionState
    instances: readonly LineInstance[]
  }
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  onInteractionChange: (state: LineInteractionState) => void
  onInstanceCompleted: (instance: LineInstance) => void
  onInstanceUpdated: (instance: LineInstance) => void
  onRequestRender: () => void
  onPointerPreviewChange: (time: number | null, price: number | null) => void
  getPointerPreview: () => { time: number | null; price: number | null }
  isAlternateToolActive: () => boolean
  getCompetingRectangleHit: (paneX: number, paneY: number) => RectangleHitTarget | null
}

export type LinePanePointerController = {
  dispose: () => void
}

function focusLineInteractionPane(paneElement: HTMLElement): void {
  if (typeof paneElement.focus !== 'function') return
  if (paneElement.tabIndex < 0) paneElement.tabIndex = -1
  paneElement.focus()
}

export function attachLinePanePointer(
  chart: IChartApi,
  callbacks: LinePanePointerCallbacks,
): LinePanePointerController {
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

  const resolveTimeContext = (): LineChartTimeContext | null => {
    const series = callbacks.getSeries()
    if (!series) return null
    return buildLineChartTimeContext(
      chart,
      callbacks.getLastBarUnixTime(),
      callbacks.getIntervalDurationSeconds(),
    )
  }

  const projectInstance = (instance: LineInstance) => {
    const series = callbacks.getSeries()
    if (!series) return null
    const timeContext = resolveTimeContext()
    return projectLineInstanceToScreenSegment(
      instance,
      (time, edge) => resolveLineTimeToCoordinate(chart, time, edge, timeContext),
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
      next = updateLineCreatePreview(next, point.time, point.price)
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
      focusLineInteractionPane(paneElement)
      const next = startLineCreateDraft(interaction, point.time, point.price)
      if (next === interaction) return
      activePointerId = event.pointerId
      paneElement.setPointerCapture(event.pointerId)
      callbacks.onPointerPreviewChange(point.time, point.price)
      callbacks.onInteractionChange(next)
      callbacks.onRequestRender()
      return
    }

    if (interaction.phase === 'inactive') {
      const hit = hitTestLines(
        snapshot.instances,
        interaction.selectedId,
        paneX,
        paneY,
        projectInstance,
      )
      if (!hit) {
        if (interaction.selectedId !== null) {
          callbacks.onInteractionChange(applyLineSelection(interaction, null))
          callbacks.onRequestRender()
        }
        return
      }
      if (
        preferDrawingPointerTarget(hit, callbacks.getCompetingRectangleHit(paneX, paneY)) !==
        'line'
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      focusLineInteractionPane(paneElement)
      if (hit.kind !== 'body') {
        const instance = snapshot.instances.find((item) => item.id === hit.instanceId)
        if (!instance) return
        const next = startLineResizeDraft(interaction, instance, hit.kind)
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
      const next = startLineMoveDraft(interaction, instance, point.time, point.price)
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
    if (!isLineChartNavigationLocked(snapshot.interaction)) return
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
        interaction = updateLineCreatePreview(interaction, point.time, point.price)
      }
      const result = commitLineCreate(interaction, snapshot.instances)
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
        const result = commitLineResize(
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
        callbacks.onInteractionChange(cancelLineInteraction(snapshot.interaction))
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
        const result = commitLineMove(
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
        callbacks.onInteractionChange(cancelLineInteraction(snapshot.interaction))
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
    if (isLineChartNavigationLocked(snapshot.interaction)) {
      const cancelled = cancelLineInteraction(snapshot.interaction)
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
