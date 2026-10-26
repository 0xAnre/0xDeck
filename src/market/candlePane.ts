import type { IChartApi, IPaneApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'

const candleSeriesByChart = new WeakMap<IChartApi, ISeriesApi<SeriesType, Time>>()
const paneChangeListenersByChart = new WeakMap<IChartApi, Set<() => void>>()

/**
 * Remember which series owns the price candles. Pane order is not fixed: the
 * aggregated-liquidations pane can be moved above the candles, so callers must
 * resolve the candle pane by series identity instead of assuming pane 0.
 */
export function registerCandleChartSeries(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
): void {
  candleSeriesByChart.set(chart, series)
  notifyCandlePaneChange(chart)
}

export function resolveCandlePane(chart: IChartApi): IPaneApi<Time> | null {
  const candleSeries = candleSeriesByChart.get(chart)
  if (candleSeries) {
    return candleSeries.getPane()
  }
  return chart.panes()[0] ?? null
}

export function resolveCandlePaneElement(chart: IChartApi): HTMLElement | null {
  return resolveCandlePane(chart)?.getHTMLElement() ?? null
}

/**
 * Pane index that owns the candles, for `chart.addSeries(..., paneIndex)`.
 * Without it Lightweight Charts defaults to pane 0, which is the liquidation
 * pane while `Position: Top` is active. Unknown charts fall back to pane 0.
 */
export function resolveCandlePaneIndex(chart: IChartApi): number {
  const candleSeries = candleSeriesByChart.get(chart)
  if (!candleSeries) return 0
  return candleSeries.getPane().paneIndex()
}

/** Notify listeners after panes are reordered (e.g. Top/Bottom liquidation position). */
export function notifyCandlePaneChange(chart: IChartApi): void {
  const listeners = paneChangeListenersByChart.get(chart)
  if (!listeners) return
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeCandlePaneChange(
  chart: IChartApi,
  listener: () => void,
): () => void {
  let listeners = paneChangeListenersByChart.get(chart)
  if (!listeners) {
    listeners = new Set()
    paneChangeListenersByChart.set(chart, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export type CandlePaneElementListener = {
  type: string
  listener: EventListener
}

/**
 * Keep pointer listeners on whichever DOM element currently renders the candle
 * pane. Lightweight Charts reuses the pane widgets by index when panes move, so
 * the element reference has to follow the candle pane.
 */
export function bindCandlePaneElementListeners(
  chart: IChartApi,
  listeners: readonly CandlePaneElementListener[],
  onElementChange?: (element: HTMLElement) => void,
): { dispose: () => void } {
  let currentElement: HTMLElement | null = null

  const unbindCurrent = () => {
    if (!currentElement) return
    for (const { type, listener } of listeners) {
      currentElement.removeEventListener(type, listener)
    }
  }

  const bind = () => {
    const nextElement = resolveCandlePaneElement(chart)
    if (nextElement === currentElement) return
    unbindCurrent()
    currentElement = nextElement
    if (!currentElement) return
    for (const { type, listener } of listeners) {
      currentElement.addEventListener(type, listener)
    }
    onElementChange?.(currentElement)
  }

  bind()
  const unsubscribe = subscribeCandlePaneChange(chart, bind)

  return {
    dispose: () => {
      unsubscribe()
      unbindCurrent()
      currentElement = null
    },
  }
}
