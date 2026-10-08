import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { applyChartDrawingInteractionMode } from './chartDrawingInteractionMode.ts'
import { lineHitAtPanePoint } from './drawingPointerArbitration.ts'
import {
  isFixedRangeVolumeProfileToolActive,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import {
  cancelRectangleInteraction,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  removeSelectedRectangle,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'
import {
  isLineDrawingBlockingPeerTools,
  type LineInteractionState,
} from './lineInteraction.ts'
import type { LineInstance } from './lineInstances.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import { isRectangleKeyboardFocusOnOutsideControl } from './rectangleKeyboardScope.ts'
import {
  attachRectanglePanePointer,
  type RectanglePanePointerController,
} from './rectanglePanePointer.ts'

export type RectangleChartToolSnapshot = {
  interaction: RectangleInteractionState
  instances: readonly RectangleInstance[]
  pointerTime: number | null
  pointerPrice: number | null
}

export type RectangleChartToolCallbacks = {
  getSnapshot: () => Omit<RectangleChartToolSnapshot, 'pointerTime' | 'pointerPrice'>
  getPointerPreview: () => { pointerTime: number | null; pointerPrice: number | null }
  setPointerPreview: (time: number | null, price: number | null) => void
  shouldHandleKeyboardShortcut: () => boolean
  onInteractionChange: (state: RectangleInteractionState) => void
  onInstancesChange: (instances: RectangleInstance[]) => void
  onInstanceCompleted: (instance: RectangleInstance) => void
  onInstanceUpdated: (instance: RectangleInstance) => void
  onRequestRender: () => void
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  getFixedRangeVolumeProfileInteraction: () => FixedRangeVolumeProfileInteractionState
  getLineInteraction: () => LineInteractionState
  getLineInstances: () => readonly LineInstance[]
}

export type RectangleChartToolController = {
  sync: () => void
  dispose: () => void
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function applyRectangleChartInteractionMode(
  chart: IChartApi,
  rectangleInteraction: RectangleInteractionState,
  lineInteraction: LineInteractionState,
  frvpInteraction: FixedRangeVolumeProfileInteractionState,
): void {
  applyChartDrawingInteractionMode(chart, rectangleInteraction, lineInteraction, frvpInteraction)
}

export function attachRectangleChartTool(
  chart: IChartApi,
  callbacks: RectangleChartToolCallbacks,
): RectangleChartToolController {
  let panePointer: RectanglePanePointerController | null = null

  const present = () => {
    applyRectangleChartInteractionMode(
      chart,
      callbacks.getSnapshot().interaction,
      callbacks.getLineInteraction(),
      callbacks.getFixedRangeVolumeProfileInteraction(),
    )
  }

  const commitInteraction = (next: RectangleInteractionState) => {
    callbacks.onInteractionChange(next)
    present()
    callbacks.onRequestRender()
  }

  const sync = () => {
    present()
    callbacks.onRequestRender()
  }

  panePointer = attachRectanglePanePointer(chart, {
    getSnapshot: () => callbacks.getSnapshot(),
    getChart: callbacks.getChart,
    getSeries: callbacks.getSeries,
    getIntervalDurationSeconds: callbacks.getIntervalDurationSeconds,
    getLastBarUnixTime: callbacks.getLastBarUnixTime,
    onInteractionChange: (state) => {
      commitInteraction(state)
    },
    onInstanceCompleted: (instance) => {
      callbacks.onInstanceCompleted(instance)
      sync()
    },
    onInstanceUpdated: (instance) => {
      callbacks.onInstanceUpdated(instance)
      sync()
    },
    onRequestRender: () => {
      callbacks.onRequestRender()
    },
    onPointerPreviewChange: (time, price) => {
      callbacks.setPointerPreview(time, price)
    },
    getPointerPreview: () => {
      const preview = callbacks.getPointerPreview()
      return { time: preview.pointerTime, price: preview.pointerPrice }
    },
    isAlternateToolActive: () => {
      const frvp = callbacks.getFixedRangeVolumeProfileInteraction()
      const line = callbacks.getLineInteraction()
      return isFixedRangeVolumeProfileToolActive(frvp) || isLineDrawingBlockingPeerTools(line)
    },
    getCompetingLineHit: (paneX, paneY) => {
      const series = callbacks.getSeries()
      if (!series) return null
      return lineHitAtPanePoint({
        chart,
        series,
        instances: callbacks.getLineInstances(),
        selectedId: callbacks.getLineInteraction().selectedId,
        paneX,
        paneY,
        intervalDurationSeconds: callbacks.getIntervalDurationSeconds(),
        lastBarUnixTime: callbacks.getLastBarUnixTime(),
      })
    },
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableKeyboardTarget(event.target)) return
    if (!callbacks.shouldHandleKeyboardShortcut()) return
    const snapshot = callbacks.getSnapshot()
    if (event.key === 'Escape') {
      const next = cancelRectangleInteraction(snapshot.interaction)
      if (next === snapshot.interaction) return
      event.preventDefault()
      callbacks.setPointerPreview(null, null)
      commitInteraction(next)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const chartRoot = chart.panes()[0]?.getHTMLElement() ?? null
      if (isRectangleKeyboardFocusOnOutsideControl(event.target, chartRoot)) return
      if (!snapshot.interaction.selectedId) return
      if (
        snapshot.interaction.phase === 'creating' ||
        snapshot.interaction.phase === 'resizing' ||
        snapshot.interaction.phase === 'moving'
      ) {
        return
      }
      event.preventDefault()
      const result = removeSelectedRectangle(snapshot.interaction, snapshot.instances)
      commitInteraction(result.state)
      callbacks.onInstancesChange([...result.instances])
    }
  }

  window.addEventListener('keydown', onKeyDown)
  sync()

  const dispose = () => {
    window.removeEventListener('keydown', onKeyDown)
    panePointer?.dispose()
    panePointer = null
    applyRectangleChartInteractionMode(
      chart,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      callbacks.getLineInteraction(),
      callbacks.getFixedRangeVolumeProfileInteraction(),
    )
  }

  return { sync, dispose }
}
