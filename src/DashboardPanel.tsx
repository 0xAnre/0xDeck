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
import { WidgetDataStateView } from '@/widgets/components/WidgetDataStateView'
import type { WidgetInstanceProps } from '@/widgets/registry/types'

const chartConfig = {
  y: {
    label: 'Value',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

const tableHeadClass = 'h-7 px-2 text-xs font-medium text-muted-foreground'
const tableCellClass = 'px-2 py-1.5 tabular-nums'

export function DashboardPanel({ panelId, headerSettings }: WidgetInstanceProps) {
  const { state, datasets, selectedName, selectDataset, timeRange, setTimeRange, catalogStatus } =
    useWidgetParquetData(panelId, 'trades')

  useParquetWidgetSettings({
    headerSettings,
    panelId,
    datasets,
    selectedName,
    onDatasetChange: selectDataset,
    timeRange,
    onTimeRangeChange: setTimeRange,
    disabled: catalogStatus !== 'ready',
  })

  if (!isParquetReady(state)) {
    return (
      <WidgetDataStateView
        state={state}
        loadingFallback={
          <div className="flex h-full flex-col gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="min-h-28 flex-1" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      />
    )
  }

  const metrics = buildDashboardMetrics(state.preview)
  const chartData = state.series.points.map((point) => ({
    x: point.x,
    y: typeof point.y === 'number' ? point.y : Number(point.y),
  }))
  const recentRows = buildSymbolRows(state.preview)
  const chartTitle = state.series.y_column
  const chartDescription = `${state.dataset.name} · ${state.series.x_column}`

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
          <CardDescription>Preview from {state.dataset.name}</CardDescription>
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
