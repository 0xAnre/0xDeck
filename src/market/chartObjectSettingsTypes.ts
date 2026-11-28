import type { MarketIndicatorId } from './indicators.ts'
import type { RollingVwapBandPart } from './rollingVwapBandRenderGeometry.ts'

export type ChartObjectSettingsTarget =
  | { kind: 'rectangle'; instanceId: string }
  | { kind: 'line'; instanceId: string }
  | { kind: 'fixed-range-volume-profile'; instanceId: string }
  | {
      kind: 'rolling-vwap'
      instanceId: string
      /**
       * Band/centre part resolved by the chart hit test for selection feedback.
       * Absent means the whole instance (header gear / legacy callers); the
       * settings dialog is always per instance, never per part.
       */
      part?: RollingVwapBandPart
    }
  | { kind: 'anchored-vwap'; instanceId: string }
  | { kind: 'market-indicator'; indicatorId: MarketIndicatorId }
  /** Panel-scoped: the Aggregated Liquidations pane is one object per chart. */
  | { kind: 'aggregated-liquidations' }
  /**
   * Panel-scoped live price-level profiles on the candle pane. They own
   * hit-testable bar geometry but no movable handles, lock or delete action.
   */
  | { kind: 'liquidation-levels' }
  | { kind: 'stop-loss-levels' }
  | { kind: 'take-profit-levels' }

export function chartObjectSettingsTargetKey(target: ChartObjectSettingsTarget): string {
  switch (target.kind) {
    case 'rectangle':
    case 'line':
    case 'fixed-range-volume-profile':
    case 'rolling-vwap':
    case 'anchored-vwap':
      return `${target.kind}:${target.instanceId}`
    case 'market-indicator':
      return `market-indicator:${target.indicatorId}`
    case 'aggregated-liquidations':
      return 'aggregated-liquidations'
    case 'liquidation-levels':
      return 'liquidation-levels'
    case 'stop-loss-levels':
      return 'stop-loss-levels'
    case 'take-profit-levels':
      return 'take-profit-levels'
    default: {
      const unreachable: never = target
      return unreachable
    }
  }
}
