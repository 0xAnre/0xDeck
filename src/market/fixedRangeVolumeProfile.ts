export type FixedRangeVolumeProfileCandle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Default histogram rows for a newly created profile. The single source of
 * truth: `fixedRangeVolumeProfileInstances.ts` re-exports it.
 */
export const DEFAULT_FIXED_RANGE_VP_ROW_COUNT = 20
/** Default Value-Area percentage for a newly created profile. */
export const DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT = 68

export type FixedRangeVolumeProfileParams = {
  candles: readonly FixedRangeVolumeProfileCandle[]
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

/**
 * One bar of the optional *developing* value area / POC series: the levels a
 * profile drawn from the range start through this candle would have. `null`
 * means no volume has accumulated yet at that bar.
 */
export type FixedRangeVolumeProfileDevelopingSample = {
  time: number
  pocPrice: number | null
  vah: number | null
  val: number | null
}

type FixedRangeVolumeProfileLevels = {
  pocPrice: number
  pocVolume: number
  vah: number | null
  val: number | null
}

const VOLUME_RELATIVE_EPSILON = 1e-9
const TICK_SNAP_RELATIVE_EPSILON = 1e-12

export function normalizeFixedRangeVolumeProfileCandles(
  candles: readonly FixedRangeVolumeProfileCandle[],
): FixedRangeVolumeProfileCandle[] {
  const byTime = new Map<number, FixedRangeVolumeProfileCandle>()
  for (const candle of candles) {
    byTime.set(candle.time, candle)
  }
  return [...byTime.entries()]
    .sort(([timeA], [timeB]) => timeA - timeB)
    .map(([, candle]) => candle)
}

function emptyResult(fromTime: number, toTime: number): FixedRangeVolumeProfileResult {
  const safeFrom = Number.isFinite(fromTime) ? fromTime : 0
  const safeTo = Number.isFinite(toTime) ? toTime : 0
  return {
    fromTime: safeFrom,
    toTime: safeTo,
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

function snapTolerance(scaled: number): number {
  return Math.max(1e-9, Math.abs(scaled) * TICK_SNAP_RELATIVE_EPSILON)
}

function isOnTickGrid(scaled: number): boolean {
  const rounded = Math.round(scaled)
  return Math.abs(scaled - rounded) <= snapTolerance(scaled)
}

function tickIndexFloor(price: number, invTick: number): number {
  const scaled = price * invTick
  if (isOnTickGrid(scaled)) return Math.round(scaled)
  return Math.floor(scaled + snapTolerance(scaled))
}

function tickIndexCeil(price: number, invTick: number): number {
  const scaled = price * invTick
  if (isOnTickGrid(scaled)) return Math.round(scaled)
  return Math.ceil(scaled - snapTolerance(scaled))
}

function tickToPrice(tickIndex: number, invTick: number): number {
  return tickIndex / invTick
}

function volumeEpsilon(a: number, b: number): number {
  return Math.max(VOLUME_RELATIVE_EPSILON, Math.abs(a) * VOLUME_RELATIVE_EPSILON, Math.abs(b) * VOLUME_RELATIVE_EPSILON)
}

function volumeGreater(a: number, b: number): boolean {
  return a - b > volumeEpsilon(a, b)
}

function volumeGreaterOrEqual(a: number, b: number): boolean {
  return a - b > -volumeEpsilon(a, b)
}

function volumeLess(a: number, b: number): boolean {
  return b - a > volumeEpsilon(a, b)
}

function actualRowCountFromTicks(spanTicks: number, rowHeightTicks: number): number {
  if (spanTicks <= 0 || rowHeightTicks < 1) return 0
  return Math.max(1, Math.ceil(spanTicks / rowHeightTicks))
}

function chooseRowHeightTicks(spanTicks: number, targetRowCount: number): number {
  const floorTicks = Math.max(1, Math.floor(spanTicks / targetRowCount))
  const ceilTicks = Math.max(1, Math.ceil(spanTicks / targetRowCount))
  const candidates = floorTicks === ceilTicks ? [floorTicks] : [floorTicks, ceilTicks]

  let bestTicks = candidates[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const ticks of candidates) {
    const rows = actualRowCountFromTicks(spanTicks, ticks)
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

function buildPriceRowsFromTicks(
  alignedLowTick: number,
  alignedHighBoundaryTick: number,
  rowHeightTicks: number,
  invTick: number,
): Array<{ priceLow: number; priceHigh: number }> {
  const spanTicks = alignedHighBoundaryTick - alignedLowTick
  if (spanTicks <= 0 || rowHeightTicks < 1) return []

  const rowCount = Math.ceil(spanTicks / rowHeightTicks)
  const rows: Array<{ priceLow: number; priceHigh: number }> = []

  for (let index = 0; index < rowCount; index += 1) {
    const rowLowTick = alignedLowTick + index * rowHeightTicks
    const rowHighTick =
      index === rowCount - 1
        ? alignedHighBoundaryTick
        : Math.min(alignedLowTick + (index + 1) * rowHeightTicks, alignedHighBoundaryTick)
    if (rowHighTick <= rowLowTick) continue
    rows.push({
      priceLow: tickToPrice(rowLowTick, invTick),
      priceHigh: tickToPrice(rowHighTick, invTick),
    })
  }

  return rows
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

/** First row whose price range can overlap `[candleLow, candleHigh]`. */
function firstRowOverlapping(
  rows: readonly FixedRangeVolumeProfileRow[],
  candleLow: number,
): number {
  let low = 0
  let high = rows.length - 1
  let result = rows.length
  while (low <= high) {
    const mid = (low + high) >> 1
    if (rows[mid].priceHigh > candleLow) {
      result = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }
  return result
}

function distributeCandleVolume(
  rows: FixedRangeVolumeProfileRow[],
  candle: FixedRangeVolumeProfileCandle,
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

  // Rows are sorted and contiguous, so the walk can start at the first row that
  // can intersect the candle and stop once a row starts at/above the candle
  // high. Every skipped row would have computed a zero overlap, so the result
  // (and the addition order) is identical to scanning all rows.
  const startIndex = firstRowOverlapping(rows, candleLow)
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index]
    if (!(row.priceLow < candleHigh)) break
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
    if (volumeGreater(volume, bestVolume)) {
      bestVolume = volume
      bestIndex = index
      continue
    }
    if (
      !volumeGreater(volume, bestVolume) &&
      !volumeGreater(bestVolume, volume) &&
      rows[index].priceLow < rows[bestIndex].priceLow
    ) {
      bestIndex = index
    }
  }
  return bestIndex
}

function readValueAreaLevels(
  rows: readonly FixedRangeVolumeProfileRow[],
  pocRowIndex: number,
): FixedRangeVolumeProfileLevels {
  let val: number | null = null
  let vah: number | null = null
  for (const row of rows) {
    if (!row.inValueArea) continue
    val = val === null ? row.priceLow : Math.min(val, row.priceLow)
    vah = vah === null ? row.priceHigh : Math.max(vah, row.priceHigh)
  }
  const pocRow = rows[pocRowIndex]
  return {
    pocPrice: (pocRow.priceLow + pocRow.priceHigh) / 2,
    pocVolume: pocRow.totalVolume,
    vah,
    val,
  }
}

function expandValueArea(
  rows: FixedRangeVolumeProfileRow[],
  pocIndex: number,
  targetVolume: number,
): number {
  rows[pocIndex].inValueArea = true
  let collected = rows[pocIndex].totalVolume

  if (!volumeGreater(targetVolume, 0)) {
    return collected
  }

  let upper = pocIndex + 1
  let lower = pocIndex - 1

  while (volumeLess(collected, targetVolume)) {
    const canExpandUp = upper < rows.length
    const canExpandDown = lower >= 0
    if (!canExpandUp && !canExpandDown) break

    const pickUpper = !canExpandDown
      ? true
      : !canExpandUp
        ? false
        : volumeGreaterOrEqual(rows[upper].totalVolume, rows[lower].totalVolume)

    if (pickUpper) {
      rows[upper].inValueArea = true
      collected += rows[upper].totalVolume
      upper += 1
    } else {
      rows[lower].inValueArea = true
      collected += rows[lower].totalVolume
      lower -= 1
    }
  }

  return collected
}

export function computeFixedRangeVolumeProfile(
  params: FixedRangeVolumeProfileParams,
): FixedRangeVolumeProfileResult {
  if (!Number.isFinite(params.fromTime) || !Number.isFinite(params.toTime)) {
    return emptyResult(0, 0)
  }

  const fromTime = Math.min(params.fromTime, params.toTime)
  const toTime = Math.max(params.fromTime, params.toTime)
  const rowCount = params.rowCount ?? DEFAULT_FIXED_RANGE_VP_ROW_COUNT
  const valueAreaPercent = params.valueAreaPercent ?? DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT
  const tickSize = params.tickSize

  if (
    !isFinitePositive(tickSize) ||
    !Number.isFinite(rowCount) ||
    !Number.isInteger(rowCount) ||
    rowCount < 1 ||
    !Number.isFinite(valueAreaPercent) ||
    valueAreaPercent < 0 ||
    valueAreaPercent > 100
  ) {
    return emptyResult(fromTime, toTime)
  }

  const invTick = 1 / tickSize
  if (!Number.isFinite(invTick)) {
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

  let alignedLowTick = Number.POSITIVE_INFINITY
  let alignedHighInclusiveTick = Number.NEGATIVE_INFINITY
  for (const candle of selected) {
    alignedLowTick = Math.min(alignedLowTick, tickIndexFloor(candle.low, invTick))
    alignedHighInclusiveTick = Math.max(alignedHighInclusiveTick, tickIndexCeil(candle.high, invTick))
  }

  let alignedHighBoundaryTick = alignedHighInclusiveTick
  if (alignedHighBoundaryTick <= alignedLowTick) {
    alignedHighBoundaryTick = alignedLowTick + 1
  }

  const spanTicks = alignedHighBoundaryTick - alignedLowTick
  if (spanTicks <= 0) {
    return emptyResult(fromTime, toTime)
  }

  const rowHeightTicks = chooseRowHeightTicks(spanTicks, rowCount)
  const rowHeight = rowHeightTicks / invTick
  const priceRows = buildPriceRowsFromTicks(
    alignedLowTick,
    alignedHighBoundaryTick,
    rowHeightTicks,
    invTick,
  )
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
  const levels = readValueAreaLevels(rows, pocRowIndex)

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
    pocPrice: levels.pocPrice,
    pocVolume: levels.pocVolume,
    vah: levels.vah,
    val: levels.val,
    valueAreaVolume,
    valueAreaPercentAchieved: totalVolume > 0 ? valueAreaVolume / totalVolume : 0,
  }
}

/**
 * Cumulative ("developing") value area and POC series for an already computed
 * profile.
 *
 * One bar at a time, the candle is added to a cumulative copy of the profile's
 * own price-row grid and the *existing* POC selection, value-area expansion and
 * level derivation are re-run on it. Nothing here is a second VA algorithm:
 * the grid comes from `profile.rows`, and `distributeCandleVolume`,
 * `selectPocIndex`, `expandValueArea` and `readValueAreaLevels` are the same
 * functions the full-range profile uses, so the last sample is by construction
 * identical to the full-range profile's POC/VAH/VAL (same row grid, same
 * accumulation order, same percent, same tie-breaks).
 *
 * Complexity: one walk over the `N` candles in the profile range, `O(rows)` per
 * candle (volume distribution, flag reset, POC scan, value-area expansion and
 * level read), i.e. `O(N · rows)` in total — bounded by the fetched profile
 * range and executed once per profile fetch by the data pipeline, never on the
 * per-frame render path.
 *
 * `valueAreaPercent` MUST be the value the profile was computed with; use
 * `computeFixedRangeVolumeProfileWithDeveloping` instead of calling this on its
 * own, because it resolves the percent once for both.
 *
 * `updateBars` is the developing update interval: omit it (or pass 1) for the
 * exact per-bar walk. A larger stride recomputes the levels only on bars `0`,
 * `N`, `2N`, … and the last bar (always exact), and the level holds in between:
 * the sample list still has one sample per bar, so the values are identical to
 * a per-bar walk at the update bars and copies of the previous update in
 * between. The FRVP data pipeline always passes the instance's resolved
 * interval, whose product default is 10 bars.
 */
function computeFixedRangeVolumeProfileDevelopingSeries(params: {
  profile: FixedRangeVolumeProfileResult
  candles: readonly FixedRangeVolumeProfileCandle[]
  valueAreaPercent: number | undefined
  updateBars?: number
}): FixedRangeVolumeProfileDevelopingSample[] {
  const { profile } = params
  if (profile.rows.length === 0) return []

  const valueAreaPercent = params.valueAreaPercent ?? DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT
  if (!Number.isFinite(valueAreaPercent) || valueAreaPercent < 0 || valueAreaPercent > 100) {
    return []
  }

  const rawUpdateBars = params.updateBars ?? 1
  const updateBars =
    Number.isFinite(rawUpdateBars) && rawUpdateBars >= 1
      ? Math.max(1, Math.floor(rawUpdateBars))
      : 1

  const selected = normalizeFixedRangeVolumeProfileCandles(params.candles).filter(
    (candle) => candle.time >= profile.fromTime && candle.time <= profile.toTime,
  )
  if (selected.length === 0) return []

  // Same grid as the full-range profile: `profile.rows` is the authoritative
  // price-row layout and the developing walk only accumulates volume into it.
  const cumulativeRows: FixedRangeVolumeProfileRow[] = profile.rows.map((row) => ({
    priceLow: row.priceLow,
    priceHigh: row.priceHigh,
    upVolume: 0,
    downVolume: 0,
    totalVolume: 0,
    inValueArea: false,
  }))

  const samples: FixedRangeVolumeProfileDevelopingSample[] = []
  const lastIndex = selected.length - 1
  // Levels from the most recent update; index 0 is always an update, so a held
  // sample never precedes the first computation.
  let heldPocPrice: number | null = null
  let heldVah: number | null = null
  let heldVal: number | null = null

  for (let index = 0; index <= lastIndex; index += 1) {
    const candle = selected[index]
    distributeCandleVolume(cumulativeRows, candle)

    const isUpdate = index % updateBars === 0 || index === lastIndex
    if (!isUpdate) {
      // Hold the last update's levels across the stride; the bar still gets a
      // sample so the step geometry draws one plateau over the interval.
      samples.push({
        time: candle.time,
        pocPrice: heldPocPrice,
        vah: heldVah,
        val: heldVal,
      })
      continue
    }

    let totalVolume = 0
    for (const row of cumulativeRows) {
      row.inValueArea = false
      totalVolume += row.totalVolume
    }

    const pocRowIndex = totalVolume > 0 ? selectPocIndex(cumulativeRows) : null
    if (pocRowIndex === null) {
      heldPocPrice = null
      heldVah = null
      heldVal = null
      samples.push({ time: candle.time, pocPrice: null, vah: null, val: null })
      continue
    }

    expandValueArea(cumulativeRows, pocRowIndex, (totalVolume * valueAreaPercent) / 100)
    const levels = readValueAreaLevels(cumulativeRows, pocRowIndex)
    heldPocPrice = levels.pocPrice
    heldVah = levels.vah
    heldVal = levels.val
    samples.push({
      time: candle.time,
      pocPrice: heldPocPrice,
      vah: heldVah,
      val: heldVal,
    })
  }
  return samples
}

/**
 * The full-range profile plus its developing (cumulative) series, resolved from
 * the same parameters — the value-area percentage is applied once to both, so
 * the last developing sample always equals the full-range POC/VAH/VAL.
 *
 * Used by the FRVP data pipeline; the optional step render mode never needs a
 * second pass over the candles.
 */
export function computeFixedRangeVolumeProfileWithDeveloping(
  params: FixedRangeVolumeProfileParams & {
    /**
     * Developing update interval in bars. Omitted = the exact per-bar walk;
     * the data pipeline passes `frvpInstanceDevelopingUpdateBars(instance)`
     * (product default 10). The last bar is always recomputed exactly, so a
     * range length that is not a multiple of the stride still ends on the
     * full-range value.
     */
    developingUpdateBars?: number
  },
): {
  profile: FixedRangeVolumeProfileResult
  developing: FixedRangeVolumeProfileDevelopingSample[]
} {
  const profile = computeFixedRangeVolumeProfile(params)
  return {
    profile,
    developing: computeFixedRangeVolumeProfileDevelopingSeries({
      profile,
      candles: params.candles,
      valueAreaPercent: params.valueAreaPercent,
      updateBars: params.developingUpdateBars,
    }),
  }
}
