import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfileCrosshairTime,
  cancelFixedRangeVolumeProfileInteraction,
  isFixedRangeVolumeProfileChartNavigationLocked,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import type { CandleInterval } from './types.ts'
import {
  buildFixedRangeVolumeProfileChartTimeContext,
  resolveFixedRangeVolumeProfileCrosshairTime,
} from './fixedRangeVolumeProfileChartTime.ts'
import {
  lineHitAtPanePoint,
  rectangleHitAtPanePoint,
} from './drawingPointerArbitration.ts'
import type { LineInteractionState } from './lineInteraction.ts'
import type { LineInstance } from './lineInstances.ts'
import type { RectangleInteractionState } from './rectangleInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import {
  attachFixedRangeVolumeProfilePanePointer,
  type FixedRangeVolumeProfilePanePointerCallbacks,
  type FixedRangeVolumeProfilePanePointerController,
} from './fixedRangeVolumeProfilePanePointer.ts'

export type FixedRangeVolumeProfileChartToolSnapshot = {
  interaction: FixedRangeVolumeProfileInteractionState
  instances: readonly FixedRangeVolumeProfileInstance[]
  runtimeById: FixedRangeVolumeProfileRuntimeSnapshot
}

export type FixedRangeVolumeProfileChartToolCallbacks = {
  getSnapshot: () => FixedRangeVolumeProfileChartToolSnapshot
  getSelectionInterval: () => CandleInterval
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  onInteractionChange: (state: FixedRangeVolumeProfileInteractionState) => void
  onInstanceCompleted: (instance: FixedRangeVolumeProfileInstance) => void
  onInstanceUpdated: (instance: FixedRangeVolumeProfileInstance) => void
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  onRequestRender: () => void
  isAlternateToolActive: () => boolean
  getLineInteraction: () => LineInteractionState
  getLineInstances: () => readonly LineInstance[]
  getRectangleInteraction: () => RectangleInteractionState
  getRectangleInstances: () => readonly RectangleInstance[]
}

export type FixedRangeVolumeProfileChartToolController = {
  sync: () => void
  dispose: () => void
}

export function isFixedRangeVolumeProfileChartInteractionLocked(
  interaction: FixedRangeVolumeProfileInteractionState,
): boolean {
  return isFixedRangeVolumeProfileChartNavigationLocked(interaction)
}

export function applyFixedRangeVolumeProfileChartInteractionMode(
  chart: IChartApi,
  interaction: FixedRangeVolumeProfileInteractionState,
): boolean {
  const toolActive = isFixedRangeVolumeProfileChartInteractionLocked(interaction)
  chart.applyOptions({
    handleScroll: toolActive
      ? { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false }
      : {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
    handleScale: toolActive
      ? {
          mouseWheel: false,
          pinch: false,
          axisPressedMouseMove: { time: false, price: false },
          axisDoubleClickReset: { time: false, price: false },
        }
      : {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: { time: true, price: true },
          axisDoubleClickReset: { time: true, price: true },
        },
  })
  return toolActive
}

export function attachFixedRangeVolumeProfileChartTool(
  chart: IChartApi,
  callbacks: FixedRangeVolumeProfileChartToolCallbacks,
): FixedRangeVolumeProfileChartToolController {
  let panePointer: FixedRangeVolumeProfilePanePointerController | null = null

  const present = (interaction: FixedRangeVolumeProfileInteractionState) => {
    applyFixedRangeVolumeProfileChartInteractionMode(chart, interaction)
  }

  const commitInteraction = (next: FixedRangeVolumeProfileInteractionState) => {
    callbacks.onInteractionChange(next)
    present(next)
  }

  const sync = () => {
    present(callbacks.getSnapshot().interaction)
  }

  const pointerCallbacks: FixedRangeVolumeProfilePanePointerCallbacks = {
    getSnapshot: callbacks.getSnapshot,
    getSeries: callbacks.getSeries,
    getSelectionInterval: callbacks.getSelectionInterval,
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
    },
    onRequestRender: () => {
      callbacks.onRequestRender()
    },
    isAlternateToolActive: callbacks.isAlternateToolActive,
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
    getCompetingRectangleHit: (paneX, paneY) => {
      const series = callbacks.getSeries()
      if (!series) return null
      return rectangleHitAtPanePoint({
        chart,
        series,
        instances: callbacks.getRectangleInstances(),
        selectedId: callbacks.getRectangleInteraction().selectedId,
        paneX,
        paneY,
        intervalDurationSeconds: callbacks.getIntervalDurationSeconds(),
        lastBarUnixTime: callbacks.getLastBarUnixTime(),
      })
    },
  }

  panePointer = attachFixedRangeVolumeProfilePanePointer(chart, pointerCallbacks)

  const onCrosshairMove = (param: MouseEventParams<Time>) => {
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase !== 'preview') return
    const timeContext = buildFixedRangeVolumeProfileChartTimeContext(
      chart,
      callbacks.getLastBarUnixTime(),
      callbacks.getIntervalDurationSeconds(),
    )
    const hoverTime = resolveFixedRangeVolumeProfileCrosshairTime(chart, param, timeContext)
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
    applyFixedRangeVolumeProfileChartInteractionMode(chart, {
      phase: 'inactive',
      selectedId: null,
      draft: null,
    })
  }

  return { sync, dispose }
}
