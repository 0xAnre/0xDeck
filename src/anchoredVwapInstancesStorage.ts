import {
  sanitizeAnchoredVwapInstances,
  type AnchoredVwapInstance,
} from './market/anchoredVwapInstances.ts'

export const WIDGET_ANCHORED_VWAP_INSTANCES_STORAGE_KEY = '0xdeck-widget-anchored-vwap-instances'

function loadWidgetAnchoredVwapInstancesMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_ANCHORED_VWAP_INSTANCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetAnchoredVwapInstances(panelId: string): AnchoredVwapInstance[] {
  const map = loadWidgetAnchoredVwapInstancesMap()
  if (!Object.hasOwn(map, panelId)) return []
  return sanitizeAnchoredVwapInstances(map[panelId])
}

export function saveWidgetAnchoredVwapInstances(
  panelId: string,
  instances: AnchoredVwapInstance[],
): void {
  const map = loadWidgetAnchoredVwapInstancesMap()
  map[panelId] = sanitizeAnchoredVwapInstances(instances)
  localStorage.setItem(WIDGET_ANCHORED_VWAP_INSTANCES_STORAGE_KEY, JSON.stringify(map))
}
