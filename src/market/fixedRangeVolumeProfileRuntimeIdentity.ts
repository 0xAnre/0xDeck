import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'
import { resolveFixedRangeVolumeProfileEffectiveToTime } from './fixedRangeVolumeProfileRequestBounds.ts'
import type {
  FixedRangeVolumeProfileRuntimeSnapshot,
  FixedRangeVolumeProfileRuntimeState,
} from './fixedRangeVolumeProfileRuntimeTypes.ts'

export type FixedRangeVolumeProfileIdentityTimes = {
  fromTime: number
  toTime: number
}

export type FixedRangeVolumeProfileReadyRuntime = {
  profile: Extract<FixedRangeVolumeProfileRuntimeState, { status: 'ready' }>['profile']
}

export function buildFixedRangeVolumeProfileRequestIdentityKey(
  instance: FixedRangeVolumeProfileInstance,
  identityTimes: FixedRangeVolumeProfileIdentityTimes | null = null,
): string {
  const extendRight = instance.extendRight === true
  return JSON.stringify({
    id: instance.id,
    fromTime: identityTimes?.fromTime ?? instance.fromTime,
    // With Extend Right the calculation ignores the drawing's raw `toTime` in
    // favour of the effective right boundary, so the coordinate must not take
    // part in the rendered/request identity: moving the right endpoint without
    // moving the effective bound must neither refetch nor blank the ready
    // profile. The effective bound is tracked separately by
    // `buildFixedRangeVolumeProfileRequestKey`, which appends it for Extend
    // Right instances.
    toTime: extendRight ? null : (identityTimes?.toTime ?? instance.toTime),
    selectionInterval: instance.selectionInterval,
    rowCount: instance.rowCount,
    valueAreaPercent: instance.valueAreaPercent,
    enabled: instance.enabled,
    extendRight,
  })
}

/**
 * Request identity used by the runtime controller to decide whether a fetch is
 * still current. It extends the rendered identity with the effective right
 * boundary so a live candle advancing past `toTime` starts exactly one new
 * request, while the stored/render identity stays the selection identity (the
 * previous profile keeps rendering until the extended one arrives, avoiding a
 * per-candle flicker).
 */
export function buildFixedRangeVolumeProfileRequestKey(
  instance: FixedRangeVolumeProfileInstance,
  liveRightEdge: number | null,
  identityTimes: FixedRangeVolumeProfileIdentityTimes | null = null,
): string {
  const identityKey = buildFixedRangeVolumeProfileRequestIdentityKey(instance, identityTimes)
  if (instance.extendRight !== true) return identityKey
  const effectiveToTime = resolveFixedRangeVolumeProfileEffectiveToTime(
    { toTime: identityTimes?.toTime ?? instance.toTime, extendRight: true },
    liveRightEdge,
  )
  return `${identityKey}:${effectiveToTime}`
}

/**
 * Selection identity times a display instance should be validated against.
 *
 * While a resize drag is in progress the display instance carries live preview
 * bounds, but the only profile that can be rendered is the one loaded for the
 * committed (pre-drag) range. Returning the draft's initial times lets the
 * shared identity predicate keep that intentional preview; returning `null`
 * falls back to the instance's own committed bounds.
 */
export function resolveFixedRangeVolumeProfileDisplayIdentityTimes(
  instance: FixedRangeVolumeProfileInstance,
  interaction: FixedRangeVolumeProfileInteractionState,
): FixedRangeVolumeProfileIdentityTimes | null {
  if (
    interaction.phase === 'resizing' &&
    interaction.draft?.kind === 'resize' &&
    interaction.draft.instanceId === instance.id
  ) {
    return {
      fromTime: interaction.draft.initialFromTime,
      toTime: interaction.draft.initialToTime,
    }
  }
  return null
}

/**
 * Shared FRVP identity predicate.
 *
 * A runtime state is current only when its `identityKey` was produced for the
 * same selection identity that `instance` represents. `identityTimes` lets a
 * live resize preview compare a display instance whose bounds are preview
 * bounds against the profile loaded for the committed (pre-drag) range, so the
 * existing preview keeps rendering. After the drag commits, callers pass no
 * override, the new committed bounds no longer match the old `identityKey` and
 * the obsolete profile is suppressed until a profile for the new identity
 * arrives.
 */
export function isFixedRangeVolumeProfileRuntimeStateCurrent(
  state: FixedRangeVolumeProfileRuntimeState,
  instance: FixedRangeVolumeProfileInstance,
  identityTimes: FixedRangeVolumeProfileIdentityTimes | null = null,
): boolean {
  return (
    state.identityKey === buildFixedRangeVolumeProfileRequestIdentityKey(instance, identityTimes)
  )
}

/**
 * Ready-only runtime map shared by FRVP rendering and hit-testing. Applies the
 * shared identity predicate so a profile loaded for a different selection
 * identity is never paired with the current (or preview) bounds.
 */
export function buildFixedRangeVolumeProfileReadyRuntime(
  instances: readonly FixedRangeVolumeProfileInstance[],
  runtime: FixedRangeVolumeProfileRuntimeSnapshot,
  resolveIdentityTimes: (
    instance: FixedRangeVolumeProfileInstance,
  ) => FixedRangeVolumeProfileIdentityTimes | null = () => null,
): Map<string, FixedRangeVolumeProfileReadyRuntime> {
  const ready = new Map<string, FixedRangeVolumeProfileReadyRuntime>()
  for (const instance of instances) {
    const state = runtime[instance.id]
    if (!state || state.status !== 'ready') continue
    if (
      !isFixedRangeVolumeProfileRuntimeStateCurrent(
        state,
        instance,
        resolveIdentityTimes(instance),
      )
    ) {
      continue
    }
    ready.set(instance.id, { profile: state.profile })
  }
  return ready
}
