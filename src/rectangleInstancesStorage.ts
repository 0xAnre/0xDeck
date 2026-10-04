import {
  sanitizeRectangleInstances,
  type RectangleInstance,
} from './market/rectangleInstances.ts'

export const WIDGET_RECTANGLE_INSTANCES_STORAGE_KEY = '0xdeck-widget-rectangle-instances'

function loadWidgetRectangleInstancesMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_RECTANGLE_INSTANCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetRectangleInstances(panelId: string): RectangleInstance[] {
  const map = loadWidgetRectangleInstancesMap()
  if (!Object.hasOwn(map, panelId)) return []
  return sanitizeRectangleInstances(map[panelId])
}

export function saveWidgetRectangleInstances(
  panelId: string,
  instances: RectangleInstance[],
): void {
  const map = loadWidgetRectangleInstancesMap()
  map[panelId] = sanitizeRectangleInstances(instances)
  localStorage.setItem(WIDGET_RECTANGLE_INSTANCES_STORAGE_KEY, JSON.stringify(map))
}
