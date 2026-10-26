import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { resolveCandlePaneElement } from './candlePane.ts'
import { applyChartDrawingInteractionMode } from './chartDrawingInteractionMode.ts'
import {
  anchoredVwapHitAtPanePoint,
  frvpHitAtPanePoint,
  lineHitAtPanePoint,
} from './drawingPointerArbitration.ts'
import {
  isFixedRangeVolumeProfileChartNavigationLocked,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import {
  cancelRectangleInteraction,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  removeSelectedRectangle,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'
import {
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  isAnchoredVwapDrawingBlockingPeerTools,
  type AnchoredVwapDrawingInteractionState,
} from './anchoredVwapDrawingInteraction.ts'
import {
  isLineDrawingBlockingPeerTools,
  type LineInteractionState,
} from './lineInteraction.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { LineInstance } from './lineInstances.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import type { MarketCandle } from './types.ts'
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
  getFixedRangeVolumeProfileInstances: () => readonly FixedRangeVolumeProfileInstance[]
  getFixedRangeVolumeProfileRuntime: () => FixedRangeVolumeProfileRuntimeSnapshot
  getAnchoredVwapDrawingInteraction?: () => AnchoredVwapDrawingInteractionState
  getAnchoredVwapInstances?: () => readonly AnchoredVwapInstance[]
  getAnchoredVwapCandles?: () => readonly MarketCandle[]
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
  anchoredVwapInteraction: AnchoredVwapDrawingInteractionState = INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
): void {
  applyChartDrawingInteractionMode(
    chart,
    rectangleInteraction,
    lineInteraction,
    frvpInteraction,
    anchoredVwapInteraction,
  )
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
      callbacks.getAnchoredVwapDrawingInteraction?.() ??
        INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
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
      const anchoredVwap =
        callbacks.getAnchoredVwapDrawingInteraction?.() ??
        INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE
      return (
        isFixedRangeVolumeProfileChartNavigationLocked(frvp) ||
        isLineDrawingBlockingPeerTools(line) ||
        isAnchoredVwapDrawingBlockingPeerTools(anchoredVwap)
      )
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
    getCompetingFrvpHit: (paneX, paneY) => {
      const series = callbacks.getSeries()
      if (!series) return null
      const frvpInteraction = callbacks.getFixedRangeVolumeProfileInteraction()
      return frvpHitAtPanePoint({
        chart,
        series,
        instances: callbacks.getFixedRangeVolumeProfileInstances(),
        runtimeById: callbacks.getFixedRangeVolumeProfileRuntime(),
        selectedId: frvpInteraction.selectedId,
        paneX,
        paneY,
        intervalDurationSeconds: callbacks.getIntervalDurationSeconds(),
        lastBarUnixTime: callbacks.getLastBarUnixTime(),
      })
    },
    getCompetingAnchoredVwapHit: (paneX, paneY) => {
      const series = callbacks.getSeries()
      const getInstances = callbacks.getAnchoredVwapInstances
      const getCandles = callbacks.getAnchoredVwapCandles
      const getInteraction = callbacks.getAnchoredVwapDrawingInteraction
      if (!series || !getInstances || !getCandles || !getInteraction) return null
      return anchoredVwapHitAtPanePoint({
        chart,
        series,
        instances: getInstances(),
        selectedId: getInteraction().selectedId,
        candles: getCandles(),
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
      const chartRoot = resolveCandlePaneElement(chart)
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
      callbacks.getAnchoredVwapDrawingInteraction?.() ??
        INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
    )
  }

  return { sync, dispose }
}
