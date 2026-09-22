import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  buildDashboardMetrics,
  buildSymbolRows,
  formatSeriesLabel,
  formatSeriesTick,
} from '@/lib/parquetView'
import { isParquetReady, useWidgetParquetData } from '@/hooks/useParquetData'
import { useParquetWidgetSettings } from '@/hooks/useParquetWidgetSettings'

const mockMetrics = [
  { label: 'Last price', value: '67,840.20', change: '+2.4%', up: true },
  { label: '24h volume', value: '1.24B', change: '+8.1%', up: true },
  { label: '24h high', value: '68,120.00', change: '+0.4%', up: true },
  { label: 'Funding', value: '0.01%', change: '-0.02%', up: false },
] as const

const mockChartData = [
  { x: '11:30', y: 67680 },
  { x: '11:35', y: 67710 },
  { x: '11:40', y: 67650 },
  { x: '11:45', y: 67740 },
  { x: '11:50', y: 67720 },
  { x: '11:55', y: 67800 },
  { x: '12:00', y: 67760 },
  { x: '12:05', y: 67840 },
  { x: '12:10', y: 67810 },
  { x: '12:15', y: 67890 },
]

const mockRows = [
  { key: 'BTC/USDT', symbol: 'BTC/USDT', price: '67,840.20', change: '+2.4%', up: true },
  { key: 'ETH/USDT', symbol: 'ETH/USDT', price: '3,521.44', change: '+1.1%', up: true },
  { key: 'SOL/USDT', symbol: 'SOL/USDT', price: '148.22', change: '-0.8%', up: false },
] as const

const chartConfig = {
  y: {
    label: 'Value',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

const tableHeadClass = 'h-7 px-2 text-xs font-medium text-muted-foreground'
const tableCellClass = 'px-2 py-1.5 tabular-nums'

type DashboardPanelProps = {
  panelId: string
}

export function DashboardPanel({ panelId }: DashboardPanelProps) {
  const { state, datasets, selectedName, selectDataset, timeRange, setTimeRange, catalogStatus } =
    useWidgetParquetData(panelId, 'trades')

  useParquetWidgetSettings({
    kind: 'dashboard',
    panelId,
    title: 'Dashboard',
    datasets,
    selectedName,
    onDatasetChange: selectDataset,
    timeRange,
    onTimeRangeChange: setTimeRange,
    disabled: catalogStatus !== 'ready',
  })

  if (state.status === 'loading') {
    return (
      <div className="flex h-full flex-col gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="min-h-28 flex-1" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const live = isParquetReady(state)
  const metrics = live ? buildDashboardMetrics(state.preview) : [...mockMetrics]
  const chartData = live
    ? state.series.points.map((point) => ({
        x: point.x,
        y: typeof point.y === 'number' ? point.y : Number(point.y),
      }))
    : mockChartData
  const recentRows = live ? buildSymbolRows(state.preview) : [...mockRows]
  const chartTitle = live ? state.series.y_column : 'Price'
  const chartDescription = live
    ? `${state.dataset.name} · ${state.series.x_column}`
    : 'BTC/USDT · mock'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]">
        {metrics.map((metric) => (
          <Card key={metric.label} size="sm" className="py-2 ring-border/60">
            <CardContent className="flex flex-col gap-1 px-2">
              <span className="text-[0.65rem] text-muted-foreground">{metric.label}</span>
              <span className="text-sm font-semibold tabular-nums">{metric.value}</span>
              <Badge
                variant="outline"
                className={cn(
                  'w-fit border-transparent bg-transparent px-0',
                  metric.up ? 'text-up' : 'text-down',
                )}
              >
                {metric.up ? (
                  <TrendingUpIcon data-icon="inline-start" />
                ) : (
                  <TrendingDownIcon data-icon="inline-start" />
                )}
                {metric.change}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card size="sm" className="min-h-0 flex-1 gap-0 py-0 ring-border/60">
        <CardHeader className="gap-0 px-2 pb-1 pt-2">
          <CardTitle className="text-xs">{chartTitle}</CardTitle>
          <CardDescription>{chartDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-28 flex-1 px-2 pb-2">
          <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-28 w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="x"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={formatSeriesTick}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(label) => formatSeriesLabel(label)} />
                }
              />
              <Line
                type="monotone"
                dataKey="y"
                stroke="var(--color-y)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card size="sm" className="shrink-0 gap-0 py-0 ring-border/60">
        <CardHeader className="gap-0 px-2 pb-1 pt-2">
          <CardTitle className="text-xs">Recent symbols</CardTitle>
          <CardDescription>
            {live ? `Preview from ${state.dataset.name}` : 'Mock preview'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHeadClass}>Symbol</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Price</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRows.map((row) => (
                <TableRow key={row.key} className="hover:bg-muted/30">
                  <TableCell className={cn(tableCellClass, 'font-medium')}>{row.symbol}</TableCell>
                  <TableCell className={cn(tableCellClass, 'text-right')}>{row.price}</TableCell>
                  <TableCell
                    className={cn(
                      tableCellClass,
                      'text-right font-medium',
                      row.up ? 'text-up' : 'text-down',
                    )}
                  >
                    {row.change}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
