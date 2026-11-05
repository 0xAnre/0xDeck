/**
 * One-time migrations for stored fixed-range volume profile instances.
 *
 * The FRVP default row count changed from 68 to 20. A stored instance whose
 * `rowCount` is exactly the old default can only come from a profile that was
 * never customised, so it is rewritten to the new default when the instance is
 * loaded. Every other stored value (including the new default 20) is left
 * untouched — it can only be a user choice. There is no way to tell "68 by
 * default" apart from "68 by choice", so an explicitly chosen 68 is migrated
 * too; 68 remains selectable in the dialog.
 *
 * Idempotent: after the first load the value is 20, so a second load finds
 * nothing to migrate. Only `rowCount` is read and rewritten; no other field is
 * added, removed or resurrected (the migration never creates a field that was
 * absent).
 *
 * The developing update interval (`developingUpdateBars`) needs no migration:
 * it did not exist before the render-mode work, and absent/invalid values
 * already resolve to the product default (10 bars) through
 * `frvpInstanceDevelopingUpdateBars`.
 */
import {
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  type FixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'

/** The row count every FRVP profile was created with before the 20-row default. */
export const LEGACY_FIXED_RANGE_VP_ROW_COUNT = 68

export function migrateLegacyFixedRangeVolumeProfileRowCount(
  instances: readonly FixedRangeVolumeProfileInstance[],
): FixedRangeVolumeProfileInstance[] {
  return instances.map((instance) =>
    instance.rowCount === LEGACY_FIXED_RANGE_VP_ROW_COUNT
      ? { ...instance, rowCount: DEFAULT_FIXED_RANGE_VP_ROW_COUNT }
      : instance,
  )
}
