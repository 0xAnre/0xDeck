import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export type RectangleInstance = {
  id: string
  fromTime: number
  toTime: number
  lowPrice: number
  highPrice: number
  locked?: boolean
  fillColor?: string
  fillOpacity?: number
}

const RECTANGLE_HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export const DEFAULT_RECTANGLE_FILL_HEX = '#737373'

export const DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT = 20

export function isRectangleHexColor(value: unknown): value is string {
  return typeof value === 'string' && RECTANGLE_HEX_COLOR_PATTERN.test(value)
}

export function isRectangleFillOpacityPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

export function isRectangleInstanceLocked(instance: RectangleInstance): boolean {
  return instance.locked === true
}

export function isRectangleInstanceTransformable(instance: RectangleInstance): boolean {
  return !isRectangleInstanceLocked(instance)
}

export type NormalizedRectangleBounds = {
  fromTime: number
  toTime: number
  lowPrice: number
  highPrice: number
}

const INSTANCE_ID_PREFIX = 'rect-'

export function isRectangleInstanceId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(INSTANCE_ID_PREFIX) && value.length > INSTANCE_ID_PREFIX.length
}

export function createRectangleInstanceId(
  existingIds: ReadonlySet<string> = new Set(),
  randomId: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${INSTANCE_ID_PREFIX}${randomId()}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('Failed to generate a unique rectangle instance id')
}

export function normalizeRectangleBounds(
  fromTime: number,
  toTime: number,
  lowPrice: number,
  highPrice: number,
): NormalizedRectangleBounds | null {
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || !Number.isFinite(lowPrice) || !Number.isFinite(highPrice)) {
    return null
  }
  const a = Math.trunc(fromTime)
  const b = Math.trunc(toTime)
  if (!isValidUnixChartTimeSeconds(a) || !isValidUnixChartTimeSeconds(b)) return null
  const from = Math.min(a, b)
  const to = Math.max(a, b)
  if (from >= to) return null

  const low = Math.min(lowPrice, highPrice)
  const high = Math.max(lowPrice, highPrice)
  if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) return null

  return { fromTime: from, toTime: to, lowPrice: low, highPrice: high }
}

export function sanitizeRectangleInstance(value: unknown): RectangleInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isRectangleInstanceId(record.id)) return null

  const normalized = normalizeRectangleBounds(
    record.fromTime as number,
    record.toTime as number,
    record.lowPrice as number,
    record.highPrice as number,
  )
  if (!normalized) return null

  const instance: RectangleInstance = {
    id: record.id.trim(),
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
    lowPrice: normalized.lowPrice,
    highPrice: normalized.highPrice,
  }
  if (record.locked === true) {
    instance.locked = true
  }
  if (isRectangleHexColor(record.fillColor)) {
    instance.fillColor = record.fillColor
  }
  if (isRectangleFillOpacityPercent(record.fillOpacity)) {
    instance.fillOpacity = record.fillOpacity
  }
  return instance
}

export function sanitizeRectangleInstances(value: unknown): RectangleInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: RectangleInstance[] = []
  for (const item of value) {
    const instance = sanitizeRectangleInstance(item)
    if (!instance || seen.has(instance.id)) continue
    seen.add(instance.id)
    instances.push(instance)
  }
  return instances
}

export function createRectangleInstance(params: {
  fromTime: number
  toTime: number
  lowPrice: number
  highPrice: number
  existingIds?: ReadonlySet<string>
}): RectangleInstance | null {
  const normalized = normalizeRectangleBounds(
    params.fromTime,
    params.toTime,
    params.lowPrice,
    params.highPrice,
  )
  if (!normalized) return null

  return {
    id: createRectangleInstanceId(params.existingIds ?? new Set()),
    ...normalized,
  }
}

export function formatRectangleInstanceLabel(instance: RectangleInstance): string {
  return `${instance.fromTime}–${instance.toTime} @ ${instance.lowPrice.toFixed(2)}–${instance.highPrice.toFixed(2)}`
}

export function updateRectangleInstanceBounds(
  instance: RectangleInstance,
  bounds: NormalizedRectangleBounds,
): RectangleInstance {
  return { ...instance, ...bounds }
}

export function updateRectangleInstancesById(
  instances: readonly RectangleInstance[],
  instanceId: string,
  updater: (instance: RectangleInstance) => RectangleInstance,
): RectangleInstance[] {
  return instances.map((item) => (item.id === instanceId ? updater(item) : item))
}

export function setRectangleInstanceLocked(
  instance: RectangleInstance,
  locked: boolean,
): RectangleInstance {
  if (!locked) {
    const next = { ...instance }
    delete next.locked
    return next
  }
  return { ...instance, locked: true }
}

export function setRectangleInstanceFillColor(
  instance: RectangleInstance,
  fillColor: string,
): RectangleInstance {
  if (!isRectangleHexColor(fillColor)) return instance
  return { ...instance, fillColor }
}

export function setRectangleInstanceFillOpacity(
  instance: RectangleInstance,
  fillOpacity: number,
): RectangleInstance {
  if (!isRectangleFillOpacityPercent(fillOpacity)) return instance
  if (fillOpacity === DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT) {
    const next = { ...instance }
    delete next.fillOpacity
    return next
  }
  return { ...instance, fillOpacity }
}

export function rectangleInstanceFillOpacityPercent(instance: RectangleInstance): number {
  return instance.fillOpacity ?? DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT
}

export function rectangleInstanceFillColorHex(instance: RectangleInstance): string {
  return instance.fillColor ?? DEFAULT_RECTANGLE_FILL_HEX
}
