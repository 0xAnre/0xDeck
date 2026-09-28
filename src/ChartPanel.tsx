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
import { WidgetDataStateView } from '@/widgets/components/WidgetDataStateView'
import type { WidgetInstanceProps } from '@/widgets/registry/types'

const chartConfig = {
  y: {
    label: 'Value',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export function ChartPanel({ panelId, headerSettings }: WidgetInstanceProps) {
  const { state, datasets, selectedName, selectDataset, timeRange, setTimeRange, catalogStatus } =
    useWidgetParquetData(panelId, 'prediction_price')

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
        loadingFallback={<Skeleton className="min-h-32 flex-1" />}
      />
    )
  }

  const chartData = state.series.points.map((point: { x: string | number; y: string | number }) => ({
    x: point.x,
    y: typeof point.y === 'number' ? point.y : Number(point.y),
  }))

  const yLabel = state.series.y_column

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
