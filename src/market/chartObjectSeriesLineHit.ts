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

  const segmentCount = data.length - 1
  if (segmentCount <= 0) return false

  const visibleLogicalRange = timeScale.getVisibleLogicalRange()
  let startIndex = 0
  let endIndex = segmentCount - 1
  if (visibleLogicalRange) {
    startIndex = Math.max(0, Math.floor(visibleLogicalRange.from) - 1)
    endIndex = Math.min(segmentCount - 1, Math.ceil(visibleLogicalRange.to) + 1)
  }

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
