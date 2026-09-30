import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfileClick,
  applyFixedRangeVolumeProfileCrosshairTime,
  cancelFixedRangeVolumeProfileInteraction,
  isFixedRangeVolumeProfileToolActive,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { CandleInterval } from './types.ts'
import { resolveChartEventTime } from './fixedRangeVolumeProfileChartTime.ts'
import {
  buildFixedRangeVolumeProfileRangeSegments,
  FixedRangeVolumeProfileRangePrimitive,
} from './fixedRangeVolumeProfileRangePrimitive.ts'

export type FixedRangeVolumeProfileChartToolSnapshot = {
  interaction: FixedRangeVolumeProfileInteractionState
  instances: readonly FixedRangeVolumeProfileInstance[]
}

export type FixedRangeVolumeProfileChartToolCallbacks = {
  getSnapshot: () => FixedRangeVolumeProfileChartToolSnapshot
  getSelectionInterval: () => CandleInterval
  onInteractionChange: (state: FixedRangeVolumeProfileInteractionState) => void
  onInstanceCompleted: (instance: FixedRangeVolumeProfileInstance) => void
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
  const primitive = new FixedRangeVolumeProfileRangePrimitive(() => {
    const snapshot = callbacks.getSnapshot()
    return buildFixedRangeVolumeProfileRangeSegments(snapshot.instances, snapshot.interaction)
  })

  const pane = chart.panes()[0]
  pane.attachPrimitive(primitive)

  const present = (interaction: FixedRangeVolumeProfileInteractionState) => {
    applyFixedRangeVolumeProfileChartInteractionMode(chart, interaction)
    primitive.updateAllViews()
  }

  const commitInteraction = (next: FixedRangeVolumeProfileInteractionState) => {
    callbacks.onInteractionChange(next)
    present(next)
  }

  const sync = () => {
    present(callbacks.getSnapshot().interaction)
  }

  const onClick = (param: MouseEventParams<Time>) => {
    if (!param.point) return
    const clickTime = resolveChartEventTime(param.time)
    const snapshot = callbacks.getSnapshot()
    const result = applyFixedRangeVolumeProfileClick(
      snapshot.interaction,
      clickTime,
      snapshot.instances,
      callbacks.getSelectionInterval(),
    )
    commitInteraction(result.state)
    if (result.completedInstance) {
      callbacks.onInstanceCompleted(result.completedInstance)
      sync()
    }
  }

  const onCrosshairMove = (param: MouseEventParams<Time>) => {
    const snapshot = callbacks.getSnapshot()
    if (snapshot.interaction.phase !== 'preview') return
    const hoverTime = param.point ? resolveChartEventTime(param.time) : null
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

  chart.subscribeClick(onClick)
  chart.subscribeCrosshairMove(onCrosshairMove)
  window.addEventListener('keydown', onKeyDown)

  sync()

  const dispose = () => {
    window.removeEventListener('keydown', onKeyDown)
    chart.unsubscribeClick(onClick)
    chart.unsubscribeCrosshairMove(onCrosshairMove)
    pane.detachPrimitive(primitive)
    applyFixedRangeVolumeProfileChartInteractionMode(
      chart,
      { phase: 'inactive', draft: null },
    )
    primitive.updateAllViews()
  }

  return { sync, dispose }
}
