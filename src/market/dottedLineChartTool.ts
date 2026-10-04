import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'
import { applyBtcPerpetualChartDrawingInteractionMode } from './btcPerpetualChartDrawingInteractionMode.ts'
import {
  applyDottedLineCrosshairAnchor,
  cancelDottedLineInteraction,
  isDottedLineToolActive,
  type DottedLineInteractionState,
} from './dottedLineInteraction.ts'
import type { DottedLineInstance } from './dottedLineInstances.ts'
import { resolveDottedLineCrosshairAnchor } from './dottedLineChartCoordinates.ts'
import {
  attachDottedLinePanePointer,
  type DottedLinePanePointerController,
} from './dottedLinePanePointer.ts'

export type DottedLineChartToolSnapshot = {
  interaction: DottedLineInteractionState
  instances: readonly DottedLineInstance[]
}

export type DottedLineChartToolCallbacks = {
  getSnapshot: () => DottedLineChartToolSnapshot
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  onInteractionChange: (state: DottedLineInteractionState) => void
  onInstanceCompleted: (instance: DottedLineInstance) => void
  getChartInteractionLocked?: () => boolean
}

export type DottedLineChartToolController = {
  sync: () => void
  dispose: () => void
}

export function isDottedLineChartInteractionLocked(
  interaction: DottedLineInteractionState,
): boolean {
  return isDottedLineToolActive(interaction)
}

export function attachDottedLineChartTool(
  chart: IChartApi,
  callbacks: DottedLineChartToolCallbacks,
): DottedLineChartToolController {
  let panePointer: DottedLinePanePointerController | null = null

  const resolveLocked = (interaction: DottedLineInteractionState): boolean => {
    if (callbacks.getChartInteractionLocked) {
      return callbacks.getChartInteractionLocked()
    }
    return isDottedLineChartInteractionLocked(interaction)
  }

  const present = (interaction: DottedLineInteractionState) => {
    applyBtcPerpetualChartDrawingInteractionMode(chart, resolveLocked(interaction))
  }

  const commitInteraction = (next: DottedLineInteractionState) => {
    callbacks.onInteractionChange(next)
    present(next)
  }

  const sync = () => {
    present(callbacks.getSnapshot().interaction)
  }

  const pointerCallbacks: DottedLineChartToolCallbacks = {
    getSnapshot: callbacks.getSnapshot,
    getSeries: callbacks.getSeries,
    onInteractionChange: (state) => {
      commitInteraction(state)
    },
    onInstanceCompleted: (instance) => {
      callbacks.onInstanceCompleted(instance)
      sync()
    },
  }

  panePointer = attachDottedLinePanePointer(chart, pointerCallbacks)

  const onCrosshairMove = (param: MouseEventParams<Time>) => {
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase !== 'preview') return
    const series = callbacks.getSeries()
    if (!series) return
    const hover = resolveDottedLineCrosshairAnchor(chart, series, param)
    const next = applyDottedLineCrosshairAnchor(snapshot.interaction, hover)
    if (next === snapshot.interaction) return
    commitInteraction(next)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const snapshot = callbacks.getSnapshot()
    const next = cancelDottedLineInteraction(snapshot.interaction)
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
    if (!callbacks.getChartInteractionLocked?.()) {
      applyBtcPerpetualChartDrawingInteractionMode(chart, false)
    }
  }

  return { sync, dispose }
}
