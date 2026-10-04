import {
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
} from 'lightweight-charts'
import { applyMarketChartDrawingInteractionLock } from './chartDrawingInteractionLock.ts'
import { readHorizontalLineStrokeStyle } from './horizontalLineColors.ts'
import {
  applyHorizontalLineClick,
  cancelHorizontalLineInteraction,
  isHorizontalLineToolArmed,
  type HorizontalLineInteractionState,
} from './horizontalLineInteraction.ts'
import type { HorizontalLineInstance } from './horizontalLineInstances.ts'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'

export type HorizontalLineChartToolSnapshot = {
  interaction: HorizontalLineInteractionState
  instances: readonly HorizontalLineInstance[]
}

export type HorizontalLineChartToolCallbacks = {
  getSnapshot: () => HorizontalLineChartToolSnapshot
  getCandleSeries: () => ISeriesApi<'Candlestick'> | null
  onInteractionChange: (state: HorizontalLineInteractionState) => void
  onInstanceCompleted: (instance: HorizontalLineInstance) => void
  isChartInteractionLocked?: () => boolean
}

export type HorizontalLineChartToolController = {
  sync: () => void
  dispose: () => void
}

export function isHorizontalLineChartInteractionLocked(
  interaction: HorizontalLineInteractionState,
): boolean {
  return isHorizontalLineToolArmed(interaction)
}

export function resolvePaneRelativePointerY(event: PointerEvent, pane: HTMLElement): number {
  const rect = pane.getBoundingClientRect()
  return event.clientY - rect.top
}

export function resolveHorizontalLinePriceFromPaneY(
  series: ISeriesApi<'Candlestick'>,
  paneY: number,
): number | null {
  const price = series.coordinateToPrice(paneY)
  if (price === null || !Number.isFinite(price) || price <= 0) return null
  return price
}

function buildHorizontalLinePriceLineOptions(price: number) {
  const color = readHorizontalLineStrokeStyle()
  return {
    price,
    color,
    lineWidth: 1 as const,
    lineStyle: LineStyle.Solid,
    lineVisible: true,
    axisLabelVisible: true,
    axisLabelColor: color,
    title: '',
  }
}

export function reconcileHorizontalLinePriceLines(
  series: ISeriesApi<'Candlestick'>,
  instances: readonly HorizontalLineInstance[],
  priceLinesById: Map<string, IPriceLine>,
): void {
  const nextIds = new Set(instances.map((item) => item.id))

  for (const [id, line] of priceLinesById) {
    if (!nextIds.has(id)) {
      series.removePriceLine(line)
      priceLinesById.delete(id)
    }
  }

  for (const instance of instances) {
    if (priceLinesById.has(instance.id)) continue
    const line = series.createPriceLine(buildHorizontalLinePriceLineOptions(instance.price))
    priceLinesById.set(instance.id, line)
  }
}

export function attachHorizontalLineChartTool(
  chart: IChartApi,
  callbacks: HorizontalLineChartToolCallbacks,
): HorizontalLineChartToolController {
  const priceLinesById = new Map<string, IPriceLine>()
  let panePointerDispose: (() => void) | null = null

  const isLocked = () =>
    callbacks.isChartInteractionLocked?.() ??
    isHorizontalLineChartInteractionLocked(callbacks.getSnapshot().interaction)

  const presentInteractionLock = () => {
    applyMarketChartDrawingInteractionLock(chart, isLocked())
  }

  const reconcile = () => {
    const series = callbacks.getCandleSeries()
    if (!series) return
    reconcileHorizontalLinePriceLines(series, callbacks.getSnapshot().instances, priceLinesById)
  }

  const commitInteraction = (next: HorizontalLineInteractionState) => {
    callbacks.onInteractionChange(next)
    presentInteractionLock()
  }

  const sync = () => {
    presentInteractionLock()
    reconcile()
  }

  const pane = chart.panes()[0]
  const paneElement = pane.getHTMLElement()
  if (paneElement) {
    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      const snapshot = callbacks.getSnapshot()
      if (!isHorizontalLineToolArmed(snapshot.interaction)) return

      const series = callbacks.getCandleSeries()
      if (!series) return

      const paneX = resolvePaneRelativePointerX(event, paneElement)
      const paneY = resolvePaneRelativePointerY(event, paneElement)
      if (paneX < 0 || paneY < 0 || paneX > paneElement.clientWidth || paneY > paneElement.clientHeight) {
        return
      }

      const clickPrice = resolveHorizontalLinePriceFromPaneY(series, paneY)
      const result = applyHorizontalLineClick(
        snapshot.interaction,
        clickPrice,
        snapshot.instances,
      )
      commitInteraction(result.state)
      if (result.completedInstance) {
        callbacks.onInstanceCompleted(result.completedInstance)
        sync()
      }
    }

    paneElement.addEventListener('pointerup', onPointerUp)
    panePointerDispose = () => {
      paneElement.removeEventListener('pointerup', onPointerUp)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const snapshot = callbacks.getSnapshot()
    const next = cancelHorizontalLineInteraction(snapshot.interaction)
    if (next === snapshot.interaction) return
    commitInteraction(next)
  }

  window.addEventListener('keydown', onKeyDown)
  sync()

  const dispose = () => {
    window.removeEventListener('keydown', onKeyDown)
    panePointerDispose?.()
    panePointerDispose = null
    const series = callbacks.getCandleSeries()
    if (series) {
      for (const line of priceLinesById.values()) {
        series.removePriceLine(line)
      }
    }
    priceLinesById.clear()
    applyMarketChartDrawingInteractionLock(chart, false)
  }

  return { sync, dispose }
}
