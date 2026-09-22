import { useCallback, useEffect, useState } from 'react'
import { fetchDatasetKpi, fetchDatasetSchema, pickDataset } from '@/api/client'
import type { DatasetKpi, DatasetSummary } from '@/api/types'
import { EMPTY_COLUMNS, EMPTY_DATASETS } from '@/api/types'
import {
  DATASET_CHANGED_EVENT,
  loadWorkspaceDataConfig,
  loadWidgetDataset,
  saveWidgetDataset,
} from '@/datasetStorage'
import { guessDefaultKpiColumn } from '@/lib/parquetView'
import {
  DEFAULT_KPI_AGGREGATION,
  loadWidgetKpiAggregation,
  loadWidgetKpiColumn,
  saveWidgetKpiAggregation,
  saveWidgetKpiColumn,
  type KpiAggregation,
} from '@/kpiStorage'
import { useParquetData } from '@/hooks/useParquetData'
import {
  loadWidgetTimeRange,
  saveWidgetTimeRange,
  type TimeRange,
} from '@/timeRangeStorage'

export type KpiCardState =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'no-folder' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      dataset: DatasetSummary
      datasets: DatasetSummary[]
      columns: string[]
      kpi: DatasetKpi
    }

function pickWidgetDataset(
  datasets: DatasetSummary[],
  widgetId: string,
  preferredName?: string,
): DatasetSummary | null {
  const saved = loadWidgetDataset(widgetId)
  if (saved) {
    const match = datasets.find((dataset) => dataset.name === saved)
    if (match) return match
  }
  const workspaceDataset = loadWorkspaceDataConfig().datasetName
  if (workspaceDataset) {
    const match = datasets.find((dataset) => dataset.name === workspaceDataset)
    if (match) return match
  }
  if (preferredName) {
    const match = datasets.find((dataset) => dataset.name === preferredName)
    if (match) return match
  }
  return pickDataset(datasets, null)
}

export function useKpiCardData(widgetId: string, preferredName = 'trades') {
  const { catalog } = useParquetData()
  const [selectedName, setSelectedName] = useState<string | null>(
    () => loadWidgetDataset(widgetId) ?? loadWorkspaceDataConfig().datasetName,
  )
  const [metricColumn, setMetricColumn] = useState<string | null>(
    () => loadWidgetKpiColumn(widgetId),
  )
  const [aggregation, setAggregation] = useState<KpiAggregation>(
    () => loadWidgetKpiAggregation(widgetId) ?? DEFAULT_KPI_AGGREGATION,
  )
  const [timeRange, setTimeRangeState] = useState<TimeRange>(
    () => loadWidgetTimeRange(widgetId),
  )
  const [availableColumns, setAvailableColumns] = useState<string[]>(EMPTY_COLUMNS)
  const [state, setState] = useState<KpiCardState>({ status: 'loading' })

  const selectDataset = useCallback(
    (name: string) => {
      saveWidgetDataset(widgetId, name)
      setSelectedName(name)
      window.dispatchEvent(new CustomEvent(DATASET_CHANGED_EVENT))
    },
    [widgetId],
  )

  const setMetric = useCallback(
    (column: string) => {
      setMetricColumn(column)
      saveWidgetKpiColumn(widgetId, column)
    },
    [widgetId],
  )

  const setAggregationChoice = useCallback(
    (next: KpiAggregation) => {
      setAggregation(next)
      saveWidgetKpiAggregation(widgetId, next)
    },
    [widgetId],
  )

  const setTimeRange = useCallback(
    (range: TimeRange) => {
      setTimeRangeState(range)
      saveWidgetTimeRange(widgetId, range)
    },
    [widgetId],
  )

  useEffect(() => {
    if (catalog.status !== 'ready') {
      setState(catalog)
      return
    }

    const dataset =
      catalog.datasets.find((item) => item.name === selectedName) ??
      pickWidgetDataset(catalog.datasets, widgetId, preferredName)

    if (!dataset) {
      setState({ status: 'empty' })
      return
    }

    const selectedDataset = dataset
    const readyDatasets = catalog.datasets

    if (selectedDataset.name !== selectedName) {
      setSelectedName(selectedDataset.name)
      saveWidgetDataset(widgetId, selectedDataset.name)
    }

    let cancelled = false
    setState({ status: 'loading' })

    async function loadKpi() {
      try {
        const schema = await fetchDatasetSchema(selectedDataset.name)
        const columns = schema.schema.map((column) => column.name)
        setAvailableColumns(columns)
        const savedMetric = loadWidgetKpiColumn(widgetId)
        const metric =
          metricColumn && columns.includes(metricColumn)
            ? metricColumn
            : savedMetric && columns.includes(savedMetric)
              ? savedMetric
              : guessDefaultKpiColumn(columns)

        if (!metric) {
          if (!cancelled) {
            setState({
              status: 'error',
              message: 'No metric column available for this dataset',
            })
          }
          return
        }

        if (metric !== metricColumn) {
          setMetricColumn(metric)
        }
        if (metric !== savedMetric) {
          saveWidgetKpiColumn(widgetId, metric)
        }

        const kpi = await fetchDatasetKpi(selectedDataset.name, metric, aggregation, timeRange)

        if (!cancelled) {
          setState({
            status: 'ready',
            dataset: selectedDataset,
            datasets: readyDatasets,
            columns,
            kpi,
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load KPI',
          })
        }
      }
    }

    void loadKpi()

    return () => {
      cancelled = true
    }
  }, [aggregation, catalog, metricColumn, preferredName, selectedName, timeRange, widgetId])

  const datasets = catalog.status === 'ready' ? catalog.datasets : EMPTY_DATASETS

  return {
    state,
    datasets,
    selectedName,
    selectDataset,
    metricColumn,
    setMetric,
    aggregation,
    setAggregation: setAggregationChoice,
    timeRange,
    setTimeRange,
    availableColumns,
    catalogStatus: catalog.status,
  }
}

export function isKpiCardReady(
  state: KpiCardState,
): state is Extract<KpiCardState, { status: 'ready' }> {
  return state.status === 'ready'
}
