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
  options: { rowCount?: number; valueAreaPercent?: number } = {},
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
