import { useState } from 'react'
import { DownloadIcon, FileTextIcon, PlayIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formatCellValue } from '@/lib/formatCellValue'
import { isParquetReady, useWidgetParquetData } from '@/hooks/useParquetData'
import { useParquetWidgetSettings } from '@/hooks/useParquetWidgetSettings'

type ReportStatus = 'ready' | 'running' | 'failed'

type SavedReport = {
  id: string
  name: string
  schedule: string
  dataset: string
  lastRun: string
  rows: string
  status: ReportStatus
  previewRows: { label: string; value: string; change?: string; up?: boolean }[]
}

type RecentRun = {
  id: string
  report: string
  started: string
  duration: string
  rows: string
  status: ReportStatus
}

const savedReports: SavedReport[] = [
  {
    id: 'daily-pnl',
    name: 'Daily PnL Summary',
    schedule: 'Daily · 08:00 UTC',
    dataset: 'market_ticks.parquet',
    lastRun: '2026-07-04 08:00',
    rows: '1,248',
    status: 'ready',
    previewRows: [
      { label: 'Gross PnL', value: '+12,480 USDT', change: '+3.2%', up: true },
      { label: 'Net PnL', value: '+11,902 USDT', change: '+2.9%', up: true },
      { label: 'Fees', value: '578 USDT', change: '+0.4%', up: false },
      { label: 'Win rate', value: '62.4%', change: '+1.1%', up: true },
    ],
  },
  {
    id: 'volume-by-symbol',
    name: 'Volume by Symbol',
    schedule: 'On demand',
    dataset: 'market_ticks.parquet',
    lastRun: '2026-07-03 16:42',
    rows: '6',
    status: 'ready',
    previewRows: [
      { label: 'BTC/USDT', value: '1.24B', change: '+8.1%', up: true },
      { label: 'ETH/USDT', value: '840M', change: '+4.2%', up: true },
      { label: 'SOL/USDT', value: '510M', change: '-1.8%', up: false },
      { label: 'Other', value: '392M', change: '+0.6%', up: true },
    ],
  },
  {
    id: 'tick-quality',
    name: 'Tick Quality Check',
    schedule: 'Hourly',
    dataset: 'market_ticks.parquet',
    lastRun: '2026-07-04 10:00',
    rows: '—',
    status: 'running',
    previewRows: [
      { label: 'Missing ticks', value: '—', change: 'running', up: undefined },
      { label: 'Outliers', value: '—', change: 'running', up: undefined },
      { label: 'Latency p99', value: '—', change: 'running', up: undefined },
    ],
  },
  {
    id: 'weekly-funding',
    name: 'Weekly Funding Report',
    schedule: 'Weekly · Mon',
    dataset: 'funding_rates.parquet',
    lastRun: '2026-06-30 00:05',
    rows: '—',
    status: 'failed',
    previewRows: [
      { label: 'Error', value: 'Dataset not found', change: 'failed', up: false },
    ],
  },
]

const recentRuns: RecentRun[] = [
  {
    id: 'run-1042',
    report: 'Daily PnL Summary',
    started: '2026-07-04 08:00:11',
    duration: '4.2s',
    rows: '1,248',
    status: 'ready',
  },
  {
    id: 'run-1041',
    report: 'Tick Quality Check',
    started: '2026-07-04 09:00:03',
    duration: '12.8s',
    rows: '98,412',
    status: 'ready',
  },
  {
    id: 'run-1040',
    report: 'Volume by Symbol',
    started: '2026-07-03 16:42:55',
    duration: '1.1s',
    rows: '6',
    status: 'ready',
  },
  {
    id: 'run-1039',
    report: 'Weekly Funding Report',
    started: '2026-06-30 00:05:00',
    duration: '0.3s',
    rows: '—',
    status: 'failed',
  },
]

const tableHeadClass = 'h-7 px-2 text-xs font-medium text-muted-foreground'
const tableCellClass = 'px-2 py-1.5 tabular-nums'

