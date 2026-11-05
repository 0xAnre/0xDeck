import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeFixedRangeVolumeProfileWithDeveloping,
  type FixedRangeVolumeProfileCandle,
  type FixedRangeVolumeProfileDevelopingSample,
  type FixedRangeVolumeProfileResult,
} from './fixedRangeVolumeProfile.ts'

const TICK = 1

function candle(
  overrides: Partial<FixedRangeVolumeProfileCandle> & Pick<FixedRangeVolumeProfileCandle, 'time'>,
): FixedRangeVolumeProfileCandle {
  return {
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10,
    ...overrides,
  }
}

const DEFAULT_TEST_VALUE_AREA_PERCENT = 70

function combined(
  candles: readonly FixedRangeVolumeProfileCandle[],
  fromTime: number,
  toTime: number,
  options: { rowCount?: number; valueAreaPercent?: number; developingUpdateBars?: number } = {},
): {
  profile: FixedRangeVolumeProfileResult
  developing: FixedRangeVolumeProfileDevelopingSample[]
} {
  return computeFixedRangeVolumeProfileWithDeveloping({
    candles,
    fromTime,
    toTime,
    rowCount: options.rowCount ?? 20,
    valueAreaPercent: options.valueAreaPercent ?? DEFAULT_TEST_VALUE_AREA_PERCENT,
    tickSize: TICK,
    developingUpdateBars: options.developingUpdateBars,
  })
}

/** Three ascending-volume candles with a mid-range price swing. */
function swingCandles(): FixedRangeVolumeProfileCandle[] {
  return [
    candle({ time: 100, low: 99, high: 101, open: 100, close: 100.5, volume: 10 }),
    candle({ time: 160, low: 99, high: 104, open: 100, close: 103, volume: 20 }),
    candle({ time: 220, low: 98, high: 103, open: 103, close: 99, volume: 30 }),
  ]
}

