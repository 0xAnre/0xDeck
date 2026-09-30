import {
  fixedTimePeriodWindowMs,
  formatRollingVwapTimePeriodLabel,
  rollingVwapAutoWindowMs,
} from './rollingVwap.ts'
import {
  createDefaultRollingVwapSettings,
  sanitizeRollingVwapSettings,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import type { CandleInterval } from './types.ts'

export type RollingVwapInstance = {
  id: string
  enabled: boolean
  settings: RollingVwapSettings
}

export const ROLLING_VWAP_LEGACY_MIGRATED_INSTANCE_ID = 'rolling-vwap-legacy'

const INSTANCE_ID_PREFIX = 'rvwap-'

export function isRollingVwapInstanceId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function createRollingVwapInstanceId(
  existingIds: ReadonlySet<string> = new Set(),
  randomId: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${INSTANCE_ID_PREFIX}${randomId()}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('Failed to generate a unique Rolling VWAP instance id')
}

export function cloneRollingVwapInstance(instance: RollingVwapInstance): RollingVwapInstance {
  return {
    id: instance.id,
    enabled: instance.enabled,
    settings: sanitizeRollingVwapSettings(instance.settings),
  }
}

export function sanitizeRollingVwapInstance(value: unknown): RollingVwapInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isRollingVwapInstanceId(record.id)) return null
  const id = record.id.trim()
  return {
    id,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    settings: sanitizeRollingVwapSettings(record.settings),
  }
}

/** Keeps the first valid instance per id; drops invalid entries. */
export function sanitizeRollingVwapInstances(value: unknown): RollingVwapInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: RollingVwapInstance[] = []
  for (const item of value) {
    const instance = sanitizeRollingVwapInstance(item)
    if (!instance || seen.has(instance.id)) continue
    seen.add(instance.id)
    instances.push(instance)
  }
  return instances
}

export function createRollingVwapInstance(params?: {
  id?: string
  enabled?: boolean
  settings?: RollingVwapSettings
  existingIds?: ReadonlySet<string>
  randomId?: () => string
}): RollingVwapInstance {
  const existingIds = params?.existingIds ?? new Set<string>()
  const id =
    params?.id && isRollingVwapInstanceId(params.id)
      ? params.id.trim()
      : createRollingVwapInstanceId(existingIds, params?.randomId)
  if (existingIds.has(id)) {
    throw new Error(`Rolling VWAP instance id already exists: ${id}`)
  }
  return {
    id,
    enabled: params?.enabled ?? true,
    settings: sanitizeRollingVwapSettings(params?.settings ?? createDefaultRollingVwapSettings()),
  }
}

export function findRollingVwapInstance(
  instances: readonly RollingVwapInstance[],
  id: string,
): RollingVwapInstance | undefined {
  const match = instances.find((instance) => instance.id === id)
  return match ? cloneRollingVwapInstance(match) : undefined
}

export function addRollingVwapInstance(
  instances: readonly RollingVwapInstance[],
  instance: RollingVwapInstance,
): RollingVwapInstance[] {
  const sanitized = sanitizeRollingVwapInstance(instance)
  if (!sanitized) return sanitizeRollingVwapInstances(instances)
  if (instances.some((item) => item.id === sanitized.id)) {
    return sanitizeRollingVwapInstances(instances)
  }
  return [...instances.map(cloneRollingVwapInstance), sanitized]
}

export function updateRollingVwapInstance(
  instances: readonly RollingVwapInstance[],
  id: string,
  patch: {
    enabled?: boolean
    settings?: RollingVwapSettings
  },
): RollingVwapInstance[] {
  let changed = false
  const next = instances.map((instance) => {
    if (instance.id !== id) return cloneRollingVwapInstance(instance)
    changed = true
    const updated = sanitizeRollingVwapInstance({
      id: instance.id,
      enabled: patch.enabled ?? instance.enabled,
      settings: patch.settings ?? instance.settings,
    })
    return updated ?? cloneRollingVwapInstance(instance)
  })
  return changed ? next : sanitizeRollingVwapInstances(instances)
}

export function deleteRollingVwapInstance(
  instances: readonly RollingVwapInstance[],
  id: string,
): RollingVwapInstance[] {
  return instances
    .filter((instance) => instance.id !== id)
    .map(cloneRollingVwapInstance)
}

export function setRollingVwapInstanceEnabled(
  instances: readonly RollingVwapInstance[],
  id: string,
  enabled: boolean,
): RollingVwapInstance[] {
  return updateRollingVwapInstance(instances, id, { enabled })
}

export function rollingVwapInstancePeriodLabel(
  instance: RollingVwapInstance,
  interval: CandleInterval,
): string {
  const period = instance.settings.fixedTimePeriod
  const timeInMs = period.useFixedTimePeriod
    ? fixedTimePeriodWindowMs(period)
    : rollingVwapAutoWindowMs(interval)

  if (period.useFixedTimePeriod && timeInMs === 0) {
    return '0min'
  }

  const label = formatRollingVwapTimePeriodLabel(timeInMs).trim()
  return label.length > 0 ? label : '0min'
}
