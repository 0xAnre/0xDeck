export type DatasetSummary = {
  name: string
  kind: 'file' | 'stream'
  file_count: number
  row_count: number
}

export const EMPTY_DATASETS: DatasetSummary[] = []
export const EMPTY_COLUMNS: string[] = []

export type DatasetSchemaColumn = {
  name: string
  type: string
}

export type DatasetPreview = {
  name: string
  columns: string[]
  rows: unknown[][]
}

export type DatasetSeriesPoint = {
  x: string | number
  y: string | number
}

export type DatasetSeries = {
  name: string
  x_column: string
  y_column: string
  points: DatasetSeriesPoint[]
}

export type KpiAggregation =
  | 'last'
  | 'avg'
  | 'sum'
  | 'min'
  | 'max'
  | 'count'
  | 'change'

export type DatasetKpi = {
  name: string
  metric_column: string
  aggregation: KpiAggregation
  range: string
  value: string | number | null
  row_count: number
  as_of: string | number | null
}

export type DatasetSchema = {
  name: string
  schema: DatasetSchemaColumn[]
}

export type DatasetRegistryItem = DatasetSummary & {
  schema: DatasetSchemaColumn[]
  preview: DatasetPreview
  suggested: {
    x_column: string
    y_column: string
    symbol_column: string
    time_column: string
    price_column: string
  }
}

export type BackendSettings = {
  parquet_folder: string
  folder_ready: boolean
}

export type BackendHealth = {
  status: string
  parquet_folder: string
}
