import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { frvpDefaultDrawStyle, frvpDrawStyleForInstance } from './frvpInstanceLineStyles.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import {
  buildFixedRangeVolumeProfileDrawModels,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import { buildFixedRangeVolumeProfileTimeCoordinateResolvers } from './fixedRangeVolumeProfileTimeCoordinates.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import {
  applyFixedRangeVolumeProfileClick,
  applyFixedRangeVolumeProfileCrosshairTime,
  applyFixedRangeVolumeProfileResizePreview,
  applyFixedRangeVolumeProfileSelection,
  commitFixedRangeVolumeProfileResize,
  cancelFixedRangeVolumeProfileInteraction,
  isFixedRangeVolumeProfileChartNavigationLocked,
  isFixedRangeVolumeProfileToolActive,
  startFixedRangeVolumeProfileResizeDraft,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import {
  hitTestFixedRangeVolumeProfiles,
  isFixedRangeVolumeProfileInstanceLocked,
} from './fixedRangeVolumeProfileHitTest.ts'
import type { CandleInterval } from './types.ts'
import {
  buildFixedRangeVolumeProfileChartTimeContext,
  resolveChartTimeFromCoordinate,
} from './fixedRangeVolumeProfileChartTime.ts'
import { preferDrawingPointerTargetAmongPeers } from './drawingPointerArbitration.ts'
import type { LineHitTarget } from './lineHitTest.ts'
import type { RectangleChartTimeContext } from './rectangleChartTime.ts'
import type { RectangleHitTarget } from './rectangleHitTest.ts'

export type FixedRangeVolumeProfilePanePointerCallbacks = {
  getSnapshot: () => {
    interaction: FixedRangeVolumeProfileInteractionState
    instances: readonly FixedRangeVolumeProfileInstance[]
    runtimeById: FixedRangeVolumeProfileRuntimeSnapshot
  }
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getSelectionInterval: () => CandleInterval
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  onInteractionChange: (state: FixedRangeVolumeProfileInteractionState) => void
  onInstanceCompleted: (instance: FixedRangeVolumeProfileInstance) => void
  onInstanceUpdated: (instance: FixedRangeVolumeProfileInstance) => void
  onRequestRender: () => void
  isAlternateToolActive: () => boolean
  getCompetingLineHit: (paneX: number, paneY: number) => LineHitTarget | null
  getCompetingRectangleHit: (paneX: number, paneY: number) => RectangleHitTarget | null
}

export function resolvePaneRelativePointerX(
  event: Pick<PointerEvent, 'clientX'>,
  pane: HTMLElement,
): number {
  const rect = pane.getBoundingClientRect()
  return event.clientX - rect.left
}

export function resolveSelectionTimeFromPaneX(
  chart: IChartApi,
  paneX: number,
  interaction: FixedRangeVolumeProfileInteractionState,
  timeContext: RectangleChartTimeContext | null = null,
): number | null {
  const fromCoordinate = resolveChartTimeFromCoordinate(chart, paneX, timeContext)
  if (fromCoordinate !== null) return fromCoordinate

  if (interaction.phase === 'preview' && interaction.draft?.kind === 'create') {
    const previewTime = interaction.draft.previewTime
    const anchorTime = interaction.draft.anchorTime
    if (previewTime !== anchorTime) return previewTime
  }

  return null
}

export function applyFixedRangeVolumeProfilePanePointerUp(
  chart: IChartApi,
  paneX: number,
  callbacks: FixedRangeVolumeProfilePanePointerCallbacks,
): void {
  const snapshot = callbacks.getSnapshot()
  let interaction = snapshot.interaction
  if (!isFixedRangeVolumeProfileToolActive(interaction)) return

  const timeContext = buildFixedRangeVolumeProfileChartTimeContext(
    chart,
    callbacks.getLastBarUnixTime(),
    callbacks.getIntervalDurationSeconds(),
  )

  const hoverTime = resolveChartTimeFromCoordinate(chart, paneX, timeContext)
  if (interaction.phase === 'preview') {
    const previewState = applyFixedRangeVolumeProfileCrosshairTime(interaction, hoverTime)
    if (previewState !== interaction) {
      interaction = previewState
      callbacks.onInteractionChange(previewState)
    }
  }

  const clickTime = resolveSelectionTimeFromPaneX(chart, paneX, interaction, timeContext)
  const result = applyFixedRangeVolumeProfileClick(
    interaction,
    clickTime,
    snapshot.instances,
    callbacks.getSelectionInterval(),
  )
  callbacks.onInteractionChange(result.state)
  if (result.completedInstance) {
    callbacks.onInstanceCompleted(result.completedInstance)
  }
}

export type FixedRangeVolumeProfilePanePointerController = {
  dispose: () => void
}

function buildFrvpReadyById(
  runtime: FixedRangeVolumeProfileRuntimeSnapshot,
): Map<string, { profile: FixedRangeVolumeProfileResult }> {
  const readyById = new Map<string, { profile: FixedRangeVolumeProfileResult }>()
  for (const [id, state] of Object.entries(runtime)) {
    if (state.status === 'ready') {
      readyById.set(id, { profile: state.profile })
    }
  }
  return readyById
}

