import type { IChartApi, IPaneApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  notifyCandlePaneChange,
  resolveCandlePaneElement,
  subscribeCandlePaneChange,
} from './candlePane.ts'

/**
 * Non-candle panes that own a chart object's settings. They are resolved by
 * series identity for the same reason as the candle pane: panes can be added,
 * removed and reordered (Aggregated Liquidations `Top`/`Bottom`, RSI above a
 * bottom liquidations pane), so a fixed pane index is never safe.
 */
export type ChartPaneRole = 'rsi' | 'aggregated-liquidations' | 'order-book-depth'

export type ChartPaneElementRole = 'candle' | ChartPaneRole

export type ChartPaneElementTarget = {
  role: ChartPaneElementRole
  element: HTMLElement
}

const roleSeriesByChart = new WeakMap<
  IChartApi,
  Map<ChartPaneRole, ISeriesApi<SeriesType, Time>>
>()

const pendingWidgetRefreshByChart = new WeakSet<IChartApi>()

/** Pane widgets appear on the next invalidation frame, not on `chart.addPane()`. */
const PANE_WIDGET_REFRESH_FRAMES = 2

function roleSeriesForChart(
  chart: IChartApi,
): Map<ChartPaneRole, ISeriesApi<SeriesType, Time>> {
  let roles = roleSeriesByChart.get(chart)
  if (!roles) {
    roles = new Map()
    roleSeriesByChart.set(chart, roles)
  }
  return roles
}

function schedulePaneWidgetRefresh(chart: IChartApi, remainingFrames: number): void {
  if (typeof requestAnimationFrame !== 'function') return
  if (pendingWidgetRefreshByChart.has(chart)) return
  pendingWidgetRefreshByChart.add(chart)
  requestAnimationFrame(() => {
    pendingWidgetRefreshByChart.delete(chart)
    notifyCandlePaneChange(chart)
    if (remainingFrames > 1) {
      schedulePaneWidgetRefresh(chart, remainingFrames - 1)
    }
  })
}

/** Remember which series renders a role's pane and let pane listeners rebind. */
export function registerChartPaneRoleSeries(
  chart: IChartApi,
  role: ChartPaneRole,
  series: ISeriesApi<SeriesType, Time>,
): void {
  const roles = roleSeriesForChart(chart)
  if (roles.get(role) === series) return
  roles.set(role, series)
  notifyCandlePaneChange(chart)
  schedulePaneWidgetRefresh(chart, PANE_WIDGET_REFRESH_FRAMES)
}

export function unregisterChartPaneRoleSeries(
  chart: IChartApi,
  role: ChartPaneRole,
  series?: ISeriesApi<SeriesType, Time>,
): void {
  const roles = roleSeriesByChart.get(chart)
  if (!roles) return
  if (series && roles.get(role) !== series) return
  if (!roles.delete(role)) return
  notifyCandlePaneChange(chart)
}

export function resolveChartPaneRolePane(
  chart: IChartApi,
  role: ChartPaneRole,
): IPaneApi<Time> | null {
  const series = roleSeriesByChart.get(chart)?.get(role)
  return series ? series.getPane() : null
}

export function resolveChartPaneRoleElement(
  chart: IChartApi,
  role: ChartPaneRole,
): HTMLElement | null {
  return resolveChartPaneRolePane(chart, role)?.getHTMLElement() ?? null
}

/** Which role a currently bound pane element belongs to, if any. */
export function resolveChartPaneElementRole(
  chart: IChartApi,
  element: HTMLElement,
): ChartPaneElementRole | null {
  if (element === resolveCandlePaneElement(chart)) return 'candle'
  for (const role of ['rsi', 'aggregated-liquidations', 'order-book-depth'] as const) {
    if (element === resolveChartPaneRoleElement(chart, role)) return role
  }
  return null
}

/**
 * Every pane element that can host a chart object setting, with its role.
 * Elements are deduplicated so one DOM node is never bound twice.
 */
export function resolveChartPaneElementTargets(chart: IChartApi): ChartPaneElementTarget[] {
  const targets: ChartPaneElementTarget[] = []
  const seen = new Set<HTMLElement>()
  const push = (role: ChartPaneElementRole, element: HTMLElement | null) => {
    if (!element || seen.has(element)) return
    seen.add(element)
    targets.push({ role, element })
  }
  push('candle', resolveCandlePaneElement(chart))
  push('rsi', resolveChartPaneRoleElement(chart, 'rsi'))
  push('aggregated-liquidations', resolveChartPaneRoleElement(chart, 'aggregated-liquidations'))
  push('order-book-depth', resolveChartPaneRoleElement(chart, 'order-book-depth'))
  return targets
}

/**
 * Keep role-specific listeners on whichever DOM element currently renders that
 * role's pane. Lightweight Charts reuses the pane widgets by index when panes
 * move, so both new elements and changed element roles trigger a rebind.
 */
export function bindChartPaneRoleElementListeners(
  chart: IChartApi,
  bind: (role: ChartPaneElementRole, element: HTMLElement) => () => void,
): { dispose: () => void } {
  const bindings = new Map<
    HTMLElement,
    { role: ChartPaneElementRole; dispose: () => void }
  >()

  const sync = () => {
    const targets = resolveChartPaneElementTargets(chart)
    const roleByElement = new Map(targets.map((target) => [target.element, target.role]))

    for (const [element, binding] of [...bindings]) {
      if (roleByElement.get(element) === binding.role) continue
      binding.dispose()
      bindings.delete(element)
    }

    for (const { role, element } of targets) {
      if (bindings.has(element)) continue
      bindings.set(element, { role, dispose: bind(role, element) })
    }
  }

  sync()
  const unsubscribe = subscribeCandlePaneChange(chart, sync)

  return {
    dispose: () => {
      unsubscribe()
      for (const binding of bindings.values()) {
        binding.dispose()
      }
      bindings.clear()
    },
  }
}
