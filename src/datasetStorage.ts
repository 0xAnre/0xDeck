export const WIDGET_DATASET_STORAGE_KEY = '0xdeck-widget-datasets'
export const WORKSPACE_DATA_CONFIG_STORAGE_KEY = '0xdeck-data-config'
export const DATASET_CHANGED_EVENT = 'parquet-dataset-changed'
export const WIDGET_DATA_CHANGED_EVENT = 'widget-data-changed'

export type WorkspaceDataConfig = {
  datasetName: string | null
  columns: string[]
}

export function loadWorkspaceDataConfig(): WorkspaceDataConfig {
  try {
    const raw = localStorage.getItem(WORKSPACE_DATA_CONFIG_STORAGE_KEY)
    if (!raw) return { datasetName: null, columns: [] }
    const parsed = JSON.parse(raw) as Partial<WorkspaceDataConfig>
    return {
      datasetName: typeof parsed.datasetName === 'string' ? parsed.datasetName : null,
      columns: Array.isArray(parsed.columns)
        ? parsed.columns.filter((column): column is string => typeof column === 'string')
        : [],
    }
  } catch {
    return { datasetName: null, columns: [] }
  }
}

export function saveWorkspaceDataConfig(config: WorkspaceDataConfig) {
  localStorage.setItem(WORKSPACE_DATA_CONFIG_STORAGE_KEY, JSON.stringify(config))
  window.dispatchEvent(new CustomEvent(WIDGET_DATA_CHANGED_EVENT))
}

function loadWidgetDatasetMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(WIDGET_DATASET_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

export function loadWidgetDataset(widgetId: string): string | null {
  const value = loadWidgetDatasetMap()[widgetId]
  return value && value.trim().length > 0 ? value : null
}

export function saveWidgetDataset(widgetId: string, datasetName: string | null) {
  const map = loadWidgetDatasetMap()
  if (!datasetName) {
    delete map[widgetId]
  } else {
    map[widgetId] = datasetName
  }
  localStorage.setItem(WIDGET_DATASET_STORAGE_KEY, JSON.stringify(map))
}
