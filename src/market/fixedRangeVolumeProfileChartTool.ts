import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import { applyMarketChartDrawingInteractionLock } from './chartDrawingInteractionLock.ts'
import {
  applyFixedRangeVolumeProfileCrosshairTime,
  cancelFixedRangeVolumeProfileInteraction,
  isFixedRangeVolumeProfileToolActive,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { CandleInterval } from './types.ts'
import { resolveFixedRangeVolumeProfileCrosshairTime } from './fixedRangeVolumeProfileChartTime.ts'
import {
  attachFixedRangeVolumeProfilePanePointer,
  type FixedRangeVolumeProfilePanePointerController,
} from './fixedRangeVolumeProfilePanePointer.ts'

export type FixedRangeVolumeProfileChartToolSnapshot = {
  interaction: FixedRangeVolumeProfileInteractionState
  instances: readonly FixedRangeVolumeProfileInstance[]
}

export type FixedRangeVolumeProfileChartToolCallbacks = {
  getSnapshot: () => FixedRangeVolumeProfileChartToolSnapshot
  getSelectionInterval: () => CandleInterval
  onInteractionChange: (state: FixedRangeVolumeProfileInteractionState) => void
  onInstanceCompleted: (instance: FixedRangeVolumeProfileInstance) => void
  isChartInteractionLocked?: () => boolean
}

export type FixedRangeVolumeProfileChartToolController = {
  sync: () => void
  dispose: () => void
}

export function isFixedRangeVolumeProfileChartInteractionLocked(
  interaction: FixedRangeVolumeProfileInteractionState,
): boolean {
  return isFixedRangeVolumeProfileToolActive(interaction)
}

export function applyFixedRangeVolumeProfileChartInteractionMode(
  chart: IChartApi,
  interaction: FixedRangeVolumeProfileInteractionState,
): boolean {
  const toolActive = isFixedRangeVolumeProfileChartInteractionLocked(interaction)
  applyMarketChartDrawingInteractionLock(chart, toolActive)
  return toolActive
}

export function attachFixedRangeVolumeProfileChartTool(
  chart: IChartApi,
  callbacks: FixedRangeVolumeProfileChartToolCallbacks,
): FixedRangeVolumeProfileChartToolController {
  let panePointer: FixedRangeVolumeProfilePanePointerController | null = null

  const presentInteractionLock = () => {
    const locked =
      callbacks.isChartInteractionLocked?.() ??
      isFixedRangeVolumeProfileChartInteractionLocked(callbacks.getSnapshot().interaction)
    applyMarketChartDrawingInteractionLock(chart, locked)
  }

  const commitInteraction = (next: FixedRangeVolumeProfileInteractionState) => {
    callbacks.onInteractionChange(next)
    presentInteractionLock()
  }

  const sync = () => {
    presentInteractionLock()
  }

  const pointerCallbacks: FixedRangeVolumeProfileChartToolCallbacks = {
    getSnapshot: callbacks.getSnapshot,
    getSelectionInterval: callbacks.getSelectionInterval,
    onInteractionChange: (state) => {
      commitInteraction(state)
    },
    onInstanceCompleted: (instance) => {
      callbacks.onInstanceCompleted(instance)
      sync()
    },
  }

  panePointer = attachFixedRangeVolumeProfilePanePointer(chart, pointerCallbacks)

  const onCrosshairMove = (param: MouseEventParams<Time>) => {
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase !== 'preview') return
    const hoverTime = resolveFixedRangeVolumeProfileCrosshairTime(chart, param)
    const next = applyFixedRangeVolumeProfileCrosshairTime(snapshot.interaction, hoverTime)
    if (next === snapshot.interaction) return
    commitInteraction(next)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const snapshot = callbacks.getSnapshot()
    const next = cancelFixedRangeVolumeProfileInteraction(snapshot.interaction)
    if (next === snapshot.interaction) return
    commitInteraction(next)
  }

  chart.subscribeCrosshairMove(onCrosshairMove)
  window.addEventListener('keydown', onKeyDown)

  sync()

  const dispose = () => {
    window.removeEventListener('keydown', onKeyDown)
    chart.unsubscribeCrosshairMove(onCrosshairMove)
    panePointer?.dispose()
    panePointer = null
    applyMarketChartDrawingInteractionLock(chart, false)
  }

  return { sync, dispose }
}
