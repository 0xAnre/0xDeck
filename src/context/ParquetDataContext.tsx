import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchDatasetPreview,
  fetchDatasetSeries,
  fetchDatasets,
  fetchHealth,
  pickDataset,
} from '@/api/client'
import type { DatasetPreview, DatasetSeries, DatasetSummary } from '@/api/types'
import { EMPTY_DATASETS } from '@/api/types'
import {
  DATASET_CHANGED_EVENT,
  WIDGET_DATA_CHANGED_EVENT,
  loadWorkspaceDataConfig,
  loadWidgetDataset,
  saveWidgetDataset,
} from '@/datasetStorage'
import {
  loadWidgetTimeRange,
  saveWidgetTimeRange,
  type TimeRange,
} from '@/timeRangeStorage'

export type ParquetDataState =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'no-folder' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      dataset: DatasetSummary
      datasets: DatasetSummary[]
      preview: DatasetPreview
      series: DatasetSeries
    }

type ParquetCatalogState =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'no-folder' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; datasets: DatasetSummary[] }

type ParquetDataContextValue = {
  catalog: ParquetCatalogState
  refreshDatasets: () => void
}

const ParquetDataContext = createContext<ParquetDataContextValue | null>(null)

function useParquetDataLoader(): ParquetDataContextValue {
  const [catalog, setCatalog] = useState<ParquetCatalogState>({ status: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  const refreshDatasets = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  useEffect(() => {
    const handler = () => refreshDatasets()
    window.addEventListener('parquet-settings-changed', handler)
    return () => {
      window.removeEventListener('parquet-settings-changed', handler)
    }
  }, [refreshDatasets])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setCatalog({ status: 'loading' })

      try {
        const health = await fetchHealth()
        if (!health.parquet_folder) {
          if (!cancelled) setCatalog({ status: 'no-folder' })
          return
        }

        const { datasets } = await fetchDatasets()
        if (datasets.length === 0) {
          if (!cancelled) setCatalog({ status: 'empty' })
          return
        }

        if (!cancelled) {
          setCatalog({ status: 'ready', datasets })
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load data'
          if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
            setCatalog({ status: 'offline' })
            return
          }
          if (message.includes('Parquet folder is not configured')) {
            setCatalog({ status: 'no-folder' })
            return
          }
          setCatalog({ status: 'error', message })
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  return useMemo(
    () => ({
      catalog,
      refreshDatasets,
    }),
    [catalog, refreshDatasets],
  )
}

export function ParquetDataProvider({ children }: { children: ReactNode }) {
  const value = useParquetDataLoader()
  return <ParquetDataContext.Provider value={value}>{children}</ParquetDataContext.Provider>
}

export function useParquetData(): ParquetDataContextValue {
  const context = useContext(ParquetDataContext)
  if (!context) {
    throw new Error('useParquetData must be used within ParquetDataProvider')
  }
  return context
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

export type WidgetParquetOptions = {
  fixedTimeRange?: TimeRange
}

export function useWidgetParquetData(
  widgetId: string,
  preferredName?: string,
  options?: WidgetParquetOptions,
) {
  const { catalog } = useParquetData()
  const fixedTimeRange = options?.fixedTimeRange
  const [selectedName, setSelectedName] = useState<string | null>(
    () => loadWidgetDataset(widgetId) ?? loadWorkspaceDataConfig().datasetName,
  )
  const [timeRange, setTimeRangeState] = useState<TimeRange>(
    () => fixedTimeRange ?? loadWidgetTimeRange(widgetId),
  )
  const [state, setState] = useState<ParquetDataState>({ status: 'loading' })

  const selectDataset = useCallback(
    (name: string) => {
      saveWidgetDataset(widgetId, name)
      setSelectedName(name)
      window.dispatchEvent(new CustomEvent(DATASET_CHANGED_EVENT))
      window.dispatchEvent(new CustomEvent(WIDGET_DATA_CHANGED_EVENT))
    },
    [widgetId],
  )

  const setTimeRange = useCallback(
    (range: TimeRange) => {
      saveWidgetTimeRange(widgetId, range)
      setTimeRangeState(range)
      window.dispatchEvent(new CustomEvent(WIDGET_DATA_CHANGED_EVENT))
    },
    [widgetId],
  )

  const effectiveTimeRange = fixedTimeRange ?? timeRange

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

    async function loadDataset() {
      try {
        const [preview, series] = await Promise.all([
          fetchDatasetPreview(selectedDataset.name, 50, effectiveTimeRange),
          fetchDatasetSeries(selectedDataset.name, 120, effectiveTimeRange),
        ])

        if (!cancelled) {
          setState({
            status: 'ready',
            dataset: selectedDataset,
            datasets: readyDatasets,
            preview,
            series,
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load dataset',
          })
        }
      }
    }

    void loadDataset()

    return () => {
      cancelled = true
    }
  }, [catalog, effectiveTimeRange, preferredName, selectedName, widgetId])

  const datasets = catalog.status === 'ready' ? catalog.datasets : EMPTY_DATASETS

  return {
    state,
    datasets,
    selectedName,
    selectDataset,
    timeRange: effectiveTimeRange,
    setTimeRange,
    catalogStatus: catalog.status,
  }
}

export function isParquetReady(
  state: ParquetDataState,
): state is Extract<ParquetDataState, { status: 'ready' }> {
  return state.status === 'ready'
}
