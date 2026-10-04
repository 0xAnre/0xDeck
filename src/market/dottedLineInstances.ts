import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export type DottedLineAnchor = {
  time: number
  price: number
}

export type DottedLineInstance = {
  id: string
  fromTime: number
  fromPrice: number
  toTime: number
  toPrice: number
}

const INSTANCE_ID_PREFIX = 'dotted-line-'

export function isDottedLineInstanceId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(INSTANCE_ID_PREFIX) &&
    value.length > INSTANCE_ID_PREFIX.length
  )
}

export function createDottedLineInstanceId(
  existingIds: ReadonlySet<string> = new Set(),
  randomId: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${INSTANCE_ID_PREFIX}${randomId()}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('Failed to generate a unique dotted line instance id')
}

export function isValidChartPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

export function normalizeDottedLineAnchors(
  fromTime: number,
  fromPrice: number,
  toTime: number,
  toPrice: number,
): DottedLineInstance | null {
  if (
    !isValidUnixChartTimeSeconds(Math.trunc(fromTime)) ||
    !isValidUnixChartTimeSeconds(Math.trunc(toTime)) ||
    !isValidChartPrice(fromPrice) ||
    !isValidChartPrice(toPrice)
  ) {
    return null
  }
  const aTime = Math.trunc(fromTime)
  const bTime = Math.trunc(toTime)
  if (aTime === bTime && fromPrice === toPrice) {
    return null
  }
  return {
    id: '',
    fromTime: aTime,
    fromPrice,
    toTime: bTime,
    toPrice,
  }
}

export function createDottedLineInstance(
  from: DottedLineAnchor,
  to: DottedLineAnchor,
  existingIds: ReadonlySet<string>,
): DottedLineInstance | null {
  const normalized = normalizeDottedLineAnchors(from.time, from.price, to.time, to.price)
  if (!normalized) return null
  return {
    ...normalized,
    id: createDottedLineInstanceId(existingIds),
  }
}

export function sanitizeDottedLineInstance(value: unknown): DottedLineInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isDottedLineInstanceId(record.id)) return null
  const fromTime = record.fromTime
  const fromPrice = record.fromPrice
  const toTime = record.toTime
  const toPrice = record.toPrice
  if (
    typeof fromTime !== 'number' ||
    typeof fromPrice !== 'number' ||
    typeof toTime !== 'number' ||
    typeof toPrice !== 'number'
  ) {
    return null
  }
  const normalized = normalizeDottedLineAnchors(fromTime, fromPrice, toTime, toPrice)
  if (!normalized) return null
  return { ...normalized, id: record.id }
}

export function sanitizeDottedLineInstances(value: unknown): DottedLineInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: DottedLineInstance[] = []
  for (const item of value) {
    const sanitized = sanitizeDottedLineInstance(item)
    if (!sanitized || seen.has(sanitized.id)) continue
    seen.add(sanitized.id)
    result.push(sanitized)
  }
  return result
}

export function formatDottedLineInstanceLabel(instance: DottedLineInstance): string {
  const timeSpan = Math.abs(instance.toTime - instance.fromTime)
  const priceDelta = instance.toPrice - instance.fromPrice
  const priceSign = priceDelta >= 0 ? '+' : ''
  return `Line · ${timeSpan}s · ${priceSign}${priceDelta.toFixed(2)}`
}
