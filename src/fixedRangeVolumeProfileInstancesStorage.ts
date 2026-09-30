import {
  sanitizeFixedRangeVolumeProfileInstances,
  type FixedRangeVolumeProfileInstance,
  type SanitizeFixedRangeVolumeProfileOptions,
} from './market/fixedRangeVolumeProfileInstances.ts'

export const WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY =
  '0xdeck-widget-fixed-range-vp-instances'

function loadWidgetFixedRangeVolumeProfileInstancesMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetFixedRangeVolumeProfileInstances(
  panelId: string,
  options: SanitizeFixedRangeVolumeProfileOptions = {},
): FixedRangeVolumeProfileInstance[] {
  const map = loadWidgetFixedRangeVolumeProfileInstancesMap()
  if (!Object.hasOwn(map, panelId)) return []
  return sanitizeFixedRangeVolumeProfileInstances(map[panelId], options)
}

export function saveWidgetFixedRangeVolumeProfileInstances(
  panelId: string,
  instances: FixedRangeVolumeProfileInstance[],
): void {
  const map = loadWidgetFixedRangeVolumeProfileInstancesMap()
  map[panelId] = sanitizeFixedRangeVolumeProfileInstances(instances)
  localStorage.setItem(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY, JSON.stringify(map))
}
