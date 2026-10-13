export type NumberedChartObjectKind =
  | 'box'
  | 'line'
  | 'frvp'
  | 'rolling-vwap'
  | 'anchored-vwap'

export const NUMBERED_CHART_OBJECT_LABELS: Record<NumberedChartObjectKind, string> = {
  box: 'Box',
  line: 'Line',
  frvp: 'Volume Profile',
  'rolling-vwap': 'Rolling VWAP',
  'anchored-vwap': 'Anchored VWAP',
}

export type WithDisplaySequence = {
  displaySequence?: number
}

export function isValidDisplaySequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

export function nextDisplaySequence(instances: readonly WithDisplaySequence[]): number {
  let max = 0
  for (const instance of instances) {
    if (isValidDisplaySequence(instance.displaySequence)) {
      max = Math.max(max, instance.displaySequence)
    }
  }
  return max + 1
}

/** Assigns stable display numbers for legacy rows missing `displaySequence`. */
export function migrateChartObjectDisplaySequences<T extends WithDisplaySequence>(
  instances: readonly T[],
): T[] {
  const reserved = new Set<number>()
  const result: T[] = []
  let max = 0

  for (const instance of instances) {
    const sequence = instance.displaySequence
    if (isValidDisplaySequence(sequence) && !reserved.has(sequence)) {
      reserved.add(sequence)
      max = Math.max(max, sequence)
      result.push({ ...instance, displaySequence: sequence })
      continue
    }
    let next = max + 1
    while (reserved.has(next)) {
      next += 1
    }
    reserved.add(next)
    max = Math.max(max, next)
    result.push({ ...instance, displaySequence: next })
  }

  return result
}

export function formatNumberedChartObjectLabel(
  kind: NumberedChartObjectKind,
  displaySequence: number,
): string {
  return `${NUMBERED_CHART_OBJECT_LABELS[kind]} ${displaySequence}`
}