describe('computeFixedRangeVolumeProfileDevelopingSeries', () => {
  it('returns no samples for an empty range or an empty profile', () => {
    assert.deepEqual(combined([], 100, 220).developing, [])

    // The candles outside the profile range produce no sample, while the
    // in-range candles in the same call keep exactly one sample each.
    const inRange = swingCandles()
    const withOutsider = [
      candle({ time: 1_000, low: 100, high: 101 }),
      ...inRange,
      candle({ time: 50, low: 100, high: 101 }),
    ]
    const result = combined(withOutsider, 100, 220)
    assert.ok(result.profile.rows.length > 0)
    assert.deepEqual(
      result.developing.map((sample) => sample.time),
      inRange.map((item) => item.time),
    )
  })

  it('walks one sample per selected candle in ascending time order', () => {
    const candles = swingCandles()
    const { profile, developing: samples } = combined([...candles].reverse(), 100, 220)

    assert.deepEqual(
      samples.map((sample) => sample.time),
      [100, 160, 220],
    )
    assert.equal(samples.length, profile.candleCount)
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(samples[index].time > samples[index - 1].time)
    }
  })

  it('ends exactly on the full-range POC/VAH/VAL levels', () => {
    const candles = swingCandles()
    for (const rowCount of [4, 8, 20, 68]) {
      for (const valueAreaPercent of [0, 25, 68, 70, 100]) {
        const { profile, developing: samples } = combined(candles, 100, 220, {
          rowCount,
          valueAreaPercent,
        })
        const last = samples[samples.length - 1]
        assert.equal(last.pocPrice, profile.pocPrice, `POC rows=${rowCount} va=${valueAreaPercent}`)
        assert.equal(last.vah, profile.vah, `VAH rows=${rowCount} va=${valueAreaPercent}`)
        assert.equal(last.val, profile.val, `VAL rows=${rowCount} va=${valueAreaPercent}`)
      }
    }
  })

  it('lets the POC develop bar by bar instead of repeating the final level', () => {
    const candles = [
      candle({ time: 100, low: 99, high: 101, open: 100, close: 100, volume: 5 }),
      candle({ time: 160, low: 119, high: 121, open: 120, close: 120, volume: 500 }),
    ]
    const { profile, developing: samples } = combined(candles, 100, 160, { rowCount: 100 })

    assert.equal(samples.length, 2)
    assert.notEqual(samples[0].pocPrice, samples[1].pocPrice)
    // The second bar carries almost all the volume, so its POC is its own price.
    assert.ok((samples[1].pocPrice ?? 0) > 115)
    assert.equal(samples[samples.length - 1].pocPrice, profile.pocPrice)
  })

  it('reuses the profile POC tie-break (equal volume picks the lower price row)', () => {
    const candles = [
      candle({ time: 100, low: 100, high: 100, open: 100, close: 100, volume: 10 }),
      candle({ time: 160, low: 200, high: 200, open: 200, close: 200, volume: 10 }),
    ]
    const { profile, developing: samples } = combined(candles, 100, 160, { rowCount: 100 })
    assert.equal(profile.pocPrice, 100.5)

    assert.equal(samples[0].pocPrice, 100.5)
    // The tie after the second bar keeps the lower price row, like the profile.
    assert.equal(samples[1].pocPrice, profile.pocPrice)
  })

  it('keeps the same value-area expansion tie-break as the profile', () => {
    // Symmetric volume around a low-volume middle: the profile prefers the
    // upper neighbour on equal adjacent row volumes, and the developing walk
    // must take the same path on the identical cumulative grid.
    const candles = [
      candle({ time: 100, low: 99, high: 101, open: 100, close: 100, volume: 10 }),
      candle({ time: 160, low: 104, high: 106, open: 105, close: 105, volume: 10 }),
      candle({ time: 220, low: 109, high: 111, open: 110, close: 110, volume: 10 }),
    ]
    const { profile, developing: samples } = combined(candles, 100, 220, {
      rowCount: 20,
      valueAreaPercent: 60,
    })
    const last = samples[samples.length - 1]
    assert.equal(last.vah, profile.vah)
    assert.equal(last.val, profile.val)
  })

  it('reports null levels until volume has accumulated', () => {
    const candles = [
      candle({ time: 100, low: 100, high: 100, volume: 0 }),
      candle({ time: 160, low: 100, high: 100, volume: 0 }),
      candle({ time: 220, low: 100, high: 101, open: 100, close: 101, volume: 10 }),
    ]
    const { developing: samples } = combined(candles, 100, 220)

    assert.deepEqual(samples[0], { time: 100, pocPrice: null, vah: null, val: null })
    assert.deepEqual(samples[1], { time: 160, pocPrice: null, vah: null, val: null })
    assert.notEqual(samples[2].pocPrice, null)
    assert.notEqual(samples[2].vah, null)
    assert.notEqual(samples[2].val, null)
  })

  it('produces a single sample for a single-bar range', () => {
    const candles = [candle({ time: 100, low: 99, high: 101, open: 100, close: 101, volume: 10 })]
    const { profile, developing: samples } = combined(candles, 100, 100)

    assert.equal(samples.length, 1)
    assert.equal(samples[0].time, 100)
    assert.equal(samples[0].pocPrice, profile.pocPrice)
    assert.equal(samples[0].vah, profile.vah)
    assert.equal(samples[0].val, profile.val)
  })

  it('keeps one sample per deduplicated candle time', () => {
    const candles = [
      candle({ time: 100, low: 100, high: 101, volume: 1 }),
      candle({ time: 100, low: 100, high: 101, volume: 9 }),
      candle({ time: 160, low: 100, high: 102, volume: 5 }),
    ]
    const { profile, developing: samples } = combined(candles, 100, 160)

    assert.equal(samples.length, 2)
    assert.deepEqual(
      samples.map((sample) => sample.time),
      [100, 160],
    )
    assert.equal(samples.length, profile.candleCount)
  })

  it('does not mutate the profile result it reads', () => {
    const candles = swingCandles()
    const { profile } = combined(candles, 100, 220)
    const before = JSON.stringify(profile)

    // Every input candle still produces samples against the same profile grid.
    const again = combined(candles, 100, 220)
    assert.equal(JSON.stringify(profile), before)
    assert.equal(JSON.stringify(again.profile), before)
  })

  it('handles a long range in one bounded walk', () => {
    const candles: FixedRangeVolumeProfileCandle[] = []
    let price = 100
    for (let index = 0; index < 1_200; index += 1) {
      price += index % 7 === 0 ? -1 : 0.5
      candles.push(
        candle({
          time: 1_700_000_000 + index * 60,
          low: price - 1,
          high: price + 1,
          open: price,
          close: price + 0.25,
          volume: 1 + (index % 11),
        }),
      )
    }
    const fromTime = candles[0].time
    const toTime = candles[candles.length - 1].time
    const { profile, developing: samples } = combined(candles, fromTime, toTime, { rowCount: 68 })

    assert.equal(samples.length, candles.length)
    const last = samples[samples.length - 1]
    assert.equal(last.pocPrice, profile.pocPrice)
    assert.equal(last.vah, profile.vah)
    assert.equal(last.val, profile.val)
  })
})

