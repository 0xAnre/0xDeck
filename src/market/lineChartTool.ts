import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  applyChartDrawingInteractionMode,
} from './chartDrawingInteractionMode.ts'
import {
  isFixedRangeVolumeProfileToolActive,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import {
  cancelLineInteraction,
  INITIAL_LINE_INTERACTION_STATE,
  removeSelectedLine,
  type LineInteractionState,
} from './lineInteraction.ts'
import type { LineInstance } from './lineInstances.ts'
import { isRectangleKeyboardFocusOnOutsideControl } from './rectangleKeyboardScope.ts'
import type { RectangleInteractionState } from './rectangleInteraction.ts'
import { isRectangleDrawingBlockingPeerTools } from './rectanglePeerTools.ts'
import {
  attachLinePanePointer,
  type LinePanePointerController,
} from './linePanePointer.ts'

export type LineChartToolSnapshot = {
  interaction: LineInteractionState
  instances: readonly LineInstance[]
  pointerTime: number | null
  pointerPrice: number | null
}

export type LineChartToolCallbacks = {
  getSnapshot: () => Omit<LineChartToolSnapshot, 'pointerTime' | 'pointerPrice'>
  getPointerPreview: () => { pointerTime: number | null; pointerPrice: number | null }
  setPointerPreview: (time: number | null, price: number | null) => void
  shouldHandleKeyboardShortcut: () => boolean
  onInteractionChange: (state: LineInteractionState) => void
  onInstancesChange: (instances: LineInstance[]) => void
  onInstanceCompleted: (instance: LineInstance) => void
  onInstanceUpdated: (instance: LineInstance) => void
  onRequestRender: () => void
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  getFixedRangeVolumeProfileInteraction: () => FixedRangeVolumeProfileInteractionState
  getRectangleInteraction: () => RectangleInteractionState
}

export type LineChartToolController = {
  sync: () => void
  dispose: () => void
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function applyLineChartInteractionMode(
  chart: IChartApi,
  lineInteraction: LineInteractionState,
  rectangleInteraction: RectangleInteractionState,
  frvpInteraction: FixedRangeVolumeProfileInteractionState,
): void {
  applyChartDrawingInteractionMode(chart, rectangleInteraction, lineInteraction, frvpInteraction)
}

export function attachLineChartTool(
  chart: IChartApi,
  callbacks: LineChartToolCallbacks,
): LineChartToolController {
  let panePointer: LinePanePointerController | null = null

  const present = () => {
    applyLineChartInteractionMode(
      chart,
      callbacks.getSnapshot().interaction,
      callbacks.getRectangleInteraction(),
      callbacks.getFixedRangeVolumeProfileInteraction(),
    )
  }

  const commitInteraction = (next: LineInteractionState) => {
    callbacks.onInteractionChange(next)
    present()
    callbacks.onRequestRender()
  }

  const sync = () => {
    present()
    callbacks.onRequestRender()
  }

  panePointer = attachLinePanePointer(chart, {
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
      const rectangle = callbacks.getRectangleInteraction()
      return (
        isFixedRangeVolumeProfileToolActive(frvp) || isRectangleDrawingBlockingPeerTools(rectangle)
      )
    },
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableKeyboardTarget(event.target)) return
    if (!callbacks.shouldHandleKeyboardShortcut()) return
    const snapshot = callbacks.getSnapshot()
    if (event.key === 'Escape') {
      const next = cancelLineInteraction(snapshot.interaction)
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
      const result = removeSelectedLine(snapshot.interaction, snapshot.instances)
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
    applyLineChartInteractionMode(
      chart,
      INITIAL_LINE_INTERACTION_STATE,
      callbacks.getRectangleInteraction(),
      callbacks.getFixedRangeVolumeProfileInteraction(),
    )
  }

  return { sync, dispose }
}
