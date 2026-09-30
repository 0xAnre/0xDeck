export const DEFAULT_FIXED_RANGE_VP_ROW_COUNT = 24
export const DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT = 70

export type FixedRangeVolumeProfileInstance = {
  id: string
  fromTime: number
  toTime: number
  rowCount: number
  valueAreaPercent: number
  enabled: boolean
}

const INSTANCE_ID_PREFIX = 'frvp-'

export function isFixedRangeVolumeProfileInstanceId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(INSTANCE_ID_PREFIX) && value.length > INSTANCE_ID_PREFIX.length
}

export function createFixedRangeVolumeProfileInstanceId(
  existingIds: ReadonlySet<string> = new Set(),
  randomId: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${INSTANCE_ID_PREFIX}${randomId()}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('Failed to generate a unique Fixed Range Volume Profile instance id')
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || (value as number) < 1) {
    return fallback
  }
  return value as number
}

function sanitizeValueAreaPercent(value: unknown): number {
  if (!Number.isFinite(value)) return DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT
  const n = value as number
  if (n < 0 || n > 100) return DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT
  return n
}

export function isValidUnixChartTimeSeconds(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0
}

export function normalizeFixedRangeVolumeProfileTimes(
  fromTime: number,
  toTime: number,
): { fromTime: number; toTime: number } | null {
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null
  const a = Math.trunc(fromTime)
  const b = Math.trunc(toTime)
  if (!isValidUnixChartTimeSeconds(a) || !isValidUnixChartTimeSeconds(b)) return null
  const from = Math.min(a, b)
  const to = Math.max(a, b)
  if (from >= to) return null
  return { fromTime: from, toTime: to }
}

export function sanitizeFixedRangeVolumeProfileInstance(
  value: unknown,
): FixedRangeVolumeProfileInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isFixedRangeVolumeProfileInstanceId(record.id)) return null

  const normalized = normalizeFixedRangeVolumeProfileTimes(
    record.fromTime as number,
    record.toTime as number,
  )
  if (!normalized) return null

  return {
    id: record.id.trim(),
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
    rowCount: sanitizePositiveInt(record.rowCount, DEFAULT_FIXED_RANGE_VP_ROW_COUNT),
    valueAreaPercent: sanitizeValueAreaPercent(record.valueAreaPercent),
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
  }
}

export function sanitizeFixedRangeVolumeProfileInstances(
  value: unknown,
): FixedRangeVolumeProfileInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: FixedRangeVolumeProfileInstance[] = []
  for (const item of value) {
    const instance = sanitizeFixedRangeVolumeProfileInstance(item)
    if (!instance || seen.has(instance.id)) continue
    seen.add(instance.id)
    instances.push(instance)
  }
  return instances
}

export function createFixedRangeVolumeProfileInstance(params: {
  fromTime: number
  toTime: number
  existingIds?: ReadonlySet<string>
  rowCount?: number
  valueAreaPercent?: number
  enabled?: boolean
}): FixedRangeVolumeProfileInstance | null {
  const normalized = normalizeFixedRangeVolumeProfileTimes(params.fromTime, params.toTime)
  if (!normalized) return null
  const existingIds = params.existingIds ?? new Set<string>()
  return {
    id: createFixedRangeVolumeProfileInstanceId(existingIds),
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
    rowCount: params.rowCount ?? DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
    valueAreaPercent: params.valueAreaPercent ?? DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
    enabled: params.enabled ?? true,
  }
}

export function formatFixedRangeVolumeProfileInstanceLabel(
  fromTime: number,
  toTime: number,
): string {
  const format = (epochSeconds: number) => {
    const date = new Date(epochSeconds * 1000)
    return date.toISOString().slice(0, 16).replace('T', ' ')
  }
  return `${format(fromTime)} → ${format(toTime)}`
}