describe('developing update interval (every N bars)', () => {
  /** 40 one-minute candles with a moving price and varied volume. */
  function seriesCandles(count: number): FixedRangeVolumeProfileCandle[] {
    const candles: FixedRangeVolumeProfileCandle[] = []
    let price = 100
    for (let index = 0; index < count; index += 1) {
      price += index % 5 < 2 ? 1.5 : -0.5
      candles.push(
        candle({
          time: 100 + index * 60,
          low: price - 1,
          high: price + 1,
          open: price,
          close: price + 0.5,
          volume: 2 + (index % 7),
        }),
      )
    }
    return candles
  }

  function sameLevels(
    actual: FixedRangeVolumeProfileDevelopingSample,
    expected: FixedRangeVolumeProfileDevelopingSample,
  ): void {
    assert.equal(actual.pocPrice, expected.pocPrice)
    assert.equal(actual.vah, expected.vah)
    assert.equal(actual.val, expected.val)
  }

  it('keeps stride 1 identical to the default per-bar series', () => {
    const candles = seriesCandles(40)
    const explicit = combined(candles, 100, 100 + 39 * 60, { developingUpdateBars: 1 })
    const implicit = combined(candles, 100, 100 + 39 * 60)
    assert.deepEqual(explicit, implicit)
  })

  it('holds the last update value between boundaries', () => {
    const candles = seriesCandles(40)
    const from = 100
    const to = 100 + 39 * 60
    const exact = combined(candles, from, to, { developingUpdateBars: 1 }).developing
    const strided = combined(candles, from, to, { developingUpdateBars: 5 }).developing

    assert.equal(strided.length, exact.length)
    assert.deepEqual(
      strided.map((sample) => sample.time),
      exact.map((sample) => sample.time),
    )
    // Bars 0..4 hold the bar-0 levels, 5..9 the bar-5 levels, and so on.
    for (let index = 0; index < strided.length - 1; index += 1) {
      sameLevels(strided[index], exact[Math.floor(index / 5) * 5])
    }
    // The last bar is always recomputed exactly.
    sameLevels(strided[strided.length - 1], exact[exact.length - 1])
  })

  it('ends on the full-range value for every allowed interval', () => {
    const candles = seriesCandles(200)
    const from = 100
    const to = 100 + 199 * 60
    for (const developingUpdateBars of [1, 3, 5, 10, 30, 60]) {
      const { profile, developing } = combined(candles, from, to, {
        developingUpdateBars,
      })
      assert.equal(developing.length, candles.length)
      const last = developing[developing.length - 1]
      assert.equal(last.pocPrice, profile.pocPrice, `POC bars=${developingUpdateBars}`)
      assert.equal(last.vah, profile.vah, `VAH bars=${developingUpdateBars}`)
      assert.equal(last.val, profile.val, `VAL bars=${developingUpdateBars}`)
    }
  })

  it('closes a final partial block on the exact full-range value', () => {
    // 12 bars with a 5-bar interval: updates at 0, 5, 10 and the extra final bar 11.
    const candles = seriesCandles(12)
    const from = 100
    const to = 100 + 11 * 60
    const exact = combined(candles, from, to, { developingUpdateBars: 1 }).developing
    const { profile, developing } = combined(candles, from, to, {
      developingUpdateBars: 5,
    })

    assert.equal(developing.length, 12)
    for (const boundary of [0, 5, 10]) {
      sameLevels(developing[boundary], exact[boundary])
    }
    for (const held of [6, 7, 8, 9]) {
      sameLevels(developing[held], exact[5])
    }
    // The final bar (index 11) is not a multiple of 5, but is always exact.
    sameLevels(developing[11], exact[11])
    assert.equal(developing[11].pocPrice, profile.pocPrice)
    assert.equal(developing[11].vah, profile.vah)
    assert.equal(developing[11].val, profile.val)
  })

  it('ignores invalid intervals by falling back to every bar', () => {
    const candles = seriesCandles(12)
    const from = 100
    const to = 100 + 11 * 60
    const exact = combined(candles, from, to, { developingUpdateBars: 1 })
    for (const invalid of [0, -5, Number.NaN, 2.7]) {
      const result = combined(candles, from, to, { developingUpdateBars: invalid })
      // 2.7 floors to a 2-bar stride; the others fall back to 1. The important
      // part is that nothing throws and the full-range end stays exact.
      const last = result.developing[result.developing.length - 1]
      assert.equal(last.pocPrice, result.profile.pocPrice)
      if (!(invalid > 1)) {
        assert.deepEqual(result, exact)
      }
    }
  })
})
