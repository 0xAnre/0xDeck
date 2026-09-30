import {
  sanitizeRollingVwapInstances,
  type RollingVwapInstance,
} from './market/rollingVwapInstances.ts'

export const WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY = '0xdeck-widget-rolling-vwap-instances'

function loadWidgetRollingVwapInstancesMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function hasWidgetRollingVwapInstancesEntry(panelId: string): boolean {
  const map = loadWidgetRollingVwapInstancesMap()
  return Object.hasOwn(map, panelId)
}

export function loadWidgetRollingVwapInstances(panelId: string): RollingVwapInstance[] {
  const map = loadWidgetRollingVwapInstancesMap()
  if (!Object.hasOwn(map, panelId)) return []
  return sanitizeRollingVwapInstances(map[panelId])
}

export function saveWidgetRollingVwapInstances(
  panelId: string,
  instances: RollingVwapInstance[],
): void {
  const map = loadWidgetRollingVwapInstancesMap()
  map[panelId] = sanitizeRollingVwapInstances(instances)
  localStorage.setItem(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY, JSON.stringify(map))
}
