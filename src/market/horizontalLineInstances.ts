export type HorizontalLineInstance = {
  id: string
  price: number
}

const INSTANCE_ID_PREFIX = 'hline-'

export function isHorizontalLineInstanceId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(INSTANCE_ID_PREFIX) && value.length > INSTANCE_ID_PREFIX.length
}

export function isValidHorizontalLinePrice(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function createHorizontalLineInstanceId(
  existingIds: ReadonlySet<string> = new Set(),
  randomId: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${INSTANCE_ID_PREFIX}${randomId()}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('Failed to generate a unique horizontal line instance id')
}

export function sanitizeHorizontalLineInstance(value: unknown): HorizontalLineInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isHorizontalLineInstanceId(record.id)) return null
  if (!isValidHorizontalLinePrice(record.price)) return null
  return {
    id: record.id.trim(),
    price: record.price as number,
  }
}

export function sanitizeHorizontalLineInstances(value: unknown): HorizontalLineInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: HorizontalLineInstance[] = []
  for (const item of value) {
    const instance = sanitizeHorizontalLineInstance(item)
    if (!instance || seen.has(instance.id)) continue
    seen.add(instance.id)
    instances.push(instance)
  }
  return instances
}

export function createHorizontalLineInstance(params: {
  price: number
  existingIds?: ReadonlySet<string>
}): HorizontalLineInstance | null {
  if (!isValidHorizontalLinePrice(params.price)) return null
  const existingIds = params.existingIds ?? new Set<string>()
  return {
    id: createHorizontalLineInstanceId(existingIds),
    price: params.price,
  }
}

export function formatHorizontalLineInstanceLabel(price: number): string {
  if (!isValidHorizontalLinePrice(price)) return ''
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })
}
