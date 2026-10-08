import { sanitizeLineInstances, type LineInstance } from './market/lineInstances.ts'

export const WIDGET_LINE_INSTANCES_STORAGE_KEY = '0xdeck-widget-line-instances'

function loadWidgetLineInstancesMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_LINE_INSTANCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetLineInstances(panelId: string): LineInstance[] {
  const map = loadWidgetLineInstancesMap()
  if (!Object.hasOwn(map, panelId)) return []
  return sanitizeLineInstances(map[panelId])
}

export function saveWidgetLineInstances(panelId: string, instances: LineInstance[]): void {
  const map = loadWidgetLineInstancesMap()
  map[panelId] = sanitizeLineInstances(instances)
  localStorage.setItem(WIDGET_LINE_INSTANCES_STORAGE_KEY, JSON.stringify(map))
}
