import type { IChartApi } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfileClick,
  applyFixedRangeVolumeProfileCrosshairTime,
  isFixedRangeVolumeProfileToolActive,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { CandleInterval } from './types.ts'
import { resolveChartTimeFromCoordinate } from './fixedRangeVolumeProfileChartTime.ts'

export type FixedRangeVolumeProfilePanePointerCallbacks = {
  getSnapshot: () => {
    interaction: FixedRangeVolumeProfileInteractionState
    instances: readonly FixedRangeVolumeProfileInstance[]
  }
  getSelectionInterval: () => CandleInterval
  onInteractionChange: (state: FixedRangeVolumeProfileInteractionState) => void
  onInstanceCompleted: (instance: FixedRangeVolumeProfileInstance) => void
}

export function resolvePaneRelativePointerX(event: PointerEvent, pane: HTMLElement): number {
  const rect = pane.getBoundingClientRect()
  return event.clientX - rect.left
}

export function resolveSelectionTimeFromPaneX(
  chart: IChartApi,
  paneX: number,
  interaction: FixedRangeVolumeProfileInteractionState,
): number | null {
  const fromCoordinate = resolveChartTimeFromCoordinate(chart, paneX)
  if (fromCoordinate !== null) return fromCoordinate

  if (interaction.phase === 'preview' && interaction.draft !== null) {
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

  const hoverTime = resolveChartTimeFromCoordinate(chart, paneX)
  if (interaction.phase === 'preview') {
    const previewState = applyFixedRangeVolumeProfileCrosshairTime(interaction, hoverTime)
    if (previewState !== interaction) {
      interaction = previewState
      callbacks.onInteractionChange(previewState)
    }
  }

  const clickTime = resolveSelectionTimeFromPaneX(chart, paneX, interaction)
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

export function attachFixedRangeVolumeProfilePanePointer(
  chart: IChartApi,
  callbacks: FixedRangeVolumeProfilePanePointerCallbacks,
): FixedRangeVolumeProfilePanePointerController {
  const pane = chart.panes()[0]
  const paneElement = pane.getHTMLElement()
  if (!paneElement) {
    return { dispose: () => {} }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (!isFixedRangeVolumeProfileToolActive(callbacks.getSnapshot().interaction)) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    applyFixedRangeVolumeProfilePanePointerUp(chart, paneX, callbacks)
  }

  paneElement.addEventListener('pointerup', onPointerUp)

  return {
    dispose: () => {
      paneElement.removeEventListener('pointerup', onPointerUp)
    },
  }
}
