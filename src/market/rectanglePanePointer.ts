import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import {
  applyRectangleSelection,
  cancelRectangleInteraction,
  commitRectangleCreate,
  commitRectangleResize,
  isRectangleChartNavigationLocked,
  startRectangleCreateDraft,
  startRectangleResizeDraft,
  updateRectangleCreatePreview,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import { hitTestRectangles } from './rectangleHitTest.ts'
import { projectRectangleInstanceToScreenBox } from './rectangleRenderGeometry.ts'
import { resolvePointerChartPoint } from './rectangleChartCoordinates.ts'

export type RectanglePanePointerCallbacks = {
  getSnapshot: () => {
    interaction: RectangleInteractionState
    instances: readonly RectangleInstance[]
  }
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  onInteractionChange: (state: RectangleInteractionState) => void
  onInstanceCompleted: (instance: RectangleInstance) => void
  onInstanceUpdated: (instance: RectangleInstance) => void
  onRequestRender: () => void
  onPointerPreviewChange: (time: number | null, price: number | null) => void
  isAlternateToolActive: () => boolean
}

export type RectanglePanePointerController = {
  dispose: () => void
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

  const projectInstance = (instance: RectangleInstance) => {
    const series = callbacks.getSeries()
    if (!series) return null
    const timeScale = chart.timeScale()
    return projectRectangleInstanceToScreenBox(
      instance,
      (time) => timeScale.timeToCoordinate(time as never),
      (price) => series.priceToCoordinate(price),
    )
  }

  const syncPointerPreview = (paneX: number, paneY: number) => {
    const series = callbacks.getSeries()
    if (!series) return
    const point = resolvePointerChartPoint(chart, series, paneX, paneY)
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
      const point = resolvePointerChartPoint(chart, series, paneX, paneY)
      if (!point) return
      event.preventDefault()
      event.stopPropagation()
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
      event.preventDefault()
      event.stopPropagation()
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
      callbacks.onInteractionChange(applyRectangleSelection(interaction, hit.instanceId))
      callbacks.onRequestRender()
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
    const point = series ? resolvePointerChartPoint(chart, series, paneX, paneY) : null

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

    if (snapshot.interaction.phase === 'resizing' && point) {
      const result = commitRectangleResize(
        snapshot.interaction,
        snapshot.instances,
        point.time,
        point.price,
      )
      callbacks.onInteractionChange(result.state)
      if (result.updatedInstance) {
        callbacks.onInstanceUpdated(result.updatedInstance)
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
