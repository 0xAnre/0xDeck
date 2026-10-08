import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export type LineInstance = {
  id: string
  timeA: number
  priceA: number
  timeB: number
  priceB: number
}

export type NormalizedLineEndpoints = {
  timeA: number
  priceA: number
  timeB: number
  priceB: number
}

const INSTANCE_ID_PREFIX = 'line-'

export function isLineInstanceId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(INSTANCE_ID_PREFIX) && value.length > INSTANCE_ID_PREFIX.length
}

export function isValidChartPrice(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export function createLineInstanceId(
  existingIds: ReadonlySet<string> = new Set(),
  randomId: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${INSTANCE_ID_PREFIX}${randomId()}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('Failed to generate a unique line instance id')
}

export function normalizeLineEndpoints(
  timeA: number,
  priceA: number,
  timeB: number,
  priceB: number,
): NormalizedLineEndpoints | null {
  if (
    !Number.isFinite(timeA) ||
    !Number.isFinite(timeB) ||
    !isValidChartPrice(priceA) ||
    !isValidChartPrice(priceB)
  ) {
    return null
  }
  const aTime = Math.trunc(timeA)
  const bTime = Math.trunc(timeB)
  if (!isValidUnixChartTimeSeconds(aTime) || !isValidUnixChartTimeSeconds(bTime)) return null
  if (aTime === bTime && priceA === priceB) return null

  return {
    timeA: aTime,
    priceA,
    timeB: bTime,
    priceB,
  }
}

export function sanitizeLineInstance(value: unknown): LineInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isLineInstanceId(record.id)) return null

  const normalized = normalizeLineEndpoints(
    record.timeA as number,
    record.priceA as number,
    record.timeB as number,
    record.priceB as number,
  )
  if (!normalized) return null

  return {
    id: record.id.trim(),
    ...normalized,
  }
}

export function sanitizeLineInstances(value: unknown): LineInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: LineInstance[] = []
  for (const item of value) {
    const instance = sanitizeLineInstance(item)
    if (!instance || seen.has(instance.id)) continue
    seen.add(instance.id)
    instances.push(instance)
  }
  return instances
}

export function createLineInstance(params: {
  timeA: number
  priceA: number
  timeB: number
  priceB: number
  existingIds?: ReadonlySet<string>
}): LineInstance | null {
  const normalized = normalizeLineEndpoints(
    params.timeA,
    params.priceA,
    params.timeB,
    params.priceB,
  )
  if (!normalized) return null

  return {
    id: createLineInstanceId(params.existingIds ?? new Set()),
    ...normalized,
  }
}

export function formatLineInstanceLabel(instance: LineInstance): string {
  return `${instance.timeA}–${instance.timeB} @ ${instance.priceA.toFixed(2)}→${instance.priceB.toFixed(2)}`
}

export function updateLineInstanceEndpoints(
  instance: LineInstance,
  endpoints: NormalizedLineEndpoints,
): LineInstance {
  return { ...instance, ...endpoints }
}
