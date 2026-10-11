import {
  formatNumberedChartObjectLabel,
  isValidDisplaySequence,
  migrateChartObjectDisplaySequences,
  nextDisplaySequence,
} from './chartObjectDisplaySequence.ts'
import { setChartObjectLocked } from './chartObjectState.ts'
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
  displaySequence: number
  locked?: boolean
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
    displaySequence: instance.displaySequence,
    locked: instance.locked,
  }
}

export function sanitizeRollingVwapInstance(value: unknown): RollingVwapInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isRollingVwapInstanceId(record.id)) return null
  const id = record.id.trim()
  const instance: RollingVwapInstance = {
    id,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    settings: sanitizeRollingVwapSettings(record.settings),
    displaySequence: isValidDisplaySequence(record.displaySequence) ? record.displaySequence : 0,
  }
  if (record.locked === true) {
    instance.locked = true
  }
  return instance
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
  return migrateChartObjectDisplaySequences(instances)
}

export function createRollingVwapInstance(params?: {
  id?: string
  enabled?: boolean
  settings?: RollingVwapSettings
  existingIds?: ReadonlySet<string>
  siblingInstances?: readonly RollingVwapInstance[]
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
  const siblings = params?.siblingInstances ?? []
  return {
    id,
    enabled: params?.enabled ?? true,
    settings: sanitizeRollingVwapSettings(params?.settings ?? createDefaultRollingVwapSettings()),
    displaySequence: nextDisplaySequence(siblings),
  }
}

export function rollingVwapInstanceDisplayLabel(instance: RollingVwapInstance): string {
  return formatNumberedChartObjectLabel('rolling-vwap', instance.displaySequence)
}

export function setRollingVwapInstanceLocked(
  instance: RollingVwapInstance,
  locked: boolean,
): RollingVwapInstance {
  return setChartObjectLocked(instance, locked)
}

export function assignRollingVwapDisplaySequenceOnCreate(
  instance: RollingVwapInstance,
  siblings: readonly RollingVwapInstance[],
): RollingVwapInstance {
  return { ...instance, displaySequence: nextDisplaySequence(siblings) }
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
    locked?: boolean
  },
): RollingVwapInstance[] {
  let changed = false
  const next = instances.map((instance) => {
    if (instance.id !== id) return cloneRollingVwapInstance(instance)
    changed = true
    const locked = patch.locked ?? instance.locked
    const updated = sanitizeRollingVwapInstance({
      id: instance.id,
      enabled: patch.enabled ?? instance.enabled,
      settings: patch.settings ?? instance.settings,
      displaySequence: instance.displaySequence,
      locked,
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
