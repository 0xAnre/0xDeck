import {
  sanitizeDottedLineInstances,
  type DottedLineInstance,
} from './market/dottedLineInstances.ts'

export const WIDGET_DOTTED_LINE_INSTANCES_STORAGE_KEY = '0xdeck-widget-dotted-line-instances'

function loadWidgetDottedLineInstancesMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_DOTTED_LINE_INSTANCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetDottedLineInstances(panelId: string): DottedLineInstance[] {
  const map = loadWidgetDottedLineInstancesMap()
  if (!Object.hasOwn(map, panelId)) return []
  return sanitizeDottedLineInstances(map[panelId])
}

export function saveWidgetDottedLineInstances(
  panelId: string,
  instances: DottedLineInstance[],
): void {
  const map = loadWidgetDottedLineInstancesMap()
  map[panelId] = sanitizeDottedLineInstances(instances)
  localStorage.setItem(WIDGET_DOTTED_LINE_INSTANCES_STORAGE_KEY, JSON.stringify(map))
}
