import { isCandleInterval } from './candleIntervalDuration.ts'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from './lineChartStroke.ts'
import {
  formatNumberedChartObjectLabel,
  isValidDisplaySequence,
  migrateChartObjectDisplaySequences,
  nextDisplaySequence,
} from './chartObjectDisplaySequence.ts'
import { setChartObjectLocked } from './chartObjectState.ts'
import { sanitizeFrvpInstanceLevelLineStyles } from './frvpInstanceLineStyles.ts'
import { DEFAULT_CANDLE_INTERVAL, type CandleInterval } from './types.ts'

export const DEFAULT_FIXED_RANGE_VP_ROW_COUNT = 24
export const MAX_FIXED_RANGE_VP_ROW_COUNT = 500
export const DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT = 70

export type FixedRangeVolumeProfileInstance = {
  id: string
  fromTime: number
  toTime: number
  selectionInterval: CandleInterval
  rowCount: number
  valueAreaPercent: number
  enabled: boolean
  displaySequence: number
  /**
   * TradingView-style "Extend Right": keep `fromTime`/`toTime` as the drawing
   * coordinates but calculate the profile from `fromTime` to the latest
   * available candle. Sanitizes to `false` for legacy/invalid records.
   */
  extendRight?: boolean
  locked?: boolean
  pocStrokeColor?: string
  pocLineWidth?: LineChartStrokeWidth
  pocLineStyle?: LineChartStrokeStyle
  pocStrokeOpacityPercent?: number
  vahStrokeColor?: string
  vahLineWidth?: LineChartStrokeWidth
  vahLineStyle?: LineChartStrokeStyle
  vahStrokeOpacityPercent?: number
  valStrokeColor?: string
  valLineWidth?: LineChartStrokeWidth
  valLineStyle?: LineChartStrokeStyle
  valStrokeOpacityPercent?: number
}

export type SanitizeFixedRangeVolumeProfileOptions = {
  selectionIntervalFallback?: CandleInterval
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

function sanitizeRowCount(value: unknown, fallback: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || (value as number) < 1) {
    return fallback
  }
  return Math.min(value as number, MAX_FIXED_RANGE_VP_ROW_COUNT)
}

export function clampFixedRangeVolumeProfileRowCount(rowCount: number): number {
  if (!Number.isFinite(rowCount) || !Number.isInteger(rowCount) || rowCount < 1) {
    return DEFAULT_FIXED_RANGE_VP_ROW_COUNT
  }
  return Math.min(rowCount, MAX_FIXED_RANGE_VP_ROW_COUNT)
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

function resolveSelectionInterval(
  value: unknown,
  fallback?: CandleInterval,
): CandleInterval {
  if (isCandleInterval(value)) return value
  if (fallback && isCandleInterval(fallback)) return fallback
  return DEFAULT_CANDLE_INTERVAL
}

export function sanitizeFixedRangeVolumeProfileInstance(
  value: unknown,
  options: SanitizeFixedRangeVolumeProfileOptions = {},
): FixedRangeVolumeProfileInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isFixedRangeVolumeProfileInstanceId(record.id)) return null

  const normalized = normalizeFixedRangeVolumeProfileTimes(
    record.fromTime as number,
    record.toTime as number,
  )
  if (!normalized) return null

  const selectionInterval = resolveSelectionInterval(
    record.selectionInterval,
    options.selectionIntervalFallback,
  )

  const instance: FixedRangeVolumeProfileInstance = {
    id: record.id.trim(),
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
    selectionInterval,
    rowCount: sanitizeRowCount(record.rowCount, DEFAULT_FIXED_RANGE_VP_ROW_COUNT),
    valueAreaPercent: sanitizeValueAreaPercent(record.valueAreaPercent),
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    displaySequence: isValidDisplaySequence(record.displaySequence) ? record.displaySequence : 0,
    extendRight: record.extendRight === true,
  }
  if (record.locked === true) {
    instance.locked = true
  }
  return sanitizeFrvpInstanceLevelLineStyles(record, instance)
}

export function sanitizeFixedRangeVolumeProfileInstances(
  value: unknown,
  options: SanitizeFixedRangeVolumeProfileOptions = {},
): FixedRangeVolumeProfileInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: FixedRangeVolumeProfileInstance[] = []
  for (const item of value) {
    const instance = sanitizeFixedRangeVolumeProfileInstance(item, options)
    if (!instance || seen.has(instance.id)) continue
    seen.add(instance.id)
    instances.push(instance)
  }
  return migrateChartObjectDisplaySequences(instances)
}

export function createFixedRangeVolumeProfileInstance(params: {
  fromTime: number
  toTime: number
  selectionInterval: CandleInterval
  existingIds?: ReadonlySet<string>
  siblingInstances?: readonly FixedRangeVolumeProfileInstance[]
  rowCount?: number
  valueAreaPercent?: number
  enabled?: boolean
  extendRight?: boolean
}): FixedRangeVolumeProfileInstance | null {
  const normalized = normalizeFixedRangeVolumeProfileTimes(params.fromTime, params.toTime)
  if (!normalized) return null
  if (!isCandleInterval(params.selectionInterval)) return null
  const existingIds = params.existingIds ?? new Set<string>()
  const siblings = params.siblingInstances ?? []
  return {
    id: createFixedRangeVolumeProfileInstanceId(existingIds),
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
    selectionInterval: params.selectionInterval,
    rowCount: sanitizeRowCount(params.rowCount, DEFAULT_FIXED_RANGE_VP_ROW_COUNT),
    valueAreaPercent: params.valueAreaPercent ?? DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
    enabled: params.enabled ?? true,
    displaySequence: nextDisplaySequence(siblings),
    extendRight: params.extendRight === true,
  }
}

export function formatFixedRangeVolumeProfileInstanceLabel(
  instance: FixedRangeVolumeProfileInstance,
): string {
  return formatNumberedChartObjectLabel('frvp', instance.displaySequence)
}

export function isFixedRangeVolumeProfileInstanceHidden(
  instance: FixedRangeVolumeProfileInstance,
): boolean {
  return !instance.enabled
}

export function setFixedRangeVolumeProfileInstanceEnabled(
  instance: FixedRangeVolumeProfileInstance,
  enabled: boolean,
): FixedRangeVolumeProfileInstance {
  return { ...instance, enabled }
}

export function setFixedRangeVolumeProfileInstanceExtendRight(
  instance: FixedRangeVolumeProfileInstance,
  extendRight: boolean,
): FixedRangeVolumeProfileInstance {
  return { ...instance, extendRight }
}

export function setFixedRangeVolumeProfileInstanceLocked(
  instance: FixedRangeVolumeProfileInstance,
  locked: boolean,
): FixedRangeVolumeProfileInstance {
  return setChartObjectLocked(instance, locked)
}

export function updateFixedRangeVolumeProfileInstancesById(
  instances: readonly FixedRangeVolumeProfileInstance[],
  instanceId: string,
  updater: (instance: FixedRangeVolumeProfileInstance) => FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileInstance[] {
  return instances.map((item) => (item.id === instanceId ? updater(item) : item))
}
