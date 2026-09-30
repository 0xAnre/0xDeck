import type { MarketCandle } from './types.ts'

export const DEFAULT_FIXED_RANGE_VP_ROW_COUNT = 24
export const DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT = 70

export type FixedRangeVolumeProfileParams = {
  candles: readonly MarketCandle[]
  fromTime: number
  toTime: number
  rowCount?: number
  valueAreaPercent?: number
  tickSize: number
}

export type FixedRangeVolumeProfileRow = {
  priceLow: number
  priceHigh: number
  upVolume: number
  downVolume: number
  totalVolume: number
  inValueArea: boolean
}

export type FixedRangeVolumeProfileResult = {
  fromTime: number
  toTime: number
  candleCount: number
  profileLow: number
  profileHigh: number
  rowHeight: number
  rows: FixedRangeVolumeProfileRow[]
  totalVolume: number
  pocRowIndex: number | null
  pocPrice: number | null
  pocVolume: number | null
  vah: number | null
  val: number | null
  valueAreaVolume: number
  valueAreaPercentAchieved: number
}

export function normalizeFixedRangeVolumeProfileCandles(
  candles: readonly MarketCandle[],
): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>()
  for (const candle of candles) {
    byTime.set(candle.time, candle)
  }
  return [...byTime.entries()]
    .sort(([timeA], [timeB]) => timeA - timeB)
    .map(([, candle]) => candle)
}

function emptyResult(fromTime: number, toTime: number): FixedRangeVolumeProfileResult {
  return {
    fromTime,
    toTime,
    candleCount: 0,
    profileLow: 0,
    profileHigh: 0,
    rowHeight: 0,
    rows: [],
    totalVolume: 0,
    pocRowIndex: null,
    pocPrice: null,
    pocVolume: null,
    vah: null,
    val: null,
    valueAreaVolume: 0,
    valueAreaPercentAchieved: 0,
  }
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function alignPriceLow(price: number, tickSize: number): number {
  return Math.floor(price / tickSize) * tickSize
}

function alignPriceHigh(price: number, tickSize: number): number {
  const ticks = Math.ceil(price / tickSize)
  return ticks * tickSize
}

function buildPriceRows(
  alignedLow: number,
  alignedHigh: number,
  rowHeight: number,
): Array<{ priceLow: number; priceHigh: number }> {
  const span = alignedHigh - alignedLow
  if (span <= 0 || !isFinitePositive(rowHeight)) return []
  const rowCount = Math.max(1, Math.ceil(span / rowHeight))
  const rows: Array<{ priceLow: number; priceHigh: number }> = []
  for (let index = 0; index < rowCount; index += 1) {
    const priceLow = alignedLow + index * rowHeight
    const priceHigh = index === rowCount - 1 ? alignedHigh : priceLow + rowHeight
    rows.push({ priceLow, priceHigh })
  }
  return rows
}

function actualRowCount(alignedLow: number, alignedHigh: number, rowHeight: number): number {
  const span = alignedHigh - alignedLow
  if (span <= 0) return 0
  return Math.max(1, Math.ceil(span / rowHeight))
}

function chooseRowHeightTicks(
  alignedLow: number,
  alignedHigh: number,
  tickSize: number,
  targetRowCount: number,
): number {
  const spanTicks = (alignedHigh - alignedLow) / tickSize
  const floorTicks = Math.max(1, Math.floor(spanTicks / targetRowCount))
  const ceilTicks = Math.max(1, Math.ceil(spanTicks / targetRowCount))
  const candidates = floorTicks === ceilTicks ? [floorTicks] : [floorTicks, ceilTicks]

  let bestTicks = candidates[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const ticks of candidates) {
    const rowHeight = ticks * tickSize
    const rows = actualRowCount(alignedLow, alignedHigh, rowHeight)
    const distance = Math.abs(rows - targetRowCount)
    if (distance < bestDistance) {
      bestDistance = distance
      bestTicks = ticks
      continue
    }
    if (distance === bestDistance && ticks < bestTicks) {
      bestTicks = ticks
    }
  }

  return bestTicks
}

function findRowIndexForPrice(
  rows: readonly FixedRangeVolumeProfileRow[],
  price: number,
): number {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const isLast = index === rows.length - 1
    if (price < row.priceLow) continue
    if (isLast) {
      if (price <= row.priceHigh) return index
      continue
    }
    if (price < row.priceHigh) return index
  }
  return -1
}