function statusBadge(status: ReportStatus) {
  switch (status) {
    case 'ready':
      return <Badge variant="secondary">Ready</Badge>
    case 'running':
      return <Badge>Running</Badge>
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

type ReportsPanelProps = {
  panelId: string
}

export function ReportsPanel({ panelId }: ReportsPanelProps) {
  const [selectedId, setSelectedId] = useState(savedReports[0]?.id ?? '')
  const { state, datasets, selectedName, selectDataset, timeRange, setTimeRange, catalogStatus } =
    useWidgetParquetData(panelId, 'trades')

  useParquetWidgetSettings({
    kind: 'reports',
    panelId,
    title: 'Reports',
    datasets,
    selectedName,
    onDatasetChange: selectDataset,
    timeRange,
    onTimeRangeChange: setTimeRange,
    disabled: catalogStatus !== 'ready',
  })

  const selectedReport =
    savedReports.find((report) => report.id === selectedId) ?? savedReports[0]

  const liveDataset = isParquetReady(state) ? state.dataset : null
  const livePreview = isParquetReady(state) ? state.preview : null

  return (
    <Tabs defaultValue="library" className="flex h-full min-h-0 flex-col gap-2">
      <TabsList variant="line" className="h-8 w-full shrink-0 justify-start">
        <TabsTrigger value="library">Library</TabsTrigger>
        <TabsTrigger value="runs">Recent runs</TabsTrigger>
      </TabsList>

      <TabsContent value="library" className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="min-h-0 flex-1 overflow-auto rounded-md ring-1 ring-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHeadClass}>Report</TableHead>
                <TableHead className={tableHeadClass}>Schedule</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Last run</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Rows</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedReports.map((report) => {
                const isSelected = report.id === selectedReport?.id
                return (
                  <TableRow
                    key={report.id}
                    className={cn(
                      'cursor-pointer',
                      isSelected ? 'bg-muted/50' : 'hover:bg-muted/30',
                    )}
                    onClick={() => setSelectedId(report.id)}
                  >
                    <TableCell className={cn(tableCellClass, 'font-medium')}>
                      {report.name}
                    </TableCell>
                    <TableCell className={cn(tableCellClass, 'text-muted-foreground')}>
                      {report.schedule}
                    </TableCell>
                    <TableCell className={cn(tableCellClass, 'text-right text-muted-foreground')}>
                      {report.lastRun}
                    </TableCell>
                    <TableCell className={cn(tableCellClass, 'text-right')}>{report.rows}</TableCell>
                    <TableCell className={cn(tableCellClass, 'text-right')}>
                      {statusBadge(report.status)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {selectedReport && (
          <Card size="sm" className="shrink-0 gap-0 py-0 ring-border/60">
            <CardHeader className="gap-0 px-2 pb-1 pt-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-xs">{selectedReport.name}</CardTitle>
                  <CardDescription>
                    {liveDataset?.name ?? selectedReport.dataset} · {selectedReport.schedule}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="outline" size="xs" disabled>
                    <PlayIcon data-icon="inline-start" />
                    Run
                  </Button>
                  <Button type="button" variant="outline" size="xs" disabled>
                    <DownloadIcon data-icon="inline-start" />
                    CSV
                  </Button>
                  <Button type="button" variant="outline" size="xs" disabled>
                    <FileTextIcon data-icon="inline-start" />
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {livePreview ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {livePreview.columns.map((column) => (
                        <TableHead key={column} className={tableHeadClass}>
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {livePreview.rows.slice(0, 6).map((row, rowIndex) => (
                      <TableRow key={`${livePreview.name}-${rowIndex}`} className="hover:bg-transparent">
                        {row.map((cell, cellIndex) => (
                          <TableCell
                            key={`${rowIndex}-${cellIndex}`}
                            className={cn(tableCellClass, cellIndex > 0 && 'text-right')}
                          >
                            {formatCellValue(cell, {
                              column: livePreview.columns[cellIndex] ?? '',
                            })}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={tableHeadClass}>Metric</TableHead>
                      <TableHead className={cn(tableHeadClass, 'text-right')}>Value</TableHead>
                      <TableHead className={cn(tableHeadClass, 'text-right')}>Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReport.previewRows.map((row) => (
                      <TableRow key={row.label} className="hover:bg-transparent">
                        <TableCell className={cn(tableCellClass, 'text-muted-foreground')}>
                          {row.label}
                        </TableCell>
                        <TableCell className={cn(tableCellClass, 'text-right font-medium')}>
                          {row.value}
                        </TableCell>
                        <TableCell
                          className={cn(
                            tableCellClass,
                            'text-right',
                            row.up === true && 'text-up',
                            row.up === false && 'text-down',
                            row.up === undefined && 'text-muted-foreground',
                          )}
                        >
                          {row.change ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {livePreview
                  ? `Dataset preview · ${livePreview.name} · Run/export still mock`
                  : 'Mock preview · connect Parquet folder for dataset preview'}
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="runs" className="min-h-0 flex-1 overflow-auto">
        <div className="rounded-md ring-1 ring-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHeadClass}>Report</TableHead>
                <TableHead className={tableHeadClass}>Started</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Duration</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Rows</TableHead>
                <TableHead className={cn(tableHeadClass, 'text-right')}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.map((run) => (
                <TableRow key={run.id} className="hover:bg-muted/30">
                  <TableCell className={cn(tableCellClass, 'font-medium')}>{run.report}</TableCell>
                  <TableCell className={cn(tableCellClass, 'text-muted-foreground')}>
                    {run.started}
                  </TableCell>
                  <TableCell className={cn(tableCellClass, 'text-right')}>{run.duration}</TableCell>
                  <TableCell className={cn(tableCellClass, 'text-right')}>{run.rows}</TableCell>
                  <TableCell className={cn(tableCellClass, 'text-right')}>
                    {statusBadge(run.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  )
}
