import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { resolveCandlePaneElement } from './candlePane.ts'
import { applyChartDrawingInteractionMode } from './chartDrawingInteractionMode.ts'
import {
  cancelAnchoredVwapDrawingInteraction,
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  removeSelectedAnchoredVwap,
  restoreAnchoredVwapDragAnchor,
  type AnchoredVwapDrawingInteractionState,
} from './anchoredVwapDrawingInteraction.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import {
  attachAnchoredVwapDrawingPanePointer,
  type AnchoredVwapDrawingPanePointerController,
} from './anchoredVwapDrawingPanePointer.ts'
import { frvpHitAtPanePoint, lineHitAtPanePoint, rectangleHitAtPanePoint } from './drawingPointerArbitration.ts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import type { LineInteractionState } from './lineInteraction.ts'
import type { LineInstance } from './lineInstances.ts'
import { isRectangleKeyboardFocusOnOutsideControl } from './rectangleKeyboardScope.ts'
import type { RectangleInteractionState } from './rectangleInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import type { MarketCandle } from './types.ts'

export type AnchoredVwapDrawingChartToolCallbacks = {
  getSnapshot: () => {
    interaction: AnchoredVwapDrawingInteractionState
    instances: readonly AnchoredVwapInstance[]
    candles: readonly MarketCandle[]
  }
  shouldHandleKeyboardShortcut: () => boolean
  onInteractionChange: (state: AnchoredVwapDrawingInteractionState) => void
  onInstancesChange: (instances: AnchoredVwapInstance[]) => void
  onInstanceUpdated: (instance: AnchoredVwapInstance) => void
  onRequestRender: () => void
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getIntervalDurationSeconds: () => number
  getLastBarUnixTime: () => number | null
  getLineInteraction: () => LineInteractionState
  getRectangleInteraction: () => RectangleInteractionState
  getFixedRangeVolumeProfileInteraction: () => FixedRangeVolumeProfileInteractionState
  getLineInstances: () => readonly LineInstance[]
  getRectangleInstances: () => readonly RectangleInstance[]
  getFixedRangeVolumeProfileInstances: () => readonly FixedRangeVolumeProfileInstance[]
  getFixedRangeVolumeProfileRuntime: () => FixedRangeVolumeProfileRuntimeSnapshot
  isAlternateToolActive: () => boolean
}

export type AnchoredVwapDrawingChartToolController = {
  sync: () => void
  dispose: () => void
}

export function applyAnchoredVwapDrawingChartInteractionMode(
  chart: IChartApi,
  anchoredVwapInteraction: AnchoredVwapDrawingInteractionState,
  rectangleInteraction: RectangleInteractionState,
  lineInteraction: LineInteractionState,
  frvpInteraction: FixedRangeVolumeProfileInteractionState,
): void {
  applyChartDrawingInteractionMode(
    chart,
    rectangleInteraction,
    lineInteraction,
    frvpInteraction,
    anchoredVwapInteraction,
  )
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function attachAnchoredVwapDrawingChartTool(
  chart: IChartApi,
  callbacks: AnchoredVwapDrawingChartToolCallbacks,
): AnchoredVwapDrawingChartToolController {
  let panePointer: AnchoredVwapDrawingPanePointerController | null = null

  const present = () => {
    const snapshot = callbacks.getSnapshot()
    applyAnchoredVwapDrawingChartInteractionMode(
      chart,
      snapshot.interaction,
      callbacks.getRectangleInteraction(),
      callbacks.getLineInteraction(),
      callbacks.getFixedRangeVolumeProfileInteraction(),
    )
  }

  const commitInteraction = (next: AnchoredVwapDrawingInteractionState) => {
    callbacks.onInteractionChange(next)
    present()
    callbacks.onRequestRender()
  }

  const sync = () => {
    present()
  }

  panePointer = attachAnchoredVwapDrawingPanePointer(chart, {
    getSnapshot: () => callbacks.getSnapshot(),
    getChart: callbacks.getChart,
    getSeries: callbacks.getSeries,
    getIntervalDurationSeconds: callbacks.getIntervalDurationSeconds,
    getLastBarUnixTime: callbacks.getLastBarUnixTime,
    onInteractionChange: commitInteraction,
    onInstancesChange: (instances) => {
      callbacks.onInstancesChange(instances)
      callbacks.onRequestRender()
    },
    onInstanceUpdated: (instance) => {
      callbacks.onInstanceUpdated(instance)
      callbacks.onRequestRender()
    },
    onRequestRender: callbacks.onRequestRender,
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
    getCompetingFrvpHit: (paneX, paneY) => {
      const series = callbacks.getSeries()
      if (!series) return null
      return frvpHitAtPanePoint({
        chart,
        series,
        instances: callbacks.getFixedRangeVolumeProfileInstances(),
        runtimeById: callbacks.getFixedRangeVolumeProfileRuntime(),
        selectedId: callbacks.getFixedRangeVolumeProfileInteraction().selectedId,
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
      const restored = restoreAnchoredVwapDragAnchor(snapshot.interaction, snapshot.instances)
      if (restored) {
        callbacks.onInstanceUpdated(restored)
      }
      const next = cancelAnchoredVwapDrawingInteraction(snapshot.interaction)
      if (next === snapshot.interaction) return
      event.preventDefault()
      commitInteraction(next)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const chartRoot = resolveCandlePaneElement(chart)
      if (isRectangleKeyboardFocusOnOutsideControl(event.target, chartRoot)) return
      if (!snapshot.interaction.selectedId) return
      if (snapshot.interaction.phase === 'dragging-anchor') return
      event.preventDefault()
      const result = removeSelectedAnchoredVwap(snapshot.interaction, snapshot.instances)
      commitInteraction(result.state)
      callbacks.onInstancesChange([...result.instances])
    }
  }

  window.addEventListener('keydown', onKeyDown)
  sync()

  return {
    sync,
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown)
      panePointer?.dispose()
      panePointer = null
      applyAnchoredVwapDrawingChartInteractionMode(
        chart,
        INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
        callbacks.getRectangleInteraction(),
        callbacks.getLineInteraction(),
        callbacks.getFixedRangeVolumeProfileInteraction(),
      )
      callbacks.onInteractionChange(INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE)
    },
  }
}
