import { BtcPerpetualChartPanel } from '@/BtcPerpetualChartPanel'
import { ChartPanel } from '@/ChartPanel'
import { BTC_USDM_KLINE_CHANNELS } from '@/market/types'
import { DashboardPanel } from '@/DashboardPanel'
import { DataTablePanel } from '@/DataTablePanel'
import { KpiCardPanel } from '@/KpiCardPanel'
import { MarketTimesPanel } from '@/MarketTimesPanel'
import { NotesPanel } from '@/NotesPanel'
import { ReportsPanel } from '@/ReportsPanel'
import type { WidgetDefinition, WidgetInstanceProps } from '@/widgets/registry/types'

export const WIDGET_REGISTRY = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'KPI · chart · table',
    component: DashboardPanel,
    grid: { x: 0, y: 0, w: 24, h: 16, minW: 12, minH: 12 },
    headerSettings: {
      dataset: true,
      timeRange: true,
      columns: false,
      metric: false,
      aggregation: false,
      interval: false,
      indicators: false,
    },
    stateScope: 'instance',
    data: { kind: 'rest', queries: ['preview', 'series'] },
  },
  {
    id: 'kpi-card',
    title: 'KPI Card',
    description: 'Metric preview',
    component: KpiCardPanel,
    grid: { x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
    headerSettings: {
      dataset: true,
      timeRange: true,
      columns: false,
      metric: true,
      aggregation: true,
      interval: false,
      indicators: false,
    },
    stateScope: 'instance',
    data: { kind: 'rest', queries: ['schema', 'kpi'] },
  },
  {
    id: 'notes',
    title: 'Notes',
    description: 'Markdown · local save',
    component: function NotesWidget(props: WidgetInstanceProps) {
      void props
      return <NotesPanel />
    },
    grid: { x: 0, y: 4, w: 12, h: 12, minW: 8, minH: 8 },
    headerSettings: {
      dataset: false,
      timeRange: false,
      columns: false,
      metric: false,
      aggregation: false,
      interval: false,
      indicators: false,
    },
    stateScope: 'workspace',
    data: { kind: 'none' },
  },
  {
    id: 'market-times',
    title: 'Market Times',
    description: 'Exchange sessions · open/close',
    component: function MarketTimesWidget(props: WidgetInstanceProps) {
      void props
      return <MarketTimesPanel />
    },
    grid: { x: 0, y: 0, w: 10, h: 12, minW: 8, minH: 10 },
    headerSettings: {
      dataset: false,
      timeRange: false,
      columns: false,
      metric: false,
      aggregation: false,
      interval: false,
      indicators: false,
    },
    stateScope: 'instance',
    data: { kind: 'none' },
  },
  {
    id: 'chart',
    title: 'Chart',
    description: 'Line series',
    component: ChartPanel,
    grid: { x: 12, y: 0, w: 12, h: 10, minW: 9, minH: 7 },
    headerSettings: {
      dataset: true,
      timeRange: true,
      columns: false,
      metric: false,
      aggregation: false,
      interval: false,
      indicators: false,
    },
    stateScope: 'instance',
    data: { kind: 'rest', queries: ['series'] },
  },
  {
    id: 'btc-perpetual-chart',
    title: 'BTC Perp',
    description: 'BTCUSDT perpetual · candles · EMA',
    component: BtcPerpetualChartPanel,
    grid: { x: 0, y: 0, w: 18, h: 14, minW: 12, minH: 10 },
    headerSettings: {
      dataset: false,
      timeRange: false,
      columns: false,
      metric: false,
      aggregation: false,
      interval: true,
      indicators: true,
      tools: true,
    },
    stateScope: 'instance',
    data: {
      kind: 'query-and-stream',
      queries: ['candles'],
      channels: Object.values(BTC_USDM_KLINE_CHANNELS),
    },
  },
  {
    id: 'reports',
    title: 'Reports',
    description: 'Saved queries · export',
    component: ReportsPanel,
    grid: { x: 0, y: 0, w: 18, h: 14, minW: 10, minH: 10 },
    headerSettings: {
      dataset: true,
      timeRange: true,
      columns: false,
      metric: false,
      aggregation: false,
      interval: false,
      indicators: false,
    },
    stateScope: 'instance',
    data: { kind: 'rest', queries: ['preview'] },
  },
  {
    id: 'data-table',
    title: 'Data Table',
    description: 'Dataset preview',
    component: DataTablePanel,
    grid: { x: 6, y: 0, w: 18, h: 12, minW: 9, minH: 7 },
    headerSettings: {
      dataset: true,
      timeRange: true,
      columns: true,
      metric: false,
      aggregation: false,
      interval: false,
      indicators: false,
    },
    stateScope: 'instance',
    data: { kind: 'rest', queries: ['preview'] },
  },
] as const satisfies readonly WidgetDefinition[]

export type WidgetId = (typeof WIDGET_REGISTRY)[number]['id']
