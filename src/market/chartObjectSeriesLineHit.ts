import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'

const DEFAULT_HIT_RADIUS_PX = 6

function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}

function hitBodySegment(
  paneX: number,
  paneY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radiusSq: number,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return distanceSq(paneX, paneY, x1, y1) <= radiusSq
  }
  const t = Math.max(0, Math.min(1, ((paneX - x1) * dx + (paneY - y1) * dy) / lengthSq))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return distanceSq(paneX, paneY, projX, projY) <= radiusSq
}

function resolveFullSeriesLogicalSegmentEnd(series: ISeriesApi<'Line', Time>): number {
  let endLogicalIndex = -1
  while (series.dataByIndex(endLogicalIndex + 2) !== null) {
    endLogicalIndex += 1
  }
  return endLogicalIndex
}

const MAX_LOGICAL_INDEX_PROBE = 1_000_000

function seriesHasLineSegments(series: ISeriesApi<'Line', Time>): boolean {
  let logicalIndex = 0
  while (series.dataByIndex(logicalIndex) === null) {
    logicalIndex += 1
    if (logicalIndex > MAX_LOGICAL_INDEX_PROBE) {
      return false
    }
  }
  return series.dataByIndex(logicalIndex + 1) !== null
}

/** Logical segment start indices (inclusive) to scan for hits; includes one segment outside each visible edge. */
export function resolveVisibleLineSegmentIndexBounds(
  chart: IChartApi,
  series: ISeriesApi<'Line', Time>,
): { startIndex: number; endIndex: number } {
  if (!seriesHasLineSegments(series)) {
    return { startIndex: 0, endIndex: -1 }
  }

  const logicalRange = chart.timeScale().getVisibleLogicalRange()
  if (!logicalRange) {
    const endIndex = resolveFullSeriesLogicalSegmentEnd(series)
    return { startIndex: 0, endIndex }
  }

  const barsInfo = series.barsInLogicalRange(logicalRange)
  if (barsInfo === null) {
    return { startIndex: 0, endIndex: -1 }
  }

  const visibleFromLogical = Math.ceil(logicalRange.from)
  const visibleToLogical = Math.floor(logicalRange.to)
  const startIndex = visibleFromLogical - 1
  const endIndex = visibleToLogical + 1
  if (endIndex < startIndex) {
    return { startIndex: 0, endIndex: -1 }
  }

  return { startIndex, endIndex }
}

export function hitTestLineSeriesAtPane(
  chart: IChartApi,
  series: ISeriesApi<'Line', Time>,
  paneX: number,
  paneY: number,
  hitRadiusPx: number = DEFAULT_HIT_RADIUS_PX,
): boolean {
  if (!series.options().visible) return false

  const timeScale = chart.timeScale()
  const radiusSq = hitRadiusPx * hitRadiusPx
  const { startIndex, endIndex } = resolveVisibleLineSegmentIndexBounds(chart, series)
  if (endIndex < startIndex) return false

  for (let logicalIndex = startIndex; logicalIndex <= endIndex; logicalIndex += 1) {
    const a = series.dataByIndex(logicalIndex)
    const b = series.dataByIndex(logicalIndex + 1)
    if (a === null || b === null) continue
    if (!('value' in a) || !('value' in b)) continue
    if (a.value === undefined || b.value === undefined) continue
    const ax = timeScale.timeToCoordinate(a.time)
    const bx = timeScale.timeToCoordinate(b.time)
    if (ax === null || bx === null) continue
    const ay = series.priceToCoordinate(a.value)
    const by = series.priceToCoordinate(b.value)
    if (ay === null || by === null) continue
    if (hitBodySegment(paneX, paneY, ax, ay, bx, by, radiusSq)) {
      return true
    }
  }

  return false
}
