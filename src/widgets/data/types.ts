import type {
  DatasetKpi,
  DatasetPreview,
  DatasetSchema,
  DatasetSeries,
} from '@/api/types'

export type WidgetDataQuerySource = 'preview' | 'series' | 'schema' | 'kpi'

export type WidgetQueryResultMap = {
  preview: DatasetPreview
  series: DatasetSeries
  schema: DatasetSchema
  kpi: DatasetKpi
}

export type WidgetQueryResult<TSource extends WidgetDataQuerySource> =
  WidgetQueryResultMap[TSource]

export type WidgetDataNotReadyState =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'no-folder' }
  | { status: 'empty' }
  | { status: 'error'; message: string }

export type WidgetDataState<TReady> =
  | WidgetDataNotReadyState
  | ({ status: 'ready' } & TReady)

export function isWidgetDataReady<TReady>(
  state: WidgetDataState<TReady>,
): state is { status: 'ready' } & TReady {
  return state.status === 'ready'
}
