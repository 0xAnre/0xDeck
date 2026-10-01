import { createContext } from 'react'
import type { DatasetSummary } from '@/api/types'
import type { WidgetDataState, WidgetQueryResult } from '@/widgets/data/types'

type ParquetDataReady = {
  dataset: DatasetSummary
  datasets: DatasetSummary[]
  preview: WidgetQueryResult<'preview'>
  series: WidgetQueryResult<'series'>
}

export type ParquetDataState = WidgetDataState<ParquetDataReady>

type ParquetCatalogReady = {
  datasets: DatasetSummary[]
}

export type ParquetCatalogState = WidgetDataState<ParquetCatalogReady>

export type ParquetDataContextValue = {
  catalog: ParquetCatalogState
  refreshDatasets: () => void
}

export const ParquetDataContext = createContext<ParquetDataContextValue | null>(null)
