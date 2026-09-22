import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCellValue, getCellTitle } from '@/lib/formatCellValue'
import { loadWorkspaceDataConfig, saveWorkspaceDataConfig } from '@/datasetStorage'
import { useParquetWidgetSettings } from '@/hooks/useParquetWidgetSettings'
import { isParquetReady, useWidgetParquetData } from '@/hooks/useParquetData'
import { EMPTY_COLUMNS } from '@/api/types'

const tableHeadClass = 'h-7 px-2 text-xs font-medium text-muted-foreground'
const tableCellClass = 'px-2 py-1.5 tabular-nums'

const MOCK_ROWS = [
  ['2026-07-04 12:00:00', 'BTC/USDT', '67840.20', '1.24M', '+2.4%'],
  ['2026-07-04 12:01:00', 'ETH/USDT', '3521.44', '840K', '+1.1%'],
  ['2026-07-04 12:02:00', 'SOL/USDT', '148.22', '510K', '-0.8%'],
] as const

const MOCK_COLUMNS = ['Timestamp', 'Symbol', 'Price', 'Volume', 'Change'] as const

function MockDataTable() {
  return (
    <Table>
      <TableCaption className="sr-only">Mock preview rows</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {MOCK_COLUMNS.map((column) => (
            <TableHead key={column} className={tableHeadClass}>
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {MOCK_ROWS.map((row) => (
          <TableRow key={row.join('-')} className="hover:bg-muted/30">
            {row.map((cell, index) => (
              <TableCell
                key={`${row[0]}-${index}`}
                className={cn(tableCellClass, index > 1 && 'text-right')}
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={MOCK_COLUMNS.length} className="py-2 text-xs text-muted-foreground">
            Mock data · set folder in Data source
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

function LoadingTable() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-full" />
      <Skeleton className="h-7 w-full" />
      <Skeleton className="min-h-24 flex-1" />
    </div>
  )
}

type DataTablePanelProps = {
  panelId: string
}

export function DataTablePanel({ panelId }: DataTablePanelProps) {
  const { state, datasets, selectedName, selectDataset, timeRange, setTimeRange, catalogStatus } =
    useWidgetParquetData(panelId, 'trades')
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => loadWorkspaceDataConfig().columns)
  const [availableColumns, setAvailableColumns] = useState<string[]>(EMPTY_COLUMNS)

  useEffect(() => {
    if (!isParquetReady(state)) return

    const saved = loadWorkspaceDataConfig()
    const validSavedColumns =
      saved.datasetName === state.dataset.name
        ? saved.columns.filter((column) => state.preview.columns.includes(column))
        : []

    setAvailableColumns(state.preview.columns)
    setSelectedColumns(validSavedColumns.length > 0 ? validSavedColumns : state.preview.columns)
  }, [state])

  const handleSelectDataset = useCallback(
    (name: string) => {
      saveWorkspaceDataConfig({ datasetName: name, columns: [] })
      setSelectedColumns([])
      selectDataset(name)
    },
    [selectDataset],
  )

  const handleColumnChange = useCallback(
    (columns: string[]) => {
      setSelectedColumns(columns)
      saveWorkspaceDataConfig({ datasetName: selectedName, columns })
    },
    [selectedName],
  )

  const ready = isParquetReady(state)
  const previewColumns = ready ? state.preview.columns : []
  const visibleColumns =
    ready && selectedColumns.length > 0 ? selectedColumns : previewColumns
  const visibleIndexes = useMemo(
    () => visibleColumns.map((column) => previewColumns.indexOf(column)).filter((index) => index >= 0),
    [previewColumns, visibleColumns],
  )

  useParquetWidgetSettings({
    kind: 'data-table',
    panelId,
    title: 'Data Table',
    datasets,
    selectedName,
    onDatasetChange: handleSelectDataset,
    timeRange,
    onTimeRangeChange: setTimeRange,
    disabled: catalogStatus !== 'ready',
    availableColumns,
    selectedColumns,
    onColumnsChange: handleColumnChange,
  })

  if (state.status === 'loading') {
    return <LoadingTable />
  }
  if (state.status === 'error') {
    return <p className="text-xs text-destructive">{state.message}</p>
  }
  if (!isParquetReady(state)) {
    return <MockDataTable />
  }

  const { preview, dataset } = state

  return (
    <Table>
      <TableCaption className="sr-only">Preview rows from {dataset.name}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {visibleColumns.map((column) => (
            <TableHead key={column} className={tableHeadClass}>
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {preview.rows.map((row, rowIndex) => (
          <TableRow key={`${dataset.name}-${rowIndex}`} className="hover:bg-muted/30">
            {visibleIndexes.map((cellIndex, columnIndex) => {
              const column = visibleColumns[columnIndex] ?? ''
              const cellValue = row[cellIndex]
              const title = getCellTitle(cellValue, { column })

              return (
                <TableCell
                  key={`${rowIndex}-${cellIndex}`}
                  title={title}
                  className={cn(tableCellClass, columnIndex > 0 && 'text-right')}
                >
                  {formatCellValue(cellValue, { column })}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={visibleColumns.length} className="py-2 text-xs text-muted-foreground">
            {preview.rows.length} preview rows · {dataset.name}
            {dataset.row_count > 0
              ? ` · ${dataset.row_count.toLocaleString()} total`
              : ` · ${dataset.file_count.toLocaleString()} files`}
            {` · columns: ${visibleColumns.join(', ')}`}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
