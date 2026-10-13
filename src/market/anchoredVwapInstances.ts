import {
  formatNumberedChartObjectLabel,
  isValidDisplaySequence,
  migrateChartObjectDisplaySequences,
  nextDisplaySequence,
} from './chartObjectDisplaySequence.ts'
import {
  createDefaultAnchoredVwapDrawingSettings,
  sanitizeAnchoredVwapDrawingSettings,
  type AnchoredVwapDrawingSettings,
} from './anchoredVwapDrawingSettings.ts'
import { isChartObjectHidden, setChartObjectHidden, setChartObjectLocked } from './chartObjectState.ts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export type AnchoredVwapInstance = {
  id: string
  anchorTime: number
  displaySequence: number
  settings: AnchoredVwapDrawingSettings
  locked?: boolean
  hidden?: boolean
}

const INSTANCE_ID_PREFIX = 'avwap-'

export function isAnchoredVwapInstanceId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(INSTANCE_ID_PREFIX) && value.length > INSTANCE_ID_PREFIX.length
}

export function createAnchoredVwapInstanceId(
  existingIds: ReadonlySet<string> = new Set(),
  randomId: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${INSTANCE_ID_PREFIX}${randomId()}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('Failed to generate a unique Anchored VWAP instance id')
}

export function cloneAnchoredVwapInstance(instance: AnchoredVwapInstance): AnchoredVwapInstance {
  return {
    id: instance.id,
    anchorTime: instance.anchorTime,
    displaySequence: instance.displaySequence,
    settings: sanitizeAnchoredVwapDrawingSettings(instance.settings),
    locked: instance.locked,
    hidden: instance.hidden,
  }
}

export function sanitizeAnchoredVwapInstance(value: unknown): AnchoredVwapInstance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isAnchoredVwapInstanceId(record.id)) return null
  const anchorTime = Math.trunc(record.anchorTime as number)
  if (!isValidUnixChartTimeSeconds(anchorTime)) return null
  const instance: AnchoredVwapInstance = {
    id: record.id.trim(),
    anchorTime,
    displaySequence: isValidDisplaySequence(record.displaySequence) ? record.displaySequence : 0,
    settings: sanitizeAnchoredVwapDrawingSettings(record.settings),
  }
  if (record.locked === true) instance.locked = true
  if (record.hidden === true) instance.hidden = true
  return instance
}

export function sanitizeAnchoredVwapInstances(value: unknown): AnchoredVwapInstance[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: AnchoredVwapInstance[] = []
  for (const item of value) {
    const instance = sanitizeAnchoredVwapInstance(item)
    if (!instance || seen.has(instance.id)) continue
    seen.add(instance.id)
    instances.push(instance)
  }
  return migrateChartObjectDisplaySequences(instances)
}

export function createAnchoredVwapInstance(params: {
  anchorTime: number
  existingIds?: ReadonlySet<string>
  siblingInstances?: readonly AnchoredVwapInstance[]
  settings?: AnchoredVwapDrawingSettings
  randomId?: () => string
}): AnchoredVwapInstance | null {
  const anchorTime = Math.trunc(params.anchorTime)
  if (!isValidUnixChartTimeSeconds(anchorTime)) return null
  const existingIds = params.existingIds ?? new Set<string>()
  const siblings = params.siblingInstances ?? []
  return {
    id: createAnchoredVwapInstanceId(existingIds, params.randomId),
    anchorTime,
    displaySequence: nextDisplaySequence(siblings),
    settings: sanitizeAnchoredVwapDrawingSettings(
      params.settings ?? createDefaultAnchoredVwapDrawingSettings(),
    ),
  }
}

export function formatAnchoredVwapInstanceLabel(instance: AnchoredVwapInstance): string {
  return formatNumberedChartObjectLabel('anchored-vwap', instance.displaySequence)
}

export function isAnchoredVwapInstanceHidden(instance: AnchoredVwapInstance): boolean {
  return isChartObjectHidden(instance.hidden)
}

export function isAnchoredVwapInstanceLocked(instance: AnchoredVwapInstance): boolean {
  return instance.locked === true
}

export function setAnchoredVwapInstanceLocked(
  instance: AnchoredVwapInstance,
  locked: boolean,
): AnchoredVwapInstance {
  return setChartObjectLocked(instance, locked)
}

export function setAnchoredVwapInstanceHidden(
  instance: AnchoredVwapInstance,
  hidden: boolean,
): AnchoredVwapInstance {
  return setChartObjectHidden(instance, hidden)
}

export function updateAnchoredVwapInstancesById(
  instances: readonly AnchoredVwapInstance[],
  instanceId: string,
  updater: (instance: AnchoredVwapInstance) => AnchoredVwapInstance,
): AnchoredVwapInstance[] {
  return instances.map((instance) =>
    instance.id === instanceId ? updater(cloneAnchoredVwapInstance(instance)) : cloneAnchoredVwapInstance(instance),
  )
}
