import type {
  BackendHealth,
  BackendSettings,
  DatasetKpi,
  DatasetRegistryItem,
  DatasetPreview,
  DatasetSchema,
  DatasetSeries,
  DatasetSummary,
  KpiAggregation,
} from './types'
import type { TimeRange } from '@/timeRangeStorage'

const API_BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    ...init,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
  }

  return response.json() as Promise<T>
}

export async function fetchHealth(): Promise<BackendHealth> {
  return request<BackendHealth>('/health')
}

export async function fetchSettings(): Promise<BackendSettings> {
  return request<BackendSettings>('/settings')
}

export async function saveSettings(parquetFolder: string): Promise<BackendSettings> {
  return request<BackendSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify({ parquet_folder: parquetFolder }),
  })
}

export async function fetchDatasets(): Promise<{ datasets: DatasetSummary[] }> {
  return request<{ datasets: DatasetSummary[] }>('/datasets')
}

export async function fetchRegistry(): Promise<{ registry: DatasetRegistryItem[] }> {
  return request<{ registry: DatasetRegistryItem[] }>('/registry')
}

export async function fetchDatasetPreview(
  name: string,
  limit = 50,
  range: TimeRange = 'all',
): Promise<DatasetPreview> {
  const params = new URLSearchParams({
    limit: String(limit),
    range,
  })
  return request<DatasetPreview>(`/datasets/${encodeURIComponent(name)}/preview?${params}`)
}

export async function fetchDatasetSeries(
  name: string,
  limit = 120,
  range: TimeRange = 'all',
): Promise<DatasetSeries> {
  const params = new URLSearchParams({
    limit: String(limit),
    range,
  })
  return request<DatasetSeries>(`/datasets/${encodeURIComponent(name)}/series?${params}`)
}

export async function fetchDatasetSchema(name: string): Promise<DatasetSchema> {
  return request<DatasetSchema>(`/datasets/${encodeURIComponent(name)}/schema`)
}

export async function fetchDatasetKpi(
  name: string,
  metric: string,
  agg: KpiAggregation = 'last',
  range: TimeRange = '1h',
): Promise<DatasetKpi> {
  const params = new URLSearchParams({
    metric,
    agg,
    range,
  })
  return request<DatasetKpi>(`/datasets/${encodeURIComponent(name)}/kpi?${params}`)
}

export function pickDataset(
  datasets: DatasetSummary[],
  preferredName: string | null,
): DatasetSummary | null {
  if (datasets.length === 0) return null
  if (preferredName) {
    const match = datasets.find((dataset) => dataset.name === preferredName)
    if (match) return match
  }
  const trades = datasets.find((dataset) => dataset.name === 'trades')
  if (trades) return trades
  const marketTicks = datasets.find((dataset) => dataset.name === 'market_ticks.parquet')
  return marketTicks ?? datasets[0] ?? null
}
