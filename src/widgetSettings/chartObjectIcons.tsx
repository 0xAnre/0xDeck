import type { LucideIcon } from 'lucide-react'
import {
  ActivityIcon,
  BoxIcon,
  ChartNoAxesColumnIncreasingIcon,
  LineChartIcon,
  MinusIcon,
  TrendingUpIcon,
} from 'lucide-react'
import type { MarketIndicatorId } from '@/market/indicators'
import type { NumberedChartObjectKind } from '@/market/chartObjectDisplaySequence'

export function numberedChartObjectIcon(kind: NumberedChartObjectKind): LucideIcon {
  switch (kind) {
    case 'box':
      return BoxIcon
    case 'line':
      return MinusIcon
    case 'frvp':
      return ChartNoAxesColumnIncreasingIcon
    case 'rolling-vwap':
    case 'anchored-vwap':
      return ActivityIcon
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

export function marketIndicatorIcon(indicatorId: MarketIndicatorId): LucideIcon {
  switch (indicatorId) {
    case 'triple-ema':
    case 'dual-ema':
      return TrendingUpIcon
    case 'daily-vwap':
    case 'weekly-vwap':
    case 'monthly-vwap':
    case 'quarterly-vwap':
    case 'yearly-vwap':
      return LineChartIcon
    case 'rolling-vwap':
    case 'rsi':
      return ActivityIcon
    default: {
      const unreachable: never = indicatorId
      return unreachable
    }
  }
}
