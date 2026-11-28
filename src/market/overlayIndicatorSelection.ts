import type { ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import {
  isIndicatorSupportedOnExchange,
  isIndicatorSupportedOnInterval,
  marketIndicatorSupportsBandFill,
  shouldShowVwapIndicatorSeries,
  type MarketIndicatorId,
  type VwapContextLevel,
} from './indicators.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { CandleInterval, MarketExchange } from './types.ts'

/**
 * Overlay indicators have no geometry of their own, so they own no drawing
 * interaction state. Their selection is the same `ChartObjectSettingsTarget`
 * the double-click settings entry resolves, restricted to the object kinds that
 * are overlays — released through the shared single-click / empty-space / `Esc`
 * path instead of a second interaction system.
 *
 * Selection is transient UI state only: it is never persisted and never touches
 * the stored color, opacity, width or style of the selected object.
 */
export type OverlayIndicatorSelectionTarget = Extract<
  ChartObjectSettingsTarget,
  {
    kind:
      | 'market-indicator'
      | 'rolling-vwap'
      | 'aggregated-liquidations'
      | 'liquidation-levels'
      | 'stop-loss-levels'
      | 'take-profit-levels'
  }
>

export function isOverlayIndicatorSelectionTarget(
  target: ChartObjectSettingsTarget | null,
): target is OverlayIndicatorSelectionTarget {
  if (target === null) return false
  return (
    target.kind === 'market-indicator' ||
    target.kind === 'rolling-vwap' ||
    target.kind === 'aggregated-liquidations' ||
    target.kind === 'liquidation-levels' ||
    target.kind === 'stop-loss-levels' ||
    target.kind === 'take-profit-levels'
  )
}

/**
 * Single click resolves only overlay targets: drawings keep their own
 * per-tool selection state (`drawingSelection.ts`), so a hit that
 * `hitTestChartObjectSettingsTarget` assigns to a drawing never selects the
 * overlay indicator behind it.
 */
export function resolveOverlayIndicatorSelectionTarget(
  target: ChartObjectSettingsTarget | null,
): OverlayIndicatorSelectionTarget | null {
  return isOverlayIndicatorSelectionTarget(target) ? target : null
}

export function sameOverlayIndicatorSelection(
  a: OverlayIndicatorSelectionTarget | null,
  b: OverlayIndicatorSelectionTarget | null,
): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  switch (a.kind) {
    case 'market-indicator':
      return b.kind === 'market-indicator' && a.indicatorId === b.indicatorId
    case 'rolling-vwap':
      return (
        b.kind === 'rolling-vwap' &&
        a.instanceId === b.instanceId &&
        a.part === b.part
      )
    case 'aggregated-liquidations':
      return b.kind === 'aggregated-liquidations'
    case 'liquidation-levels':
      return b.kind === 'liquidation-levels'
    case 'stop-loss-levels':
      return b.kind === 'stop-loss-levels'
    case 'take-profit-levels':
      return b.kind === 'take-profit-levels'
    default: {
      const unreachable: never = a
      return unreachable
    }
  }
}

/**
 * Pure state change: returns the same reference when the selection is
 * unchanged so callers skip a re-render (and with it a halo repaint).
 */
export function applyOverlayIndicatorSelection(
  current: OverlayIndicatorSelectionTarget | null,
  next: OverlayIndicatorSelectionTarget | null,
): OverlayIndicatorSelectionTarget | null {
  if (sameOverlayIndicatorSelection(current, next)) return current
  return next
}

export type OverlayIndicatorSelectionRenderState = {
  activeIndicators: readonly MarketIndicatorId[]
  interval: CandleInterval
  /** Exchange of the panel's candles; exchange-scoped data never crosses over. */
  exchange: MarketExchange
  loadedVwapLevel: VwapContextLevel | null
  loadedVwapInterval: CandleInterval | null
  rollingVwapInstances: readonly RollingVwapInstance[]
}

function isMarketIndicatorRendered(
  indicatorId: MarketIndicatorId,
  state: OverlayIndicatorSelectionRenderState,
): boolean {
  if (!state.activeIndicators.includes(indicatorId)) return false
  if (!isIndicatorSupportedOnInterval(indicatorId, state.interval)) return false
  // The liquidation-level profile is a Hyperliquid book: on Binance the
  // indicator is explicitly unavailable, so it renders nothing and any
  // selection must be released.
  if (!isIndicatorSupportedOnExchange(indicatorId, state.exchange)) return false
  // Time-based VWAP series additionally wait for the VWAP context level that
  // covers the current viewport; EMA groups and RSI render on the interval alone.
  if (!marketIndicatorSupportsBandFill(indicatorId)) return true
  return shouldShowVwapIndicatorSeries({
    indicatorId,
    indicatorSelected: true,
    interval: state.interval,
    loadedLevel: state.loadedVwapLevel,
    loadedInterval: state.loadedVwapInterval,
  })
}

