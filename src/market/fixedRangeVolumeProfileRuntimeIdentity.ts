import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'

export function buildFixedRangeVolumeProfileRequestIdentityKey(
  instance: FixedRangeVolumeProfileInstance,
): string {
  return JSON.stringify({
    id: instance.id,
    fromTime: instance.fromTime,
    toTime: instance.toTime,
    selectionInterval: instance.selectionInterval,
    rowCount: instance.rowCount,
    valueAreaPercent: instance.valueAreaPercent,
    enabled: instance.enabled,
  })
}
