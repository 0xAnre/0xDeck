import {
  sanitizeHorizontalLineInstances,
  type HorizontalLineInstance,
} from './market/horizontalLineInstances.ts'

export const WIDGET_HORIZONTAL_LINE_INSTANCES_STORAGE_KEY =
  '0xdeck-widget-horizontal-line-instances'

function loadWidgetHorizontalLineInstancesMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_HORIZONTAL_LINE_INSTANCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetHorizontalLineInstances(panelId: string): HorizontalLineInstance[] {
  const map = loadWidgetHorizontalLineInstancesMap()
  if (!Object.hasOwn(map, panelId)) return []
  return sanitizeHorizontalLineInstances(map[panelId])
}

export function saveWidgetHorizontalLineInstances(
  panelId: string,
  instances: HorizontalLineInstance[],
): void {
  const map = loadWidgetHorizontalLineInstancesMap()
  map[panelId] = sanitizeHorizontalLineInstances(instances)
  localStorage.setItem(WIDGET_HORIZONTAL_LINE_INSTANCES_STORAGE_KEY, JSON.stringify(map))
}
