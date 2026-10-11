import type { MarketIndicatorId } from './indicators.ts'

export type ChartObjectSettingsTarget =
  | { kind: 'rectangle'; instanceId: string }
  | { kind: 'line'; instanceId: string }
  | { kind: 'fixed-range-volume-profile'; instanceId: string }
  | { kind: 'rolling-vwap'; instanceId: string }
  | { kind: 'market-indicator'; indicatorId: MarketIndicatorId }

export function chartObjectSettingsTargetKey(target: ChartObjectSettingsTarget): string {
  switch (target.kind) {
    case 'rectangle':
    case 'line':
    case 'fixed-range-volume-profile':
    case 'rolling-vwap':
      return `${target.kind}:${target.instanceId}`
    case 'market-indicator':
      return `market-indicator:${target.indicatorId}`
    default: {
      const unreachable: never = target
      return unreachable
    }
  }
}