function intersectionLength(
  rowLow: number,
  rowHigh: number,
  rowIsLast: boolean,
  candleLow: number,
  candleHigh: number,
): number {
  const overlapStart = Math.max(rowLow, candleLow)
  const overlapEnd = Math.min(rowHigh, candleHigh)
  if (overlapEnd < overlapStart) return 0
  if (!rowIsLast && overlapEnd === rowHigh && candleHigh >= rowHigh && overlapStart < rowHigh) {
    return rowHigh - overlapStart
  }
  return overlapEnd - overlapStart
}

function distributeCandleVolume(
  rows: FixedRangeVolumeProfileRow[],
  candle: MarketCandle,
): void {
  const volume = candle.volume
  if (!Number.isFinite(volume) || volume <= 0) return

  const candleLow = candle.low
  const candleHigh = candle.high
  const isUp = candle.close > candle.open

  if (candleHigh === candleLow) {
    const price = candleLow
    const rowIndex = findRowIndexForPrice(rows, price)
    if (rowIndex < 0) return
    const row = rows[rowIndex]
    if (isUp) row.upVolume += volume
    else row.downVolume += volume
    row.totalVolume += volume
    return
  }

  const candleRange = candleHigh - candleLow
  if (candleRange <= 0) return

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const overlap = intersectionLength(
      row.priceLow,
      row.priceHigh,
      index === rows.length - 1,
      candleLow,
      candleHigh,
    )
    if (overlap <= 0) continue
    const share = (volume * overlap) / candleRange
    if (isUp) row.upVolume += share
    else row.downVolume += share
    row.totalVolume += share
  }
}

function selectPocIndex(rows: readonly FixedRangeVolumeProfileRow[]): number | null {
  if (rows.length === 0) return null
  let bestIndex = 0
  let bestVolume = rows[0].totalVolume
  for (let index = 1; index < rows.length; index += 1) {
    const volume = rows[index].totalVolume
    if (volume > bestVolume) {
      bestVolume = volume
      bestIndex = index
      continue
    }
    if (volume === bestVolume && rows[index].priceLow < rows[bestIndex].priceLow) {
      bestIndex = index
    }
  }
  return bestIndex
}

function expandValueArea(
  rows: FixedRangeVolumeProfileRow[],
  pocIndex: number,
  targetVolume: number,
): number {
  const included = new Set<number>([pocIndex])
  let collected = rows[pocIndex].totalVolume
  let upper = pocIndex + 1
  let lower = pocIndex - 1

  while (collected < targetVolume) {
    const canExpandUp = upper < rows.length
    const canExpandDown = lower >= 0
    if (!canExpandUp && !canExpandDown) break

    const pickUpper = !canExpandDown
      ? true
      : !canExpandUp
        ? false
        : rows[upper].totalVolume >= rows[lower].totalVolume

    if (pickUpper) {
      included.add(upper)
      collected += rows[upper].totalVolume
      upper += 1
    } else {
      included.add(lower)
      collected += rows[lower].totalVolume
      lower -= 1
    }
  }

  for (const index of included) {
    rows[index].inValueArea = true
  }

  return collected
}

