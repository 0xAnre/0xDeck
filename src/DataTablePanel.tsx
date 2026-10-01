import { useCallback, useMemo, useState } from 'react'
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
import { WidgetDataStateView } from '@/widgets/components/WidgetDataStateView'
import type { WidgetInstanceProps } from '@/widgets/registry/types'

const tableHeadClass = 'h-7 px-2 text-xs font-medium text-muted-foreground'
const tableCellClass = 'px-2 py-1.5 tabular-nums'

function LoadingTable() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-full" />
      <Skeleton className="h-7 w-full" />
      <Skeleton className="min-h-24 flex-1" />
    </div>
  )
}

export function DataTablePanel({ panelId, headerSettings }: WidgetInstanceProps) {
  const { state, datasets, selectedName, selectDataset, timeRange, setTimeRange, catalogStatus } =
    useWidgetParquetData(panelId, 'trades')
  const readyState = isParquetReady(state) ? state : null

  const columnSyncKey = readyState
    ? `${readyState.dataset.name}\0${readyState.preview.columns.join('\0')}`
    : ''

  const defaultColumns = useMemo(() => {
    if (!readyState) {
      return { available: EMPTY_COLUMNS, selected: EMPTY_COLUMNS }
    }

    const saved = loadWorkspaceDataConfig()
    const validSavedColumns =
      saved.datasetName === readyState.dataset.name
        ? saved.columns.filter((column) => readyState.preview.columns.includes(column))
        : []

    return {
      available: readyState.preview.columns,
      selected: validSavedColumns.length > 0 ? validSavedColumns : readyState.preview.columns,
    }
  }, [readyState])

  const [columnOverride, setColumnOverride] = useState<{
    syncKey: string
    selected: string[]
  } | null>(null)

  const availableColumns = defaultColumns.available
  const selectedColumns =
    columnOverride !== null && columnOverride.syncKey === columnSyncKey
      ? columnOverride.selected
      : defaultColumns.selected

  const handleSelectDataset = useCallback(
    (name: string) => {
      saveWorkspaceDataConfig({ datasetName: name, columns: [] })
      setColumnOverride(null)
      selectDataset(name)
    },
    [selectDataset],
  )

  const handleColumnChange = useCallback(
    (columns: string[]) => {
      setColumnOverride({ syncKey: columnSyncKey, selected: columns })
      saveWorkspaceDataConfig({ datasetName: selectedName, columns })
    },
    [columnSyncKey, selectedName],
  )

  const previewColumns = useMemo(
    () => (readyState ? readyState.preview.columns : EMPTY_COLUMNS),
    [readyState],
  )
  const visibleColumns =
    readyState && selectedColumns.length > 0 ? selectedColumns : previewColumns
  const visibleIndexes = useMemo(
    () => visibleColumns.map((column) => previewColumns.indexOf(column)).filter((index) => index >= 0),
    [previewColumns, visibleColumns],
  )

  useParquetWidgetSettings({
    headerSettings,
    panelId,
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

  if (!isParquetReady(state)) {
    return (
      <WidgetDataStateView
        state={state}
        loadingFallback={<LoadingTable />}
      />
    )
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
