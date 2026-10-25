import {
  formatNumberedChartObjectLabel,
  isValidDisplaySequence,
  migrateChartObjectDisplaySequences,
  nextDisplaySequence,
} from './chartObjectDisplaySequence.ts'
import {
  DEFAULT_LINE_CHART_STROKE_STYLE,
  DEFAULT_LINE_CHART_STROKE_WIDTH,
  isLineChartHexColor,
  isLineChartStrokeWidth,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './lineChartStroke.ts'
import { isChartObjectHidden, setChartObjectHidden, setChartObjectLocked } from './chartObjectState.ts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'
import { MARKET_STYLE_DEFAULTS, isMarketStyleOpacityPercent } from './marketStylePalette.ts'

export type LineInstance = {
  id: string
  timeA: number
  priceA: number
  timeB: number
  priceB: number
  displaySequence: number
  locked?: boolean
  hidden?: boolean
  strokeColor?: string
  strokeOpacity?: number
  lineWidth?: LineChartStrokeWidth
  lineStyle?: LineChartStrokeStyle
}

export const DEFAULT_LINE_STROKE_OPACITY_PERCENT = MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent

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

  const instance: LineInstance = {
    id: record.id.trim(),
    displaySequence: isValidDisplaySequence(record.displaySequence) ? record.displaySequence : 0,
    ...normalized,
  }
  if (record.locked === true) {
    instance.locked = true
  }
  if (record.hidden === true) {
    instance.hidden = true
  }
  if (isLineChartHexColor(record.strokeColor)) {
    instance.strokeColor = record.strokeColor
  }
  if (isMarketStyleOpacityPercent(record.strokeOpacity)) {
    instance.strokeOpacity = record.strokeOpacity
  }
  if (isLineChartStrokeWidth(record.lineWidth)) {
    instance.lineWidth = record.lineWidth
  }
  const lineStyle = sanitizeLineChartStrokeStyle(record.lineStyle)
  if (lineStyle !== undefined) {
    instance.lineStyle = lineStyle
  }
  return instance
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
  return migrateChartObjectDisplaySequences(instances)
}

export function createLineInstance(params: {
  timeA: number
  priceA: number
  timeB: number
  priceB: number
  existingIds?: ReadonlySet<string>
  siblingInstances?: readonly LineInstance[]
}): LineInstance | null {
  const normalized = normalizeLineEndpoints(
    params.timeA,
    params.priceA,
    params.timeB,
    params.priceB,
  )
  if (!normalized) return null

  const siblings = params.siblingInstances ?? []
  return {
    id: createLineInstanceId(params.existingIds ?? new Set()),
    displaySequence: nextDisplaySequence(siblings),
    ...normalized,
  }
}

export function isLineInstanceLocked(instance: LineInstance): boolean {
  return instance.locked === true
}

export function isLineInstanceTransformable(instance: LineInstance): boolean {
  return !isLineInstanceLocked(instance)
}

export function isLineInstanceHidden(instance: LineInstance): boolean {
  return isChartObjectHidden(instance.hidden)
}

export function setLineInstanceHidden(instance: LineInstance, hidden: boolean): LineInstance {
  return setChartObjectHidden(instance, hidden)
}

export function setLineInstanceLocked(instance: LineInstance, locked: boolean): LineInstance {
  return setChartObjectLocked(instance, locked)
}

export function lineInstanceStrokeWidth(instance: LineInstance): LineChartStrokeWidth {
  return instance.lineWidth ?? DEFAULT_LINE_CHART_STROKE_WIDTH
}

export function lineInstanceStrokeStyle(instance: LineInstance): LineChartStrokeStyle {
  return sanitizeLineChartStrokeStyle(instance.lineStyle) ?? DEFAULT_LINE_CHART_STROKE_STYLE
}

export function lineInstanceStrokeOpacityPercent(instance: {
  strokeOpacity?: number
}): number {
  return isMarketStyleOpacityPercent(instance.strokeOpacity)
    ? instance.strokeOpacity
    : DEFAULT_LINE_STROKE_OPACITY_PERCENT
}

export function formatLineInstanceLabel(instance: LineInstance): string {
  return formatNumberedChartObjectLabel('line', instance.displaySequence)
}

export function updateLineInstancesById(
  instances: readonly LineInstance[],
  instanceId: string,
  updater: (instance: LineInstance) => LineInstance,
): LineInstance[] {
  return instances.map((item) => (item.id === instanceId ? updater(item) : item))
}

export function setLineInstanceStrokeColor(instance: LineInstance, strokeColor: string): LineInstance {
  if (!isLineChartHexColor(strokeColor)) return instance
  return { ...instance, strokeColor }
}

export function setLineInstanceStrokeOpacity(
  instance: LineInstance,
  strokeOpacity: number,
): LineInstance {
  if (!isMarketStyleOpacityPercent(strokeOpacity)) return instance
  if (strokeOpacity === DEFAULT_LINE_STROKE_OPACITY_PERCENT) {
    const next = { ...instance }
    delete next.strokeOpacity
    return next
  }
  return { ...instance, strokeOpacity }
}

export function setLineInstanceStrokeWidth(
  instance: LineInstance,
  lineWidth: LineChartStrokeWidth,
): LineInstance {
  if (!isLineChartStrokeWidth(lineWidth)) return instance
  if (lineWidth === DEFAULT_LINE_CHART_STROKE_WIDTH) {
    const next = { ...instance }
    delete next.lineWidth
    return next
  }
  return { ...instance, lineWidth }
}

export function setLineInstanceStrokeStyle(
  instance: LineInstance,
  lineStyle: LineChartStrokeStyle,
): LineInstance {
  if (sanitizeLineChartStrokeStyle(lineStyle) !== lineStyle) return instance
  if (lineStyle === DEFAULT_LINE_CHART_STROKE_STYLE) {
    const next = { ...instance }
    delete next.lineStyle
    return next
  }
  return { ...instance, lineStyle }
}

export function updateLineInstanceEndpoints(
  instance: LineInstance,
  endpoints: NormalizedLineEndpoints,
): LineInstance {
  return { ...instance, ...endpoints }
}