/**
 * A selection must not outlive the object it points at: hiding (indicator
 * toggle off, interval that does not support the indicator, rolling VWAP
 * `enabled: false`) or removing an object clears it, exactly like the drawing
 * tools drop a selection when the instance is gone.
 */
export function isOverlayIndicatorSelectionRendered(
  selection: OverlayIndicatorSelectionTarget | null,
  state: OverlayIndicatorSelectionRenderState,
): boolean {
  if (selection === null) return true
  switch (selection.kind) {
    case 'liquidation-levels':
      return isMarketIndicatorRendered('liquidation-levels', state)
    case 'stop-loss-levels':
      return isMarketIndicatorRendered('stop-loss-levels', state)
    case 'take-profit-levels':
      return isMarketIndicatorRendered('take-profit-levels', state)
    case 'market-indicator':
      return isMarketIndicatorRendered(selection.indicatorId, state)
    case 'rolling-vwap': {
      const instance = state.rollingVwapInstances.find(
        (item) => item.id === selection.instanceId,
      )
      if (instance === undefined || !instance.enabled) return false
      // A band-part selection cannot outlive its band: hiding the band pair via
      // a zero multiplier removes its geometry, so the selection is released
      // exactly like a hidden overlay.
      const part = selection.part
      if (part === 'band1') return instance.settings.multipliers.multiplier1 > 0
      if (part === 'band2') return instance.settings.multipliers.multiplier2 > 0
      if (part === 'band3') return instance.settings.multipliers.multiplier3 > 0
      return true
    }
    case 'aggregated-liquidations':
      return isMarketIndicatorRendered('aggregated-liquidations', state)
    default: {
      const unreachable: never = selection
      return unreachable
    }
  }
}

/**
 * Line series a selected overlay is drawn with, resolved from the live chart
 * bundle so a rebuilt series (interval/exchange change) is never stale. Panes
 * without a line path (Aggregated Liquidations bars) return no series and use
 * their pane-scoped selection feedback instead.
 */
export function overlayIndicatorSelectionLineSeries(
  bundle: ChartSeriesBundle | null,
  selection: OverlayIndicatorSelectionTarget | null,
  rollingVwapInstances: readonly RollingVwapInstance[],
): readonly ISeriesApi<'Line', Time>[] {
  if (!bundle || selection === null) return []
  switch (selection.kind) {
    case 'market-indicator': {
      const indicatorId = selection.indicatorId
      switch (indicatorId) {
        case 'triple-ema':
          return bundle.emas
        case 'dual-ema':
          return [bundle.ema100, bundle.ema200]
        case 'daily-vwap':
          return bundle.dailyVwap.ordered
        case 'weekly-vwap':
          return bundle.weeklyVwap.ordered
        case 'monthly-vwap':
          return bundle.monthlyVwap.ordered
        case 'quarterly-vwap':
          return bundle.quarterlyVwap.ordered
        case 'yearly-vwap':
          return bundle.yearlyVwap.ordered
        case 'rsi':
          return bundle.rsi ? [bundle.rsi.series] : []
        case 'rolling-vwap':
        case 'aggregated-liquidations':
        case 'liquidation-levels':
        case 'stop-loss-levels':
        case 'take-profit-levels':
          return []
        default: {
          const unreachable: never = indicatorId
          return unreachable
        }
      }
    }
    case 'rolling-vwap': {
      const instance = rollingVwapInstances.find((item) => item.id === selection.instanceId)
      if (!instance || !instance.enabled) return []
      const chartBundle = bundle.rollingVwaps.get(selection.instanceId)
      if (!chartBundle) return []
      // Band parts are stroked by the Rolling VWAP band primitive itself, with
      // their own color and width. Only the native centre uses this halo.
      if (selection.part === undefined || selection.part === 'all' || selection.part === 'center') {
        return [chartBundle.center]
      }
      return []
    }
    case 'aggregated-liquidations':
    case 'liquidation-levels':
    case 'stop-loss-levels':
    case 'take-profit-levels':
      return []
    default: {
      const unreachable: never = selection
      return unreachable
    }
  }
}

/**
 * Series whose pane hosts the selection halo. A halo primitive paints inside
 * the pane of the series it is attached to, so RSI attaches to its own pane
 * series and every candle-pane overlay attaches to the candle series.
 */
export function overlayIndicatorSelectionHostSeries(
  bundle: ChartSeriesBundle | null,
  selection: OverlayIndicatorSelectionTarget | null,
): ISeriesApi<SeriesType, Time> | null {
  if (!bundle || selection === null) return null
  if (selection.kind === 'market-indicator' && selection.indicatorId === 'rsi') {
    return bundle.rsi?.series ?? null
  }
  if (selection.kind === 'aggregated-liquidations') return null
  // Price-level profiles paint their own selection halo inside their primitive.
  if (
    selection.kind === 'liquidation-levels' ||
    selection.kind === 'stop-loss-levels' ||
    selection.kind === 'take-profit-levels'
  ) {
    return null
  }
  if (selection.kind === 'market-indicator' && selection.indicatorId === 'rolling-vwap') {
    return null
  }
  return bundle.candle
}
