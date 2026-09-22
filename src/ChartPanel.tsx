import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { useParquetWidgetSettings } from '@/hooks/useParquetWidgetSettings'
import { isParquetReady, useWidgetParquetData } from '@/hooks/useParquetData'
import { formatSeriesLabel, formatSeriesTick } from '@/lib/parquetView'

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

const chartConfig = {
  y: {
    label: 'Value',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

type ChartPanelProps = {
  panelId: string
}

export function ChartPanel({ panelId }: ChartPanelProps) {
  const { state, datasets, selectedName, selectDataset, timeRange, setTimeRange, catalogStatus } =
    useWidgetParquetData(panelId, 'prediction_price')

  useParquetWidgetSettings({
    kind: 'chart',
    panelId,
    title: 'Chart',
    datasets,
    selectedName,
    onDatasetChange: selectDataset,
    timeRange,
    onTimeRangeChange: setTimeRange,
    disabled: catalogStatus !== 'ready',
  })

  if (state.status === 'loading') {
    return <Skeleton className="min-h-32 flex-1" />
  }

  const live = isParquetReady(state)
  const chartData = live
    ? state.series.points.map((point: { x: string | number; y: string | number }) => ({
        x: point.x,
        y: typeof point.y === 'number' ? point.y : Number(point.y),
      }))
    : mockChartData

  const yLabel = live ? state.series.y_column : 'price'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartContainer config={chartConfig} className="aspect-auto min-h-32 flex-1">
        <LineChart
          accessibilityLayer
          data={chartData}
          margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
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
          <YAxis
            domain={['auto', 'auto']}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={52}
            tickFormatter={(value) =>
              Math.abs(value) >= 1000 ? `${Math.round(Number(value) / 1000)}k` : String(value)
            }
          />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(label) => formatSeriesLabel(label)} />}
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke="var(--color-y)"
            strokeWidth={2}
            dot={false}
            name={yLabel}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
