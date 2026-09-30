import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfileClick,
  applyFixedRangeVolumeProfileCrosshairTime,
  cancelFixedRangeVolumeProfileInteraction,
  isFixedRangeVolumeProfileToolActive,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
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
  onInteractionChange: (state: FixedRangeVolumeProfileInteractionState) => void
  onInstanceCompleted: (instance: FixedRangeVolumeProfileInstance) => void
  onRequestChartInteractionOptions: (toolActive: boolean) => void
}

function applyChartInteractionMode(chart: IChartApi, toolActive: boolean): void {
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
}

export function attachFixedRangeVolumeProfileChartTool(
  chart: IChartApi,
  callbacks: FixedRangeVolumeProfileChartToolCallbacks,
): () => void {
  const primitive = new FixedRangeVolumeProfileRangePrimitive(() => {
    const snapshot = callbacks.getSnapshot()
    return buildFixedRangeVolumeProfileRangeSegments(snapshot.instances, snapshot.interaction)
  })

  const pane = chart.panes()[0]
  pane.attachPrimitive(primitive)

  const syncInteractionMode = () => {
    const active = isFixedRangeVolumeProfileToolActive(callbacks.getSnapshot().interaction)
    applyChartInteractionMode(chart, active)
    callbacks.onRequestChartInteractionOptions(active)
    primitive.updateAllViews()
  }

  const onClick = (param: MouseEventParams<Time>) => {
    if (!param.point) return
    const clickTime = resolveChartEventTime(param.time)
    const snapshot = callbacks.getSnapshot()
    const result = applyFixedRangeVolumeProfileClick(
      snapshot.interaction,
      clickTime,
      snapshot.instances,
    )
    callbacks.onInteractionChange(result.state)
    if (result.completedInstance) {
      callbacks.onInstanceCompleted(result.completedInstance)
    }
    syncInteractionMode()
    primitive.updateAllViews()
  }

  const onCrosshairMove = (param: MouseEventParams<Time>) => {
    const snapshot = callbacks.getSnapshot()
    const hoverTime = param.point ? resolveChartEventTime(param.time) : null
    const next = applyFixedRangeVolumeProfileCrosshairTime(snapshot.interaction, hoverTime)
    if (next === snapshot.interaction) return
    callbacks.onInteractionChange(next)
    primitive.updateAllViews()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const snapshot = callbacks.getSnapshot()
    const next = cancelFixedRangeVolumeProfileInteraction(snapshot.interaction)
    if (next === snapshot.interaction) return
    callbacks.onInteractionChange(next)
    syncInteractionMode()
    primitive.updateAllViews()
  }

  chart.subscribeClick(onClick)
  chart.subscribeCrosshairMove(onCrosshairMove)
  window.addEventListener('keydown', onKeyDown)

  syncInteractionMode()

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    chart.unsubscribeClick(onClick)
    chart.unsubscribeCrosshairMove(onCrosshairMove)
    pane.detachPrimitive(primitive)
    applyChartInteractionMode(chart, false)
  }
}