export function attachFixedRangeVolumeProfilePanePointer(
  chart: IChartApi,
  callbacks: FixedRangeVolumeProfilePanePointerCallbacks,
): FixedRangeVolumeProfilePanePointerController {
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
    return buildFixedRangeVolumeProfileChartTimeContext(
      chart,
      callbacks.getLastBarUnixTime(),
      callbacks.getIntervalDurationSeconds(),
    )
  }

  const resolveSelectionTime = (paneX: number): number | null => {
    return resolveChartTimeFromCoordinate(chart, paneX, resolveTimeContext())
  }

  const buildHitTestModels = (selectedId: string | null) => {
    const series = callbacks.getSeries()
    if (!series) return []
    const snapshot = callbacks.getSnapshot()
    const timeScale = chart.timeScale()
    const { fromTimeToCoordinate, toTimeToCoordinate } =
      buildFixedRangeVolumeProfileTimeCoordinateResolvers(
        chart,
        callbacks.getLastBarUnixTime(),
        callbacks.getIntervalDurationSeconds(),
      )
    const instanceById = new Map(snapshot.instances.map((item) => [item.id, item]))
    return buildFixedRangeVolumeProfileDrawModels({
      instances: snapshot.instances,
      selectedId,
      readyById: buildFrvpReadyById(snapshot.runtimeById),
      fromTimeToCoordinate,
      toTimeToCoordinate,
      barSpacing: timeScale.options().barSpacing,
      priceToY: (price) => series.priceToCoordinate(price),
      styleForInstance: (instanceId) => {
        const instance = instanceById.get(instanceId)
        return instance ? frvpDrawStyleForInstance(instance) : frvpDefaultDrawStyle()
      },
    })
  }

  const syncResizePreview = (paneX: number) => {
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase !== 'resizing') return
    const pointerTime = resolveSelectionTime(paneX)
    const next = applyFixedRangeVolumeProfileResizePreview(snapshot.interaction, pointerTime)
    if (next === snapshot.interaction) return
    callbacks.onInteractionChange(next)
    callbacks.onRequestRender()
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (callbacks.isAlternateToolActive()) return
    const snapshot = callbacks.getSnapshot()
    const interaction = snapshot.interaction
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)

    if (isFixedRangeVolumeProfileToolActive(interaction)) {
      return
    }

    if (interaction.phase === 'inactive') {
      const models = buildHitTestModels(interaction.selectedId)
      const hit = hitTestFixedRangeVolumeProfiles(
        snapshot.instances,
        models,
        interaction.selectedId,
        paneX,
        paneY,
      )
      if (!hit) {
        if (interaction.selectedId !== null) {
          callbacks.onInteractionChange(applyFixedRangeVolumeProfileSelection(interaction, null))
          callbacks.onRequestRender()
        }
        return
      }
      if (
        preferDrawingPointerTargetAmongPeers(
          callbacks.getCompetingLineHit(paneX, paneY),
          callbacks.getCompetingRectangleHit(paneX, paneY),
          hit,
        ) !== 'frvp'
      ) {
        return
      }
      const instance = snapshot.instances.find((item) => item.id === hit.instanceId)
      if (!instance) return
      if (isFixedRangeVolumeProfileInstanceLocked(instance)) {
        callbacks.onInteractionChange(applyFixedRangeVolumeProfileSelection(interaction, hit.instanceId))
        callbacks.onRequestRender()
        return
      }
      if (hit.kind === 'start' || hit.kind === 'end') {
        event.preventDefault()
        event.stopPropagation()
        const next = startFixedRangeVolumeProfileResizeDraft(interaction, instance, hit.kind)
        if (next === interaction) return
        activePointerId = event.pointerId
        paneElement.setPointerCapture(event.pointerId)
        callbacks.onInteractionChange(next)
        syncResizePreview(paneX)
        return
      }
      callbacks.onInteractionChange(applyFixedRangeVolumeProfileSelection(interaction, hit.instanceId))
      callbacks.onRequestRender()
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const snapshot = callbacks.getSnapshot()
    if (activePointerId === event.pointerId && snapshot.interaction.phase === 'resizing') {
      const paneX = resolvePaneRelativePointerX(event, paneElement)
      syncResizePreview(paneX)
      return
    }

    if (isFixedRangeVolumeProfileToolActive(snapshot.interaction)) {
      const paneX = resolvePaneRelativePointerX(event, paneElement)
      const hoverTime = resolveSelectionTime(paneX)
      const next = applyFixedRangeVolumeProfileCrosshairTime(snapshot.interaction, hoverTime)
      if (next !== snapshot.interaction) {
        callbacks.onInteractionChange(next)
        callbacks.onRequestRender()
      }
    }
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

    const snapshot = callbacks.getSnapshot()
    const paneX = resolvePaneRelativePointerX(event, paneElement)

    if (snapshot.interaction.phase === 'resizing' && activePointerId === event.pointerId) {
      const pointerTime = resolveSelectionTime(paneX)
      if (pointerTime !== null) {
        const result = commitFixedRangeVolumeProfileResize(
          snapshot.interaction,
          snapshot.instances,
          pointerTime,
        )
        callbacks.onInteractionChange(result.state)
        if (result.updatedInstance) {
          callbacks.onInstanceUpdated(result.updatedInstance)
        }
      } else {
        callbacks.onInteractionChange(cancelFixedRangeVolumeProfileInteraction(snapshot.interaction))
      }
      releasePointer(event)
      callbacks.onRequestRender()
      return
    }

    if (!isFixedRangeVolumeProfileToolActive(snapshot.interaction)) return
    applyFixedRangeVolumeProfilePanePointerUp(chart, paneX, callbacks)
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    const snapshot = callbacks.getSnapshot()
    if (isFixedRangeVolumeProfileChartNavigationLocked(snapshot.interaction)) {
      callbacks.onInteractionChange(cancelFixedRangeVolumeProfileInteraction(snapshot.interaction))
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
