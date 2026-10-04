import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  applyDottedLineClick,
  applyDottedLineCrosshairAnchor,
  isDottedLineToolActive,
  type DottedLineInteractionState,
} from './dottedLineInteraction.ts'
import type { DottedLineInstance } from './dottedLineInstances.ts'
import { resolveDottedLineAnchorFromCoordinates } from './dottedLineChartCoordinates.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'

export type DottedLinePanePointerCallbacks = {
  getSnapshot: () => {
    interaction: DottedLineInteractionState
    instances: readonly DottedLineInstance[]
  }
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  onInteractionChange: (state: DottedLineInteractionState) => void
  onInstanceCompleted: (instance: DottedLineInstance) => void
}

export function applyDottedLinePanePointerUp(
  chart: IChartApi,
  paneX: number,
  paneY: number,
  callbacks: DottedLinePanePointerCallbacks,
): void {
  const snapshot = callbacks.getSnapshot()
  let interaction = snapshot.interaction
  if (!isDottedLineToolActive(interaction)) return

  const series = callbacks.getSeries()
  if (!series) return

  const hoverAnchor = resolveDottedLineAnchorFromCoordinates(chart, series, paneX, paneY)
  if (interaction.phase === 'preview') {
    const previewState = applyDottedLineCrosshairAnchor(interaction, hoverAnchor)
    if (previewState !== interaction) {
      interaction = previewState
      callbacks.onInteractionChange(previewState)
    }
  }

  const clickAnchor = resolveDottedLineAnchorFromCoordinates(chart, series, paneX, paneY)
  const result = applyDottedLineClick(interaction, clickAnchor, snapshot.instances)
  callbacks.onInteractionChange(result.state)
  if (result.completedInstance) {
    callbacks.onInstanceCompleted(result.completedInstance)
  }
}

export type DottedLinePanePointerController = {
  dispose: () => void
}

export function attachDottedLinePanePointer(
  chart: IChartApi,
  callbacks: DottedLinePanePointerCallbacks,
): DottedLinePanePointerController {
  const pane = chart.panes()[0]
  const paneElement = pane.getHTMLElement()
  if (!paneElement) {
    return { dispose: () => {} }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (!isDottedLineToolActive(callbacks.getSnapshot().interaction)) return
    const paneX = resolvePaneRelativePointerX(event, paneElement)
    const rect = paneElement.getBoundingClientRect()
    const paneY = event.clientY - rect.top
    applyDottedLinePanePointerUp(chart, paneX, paneY, callbacks)
  }

  paneElement.addEventListener('pointerup', onPointerUp)

  return {
    dispose: () => {
      paneElement.removeEventListener('pointerup', onPointerUp)
    },
  }
}