export function computeFixedRangeVolumeProfile(
  params: FixedRangeVolumeProfileParams,
): FixedRangeVolumeProfileResult {
  const fromTime = Math.min(params.fromTime, params.toTime)
  const toTime = Math.max(params.fromTime, params.toTime)
  const rowCount = params.rowCount ?? DEFAULT_FIXED_RANGE_VP_ROW_COUNT
  const valueAreaPercent = params.valueAreaPercent ?? DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT
  const tickSize = params.tickSize

  if (
    !isFinitePositive(tickSize) ||
    !Number.isFinite(rowCount) ||
    rowCount < 1 ||
    !Number.isFinite(valueAreaPercent) ||
    valueAreaPercent <= 0
  ) {
    return emptyResult(fromTime, toTime)
  }

  const normalized = normalizeFixedRangeVolumeProfileCandles(params.candles)
  const selected = normalized.filter((candle) => candle.time >= fromTime && candle.time <= toTime)

  if (selected.length === 0) {
    return emptyResult(fromTime, toTime)
  }

  let profileLow = Number.POSITIVE_INFINITY
  let profileHigh = Number.NEGATIVE_INFINITY
  for (const candle of selected) {
    if (!Number.isFinite(candle.low) || !Number.isFinite(candle.high)) {
      return emptyResult(fromTime, toTime)
    }
    profileLow = Math.min(profileLow, candle.low)
    profileHigh = Math.max(profileHigh, candle.high)
  }

  if (profileLow > profileHigh) {
    return emptyResult(fromTime, toTime)
  }

  const alignedLow = alignPriceLow(profileLow, tickSize)
  let alignedHigh = alignPriceHigh(profileHigh, tickSize)
  if (alignedHigh <= alignedLow) {
    alignedHigh = alignedLow + tickSize
  }
  const span = alignedHigh - alignedLow
  if (span <= 0) {
    return emptyResult(fromTime, toTime)
  }

  const rowHeightTicks = chooseRowHeightTicks(alignedLow, alignedHigh, tickSize, rowCount)
  const rowHeight = rowHeightTicks * tickSize
  const priceRows = buildPriceRows(alignedLow, alignedHigh, rowHeight)
  if (priceRows.length === 0) {
    return emptyResult(fromTime, toTime)
  }

  const rows: FixedRangeVolumeProfileRow[] = priceRows.map((row) => ({
    priceLow: row.priceLow,
    priceHigh: row.priceHigh,
    upVolume: 0,
    downVolume: 0,
    totalVolume: 0,
    inValueArea: false,
  }))

  for (const candle of selected) {
    distributeCandleVolume(rows, candle)
  }

  const totalVolume = rows.reduce((sum, row) => sum + row.totalVolume, 0)
  const pocRowIndex = selectPocIndex(rows)

  if (pocRowIndex === null || totalVolume <= 0) {
    return {
      fromTime,
      toTime,
      candleCount: selected.length,
      profileLow,
      profileHigh,
      rowHeight,
      rows,
      totalVolume,
      pocRowIndex: null,
      pocPrice: null,
      pocVolume: null,
      vah: null,
      val: null,
      valueAreaVolume: 0,
      valueAreaPercentAchieved: 0,
    }
  }

  const targetValueAreaVolume = (totalVolume * valueAreaPercent) / 100
  const valueAreaVolume = expandValueArea(rows, pocRowIndex, targetValueAreaVolume)

  const valueAreaRows = rows.filter((row) => row.inValueArea)
  const val = valueAreaRows.length > 0
    ? Math.min(...valueAreaRows.map((row) => row.priceLow))
    : null
  const vah = valueAreaRows.length > 0
    ? Math.max(...valueAreaRows.map((row) => row.priceHigh))
    : null

  const pocRow = rows[pocRowIndex]
  const pocPrice = (pocRow.priceLow + pocRow.priceHigh) / 2

  return {
    fromTime,
    toTime,
    candleCount: selected.length,
    profileLow,
    profileHigh,
    rowHeight,
    rows,
    totalVolume,
    pocRowIndex,
    pocPrice,
    pocVolume: pocRow.totalVolume,
    vah,
    val,
    valueAreaVolume,
    valueAreaPercentAchieved: totalVolume > 0 ? valueAreaVolume / totalVolume : 0,
  }
}
