import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { bindCandlePaneElementListeners, resolveCandlePaneElement } from './candlePane.ts'
import { frvpDefaultDrawStyle, frvpDrawStyleForInstance } from './frvpInstanceLineStyles.ts'
import {
  buildFixedRangeVolumeProfileDrawModels,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import { buildFixedRangeVolumeProfileTimeCoordinateResolvers } from './fixedRangeVolumeProfileTimeCoordinates.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import {
  buildFixedRangeVolumeProfileReadyRuntime,
  resolveFixedRangeVolumeProfileDisplayIdentityTimes,
} from './fixedRangeVolumeProfileRuntimeIdentity.ts'
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
  resolveFixedRangeVolumeProfileResizePointerTime,
} from './fixedRangeVolumeProfileChartTime.ts'
import { preferDrawingPointerTargetAmongPeers } from './drawingPointerArbitration.ts'
import { releaseDrawingCursor, updateDrawingCursor } from './drawingCursor.ts'
import type { LineHitTarget } from './lineHitTest.ts'
import type { RectangleChartTimeContext } from './rectangleChartTime.ts'
import type { AnchoredVwapDrawingHitTarget } from './anchoredVwapDrawingHitTest.ts'
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
  getCompetingAnchoredVwapHit: (
    paneX: number,
    paneY: number,
  ) => AnchoredVwapDrawingHitTarget | null
  onExclusivePointerClaim?: () => void
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
  instances: readonly FixedRangeVolumeProfileInstance[],
  runtime: FixedRangeVolumeProfileRuntimeSnapshot,
  interaction: FixedRangeVolumeProfileInteractionState,
) {
  return buildFixedRangeVolumeProfileReadyRuntime(instances, runtime, (instance) =>
    resolveFixedRangeVolumeProfileDisplayIdentityTimes(instance, interaction),
  )
}

export function attachFixedRangeVolumeProfilePanePointer(
  chart: IChartApi,
  callbacks: FixedRangeVolumeProfilePanePointerCallbacks,
): FixedRangeVolumeProfilePanePointerController {
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

  const resolveTimeContext = (): RectangleChartTimeContext | null => {
    return buildFixedRangeVolumeProfileChartTimeContext(
      chart,
      callbacks.getLastBarUnixTime(),
      callbacks.getIntervalDurationSeconds(),
    )
  }

  const resolveSelectionTime = (paneX: number): number | null => {
    const timeContext = resolveTimeContext()
    const snapshot = callbacks.getSnapshot()
    const resizeDraft =
      snapshot.interaction.phase === 'resizing' && snapshot.interaction.draft?.kind === 'resize'
        ? snapshot.interaction.draft
        : null
    if (resizeDraft) {
      return resolveFixedRangeVolumeProfileResizePointerTime(
        chart,
        paneX,
        timeContext,
        resizeDraft,
      )
    }
    return resolveChartTimeFromCoordinate(chart, paneX, timeContext)
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
      readyById: buildFrvpReadyById(
        snapshot.instances,
        snapshot.runtimeById,
        snapshot.interaction,
      ),
      fromTimeToCoordinate,
      toTimeToCoordinate,
      barSpacing: timeScale.options().barSpacing,
      priceToY: (price) => series.priceToCoordinate(price),
      liveRightEdge: callbacks.getLastBarUnixTime(),
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
      const preferredTarget = preferDrawingPointerTargetAmongPeers(
        callbacks.getCompetingLineHit(paneX, paneY),
        callbacks.getCompetingRectangleHit(paneX, paneY),
        hit,
        callbacks.getCompetingAnchoredVwapHit(paneX, paneY),
      )
      if (preferredTarget !== 'frvp') {
        if (interaction.selectedId !== null) {
          callbacks.onInteractionChange(applyFixedRangeVolumeProfileSelection(interaction, null))
          callbacks.onRequestRender()
        }
        return
      }
      callbacks.onExclusivePointerClaim?.()
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

  /** Feed this tool's winning hit target to the shared cursor mapping. */
  const syncHoverCursor = (event: PointerEvent) => {
    const snapshot = callbacks.getSnapshot()
    if (callbacks.isAlternateToolActive()) {
      releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
      return
    }
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const paneY = resolvePaneY(event)
    const models = buildHitTestModels(snapshot.interaction.selectedId)
    const hit = hitTestFixedRangeVolumeProfiles(
      snapshot.instances,
      models,
      snapshot.interaction.selectedId,
      paneX,
      paneY,
    )
    if (!hit) {
      releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
      return
    }
    if (
      preferDrawingPointerTargetAmongPeers(
        callbacks.getCompetingLineHit(paneX, paneY),
        callbacks.getCompetingRectangleHit(paneX, paneY),
        hit,
        callbacks.getCompetingAnchoredVwapHit(paneX, paneY),
      ) !== 'frvp'
    ) {
      releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
      return
    }
    const instance = snapshot.instances.find((item) => item.id === hit.instanceId)
    updateDrawingCursor(paneElement, 'fixed-range-volume-profile', {
      kind: hit.kind,
      movable: false,
      locked: instance ? isFixedRangeVolumeProfileInstanceLocked(instance) : false,
    })
  }

  const onPointerMove = (event: PointerEvent) => {
    const snapshot = callbacks.getSnapshot()
    if (activePointerId === event.pointerId && snapshot.interaction.phase === 'resizing') {
      // A resize draft owns the pointer: no hover cursor mid-gesture.
      releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
      const paneX = resolvePaneRelativePointerX(event, paneElement)
      syncResizePreview(paneX)
      return
    }

    if (isFixedRangeVolumeProfileToolActive(snapshot.interaction)) {
      releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
      const paneX = resolvePaneRelativePointerX(event, paneElement)
      const hoverTime = resolveSelectionTime(paneX)
      const next = applyFixedRangeVolumeProfileCrosshairTime(snapshot.interaction, hoverTime)
      if (next !== snapshot.interaction) {
        callbacks.onInteractionChange(next)
        callbacks.onRequestRender()
      }
      return
    }

    syncHoverCursor(event)
  }

  const onPointerLeave = () => {
    releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
  }

  const releasePointer = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    if (paneElement.hasPointerCapture(event.pointerId)) {
      paneElement.releasePointerCapture(event.pointerId)
    }
    activePointerId = null
    // Never keep the resize cursor after the gesture ended.
    releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
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
      if (paneElement !== next) {
        releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
      }
      paneElement = next
    },
  )

  return {
    dispose: () => {
      releaseDrawingCursor(paneElement, 'fixed-range-volume-profile')
      paneElementBinding.dispose()
    },
  }
}
