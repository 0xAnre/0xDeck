import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfileChartInteractionMode,
  isFixedRangeVolumeProfileChartInteractionLocked,
} from './fixedRangeVolumeProfileChartTool.ts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'
import {
  cancelRectangleInteraction,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  isRectangleChartNavigationLocked,
  removeSelectedRectangle,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
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
  onInteractionChange: (state: RectangleInteractionState) => void
  onInstancesChange: (instances: RectangleInstance[]) => void
  onInstanceCompleted: (instance: RectangleInstance) => void
  onInstanceUpdated: (instance: RectangleInstance) => void
  onRequestRender: () => void
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<SeriesType, Time> | null
  getFixedRangeVolumeProfileInteraction: () => FixedRangeVolumeProfileInteractionState
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
  frvpInteraction: FixedRangeVolumeProfileInteractionState,
): void {
  const rectangleLocked = isRectangleChartNavigationLocked(rectangleInteraction)
  const frvpLocked = isFixedRangeVolumeProfileChartInteractionLocked(frvpInteraction)
  if (rectangleLocked) {
    applyFixedRangeVolumeProfileChartInteractionMode(chart, {
      phase: 'armed',
      draft: null,
    })
    return
  }
  applyFixedRangeVolumeProfileChartInteractionMode(chart, frvpInteraction)
  if (frvpLocked) return
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
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableKeyboardTarget(event.target)) return
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
      if (!snapshot.interaction.selectedId) return
      if (snapshot.interaction.phase === 'creating' || snapshot.interaction.phase === 'resizing') {
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
      callbacks.getFixedRangeVolumeProfileInteraction(),
    )
  }

  return { sync, dispose }
}
