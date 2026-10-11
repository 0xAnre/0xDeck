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

function resolveVisibleDataIndexBounds(
  logicalRange: { from: number; to: number },
  barsBefore: number,
  dataLength: number,
): { firstVisibleIndex: number; lastVisibleIndex: number } | null {
  const firstLogicalOnSeries = logicalRange.from - barsBefore
  const firstVisibleIndex = Math.ceil(logicalRange.from) - firstLogicalOnSeries
  const lastVisibleIndex = Math.floor(logicalRange.to) - firstLogicalOnSeries
  if (
    firstVisibleIndex < 0 ||
    lastVisibleIndex < 0 ||
    firstVisibleIndex >= dataLength ||
    lastVisibleIndex < firstVisibleIndex
  ) {
    return null
  }
  return {
    firstVisibleIndex,
    lastVisibleIndex: Math.min(lastVisibleIndex, dataLength - 1),
  }
}

/** Segment indices (inclusive) to scan for hits; includes one segment outside each visible edge. */
export function resolveVisibleLineSegmentIndexBounds(
  chart: IChartApi,
  series: ISeriesApi<'Line', Time>,
  dataLength: number,
): { startIndex: number; endIndex: number } {
  const maxSegmentIndex = dataLength - 2
  if (maxSegmentIndex < 0) {
    return { startIndex: 0, endIndex: -1 }
  }

  const logicalRange = chart.timeScale().getVisibleLogicalRange()
  if (!logicalRange) {
    return { startIndex: 0, endIndex: maxSegmentIndex }
  }

  const barsInfo = series.barsInLogicalRange(logicalRange)
  if (barsInfo === null) {
    return { startIndex: 0, endIndex: -1 }
  }

  const visibleBounds = resolveVisibleDataIndexBounds(
    logicalRange,
    barsInfo.barsBefore,
    dataLength,
  )
  if (visibleBounds === null) {
    return { startIndex: 0, endIndex: -1 }
  }
  const { firstVisibleIndex, lastVisibleIndex } = visibleBounds

  const startIndex = Math.max(0, firstVisibleIndex - 1)
  const endIndex = Math.min(maxSegmentIndex, lastVisibleIndex + 1)
  if (startIndex > endIndex) {
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
  const data = series.data()
  if (data.length < 2) return false

  const timeScale = chart.timeScale()
  const radiusSq = hitRadiusPx * hitRadiusPx
  const { startIndex, endIndex } = resolveVisibleLineSegmentIndexBounds(chart, series, data.length)
  if (endIndex < startIndex) return false

  for (let index = startIndex; index <= endIndex; index += 1) {
    const a = data[index]
    const b = data[index + 1]
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
