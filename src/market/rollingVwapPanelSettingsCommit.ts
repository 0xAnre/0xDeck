import {
  sanitizeRollingVwapSettings,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'

/** Sync panel ref before async React state; optional explicit settings win on reapply. */
export function commitRollingVwapPanelSettings(
  ref: { current: RollingVwapSettings },
  incoming: RollingVwapSettings,
): RollingVwapSettings {
  const next = sanitizeRollingVwapSettings(incoming)
  ref.current = next
  return next
}

export function resolveRollingVwapReapplySettings(
  explicit: RollingVwapSettings | undefined,
  ref: { current: RollingVwapSettings },
): RollingVwapSettings {
  return explicit ?? ref.current
}
