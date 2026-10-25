import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ROLLING_VWAP_PERIOD_BUCKETS,
  rollingVwapPeriodBucketForWindowMs,
  rollingVwapSettingsSupportedOnInterval,
  rollingVwapSettingsTimeframeCompatibility,
  rollingVwapTimeframeCompatibilityReason,
} from './rollingVwapMinimumTimeframe.ts'
import { MS_IN_DAY, rollingVwapAutoWindowMs } from './rollingVwap.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import {
  setRollingVwapInstanceSeriesVisibility,
} from './rollingVwapChartSeries.ts'
import { createRollingVwapInstance } from './rollingVwapInstances.ts'
import { CANDLE_INTERVALS, type CandleInterval } from './types.ts'

function fixedWindow(days: number, hours = 0, minutes = 0) {
  const settings = createDefaultRollingVwapSettings()
  settings.fixedTimePeriod = { useFixedTimePeriod: true, days, hours, minutes }
  return settings
}

const AUTO_EXPECTATIONS: Record<CandleInterval, { period: string; minimum: CandleInterval }> = {
  '1m': { period: '1D', minimum: '1m' },
  '5m': { period: '1D', minimum: '1m' },
  '15m': { period: '1D', minimum: '1m' },
  '30m': { period: '1D', minimum: '1m' },
  '1h': { period: '1D', minimum: '1m' },
  '2h': { period: '1W', minimum: '5m' },
  '4h': { period: '1W', minimum: '5m' },
  '1d': { period: '1M', minimum: '30m' },
  '1w': { period: '3M', minimum: '1h' },
}

describe('Rolling VWAP minimum timeframe table', () => {
  it('uses the approved seven-row table exactly', () => {
    assert.deepEqual(
      ROLLING_VWAP_PERIOD_BUCKETS.map((bucket) => [bucket.period, bucket.minimumInterval]),
      [
        ['1D', '1m'],
        ['1W', '5m'],
        ['2W', '15m'],
        ['1M', '30m'],
        ['3M', '1h'],
        ['6M', '2h'],
        ['1Y', '4h'],
      ],
    )
  })

  it('keeps the existing 30.4375-day month constant', () => {
    const month = ROLLING_VWAP_PERIOD_BUCKETS.find((bucket) => bucket.period === '1M')
    assert.equal(month?.durationMs, MS_IN_DAY * 30.4375)
    assert.equal(rollingVwapAutoWindowMs('1d'), Math.trunc(MS_IN_DAY * 30.4375))
  })

  it('maps every exact period duration to its own bucket and checks both boundaries', () => {
    for (let index = 0; index < ROLLING_VWAP_PERIOD_BUCKETS.length; index += 1) {
      const bucket = ROLLING_VWAP_PERIOD_BUCKETS[index]
      assert.equal(rollingVwapPeriodBucketForWindowMs(bucket.durationMs)?.period, bucket.period)

      if (index > 0) {
        assert.equal(
          rollingVwapPeriodBucketForWindowMs(bucket.durationMs - 1)?.period,
          bucket.period,
        )
      }
      if (index < ROLLING_VWAP_PERIOD_BUCKETS.length - 1) {
        assert.equal(
          rollingVwapPeriodBucketForWindowMs(bucket.durationMs + 1)?.period,
          ROLLING_VWAP_PERIOD_BUCKETS[index + 1].period,
        )
      }
    }
  })

  it('treats anything longer than 1Y as unsupported', () => {
    const justOverOneYear = ROLLING_VWAP_PERIOD_BUCKETS[6].durationMs + 1
    assert.equal(rollingVwapPeriodBucketForWindowMs(justOverOneYear), null)
    const compatibility = rollingVwapSettingsTimeframeCompatibility(
      { useFixedTimePeriod: true, days: 366, hours: 0, minutes: 0 },
      '4h',
    )
    assert.equal(compatibility.supported, false)
    assert.equal(compatibility.reason, 'window-too-long')
    assert.equal(rollingVwapTimeframeCompatibilityReason(compatibility), 'window longer than 1Y')
  })

  it('covers all 1D..1Y fixed windows on their minimum chart interval and rejects smaller intervals', () => {
    const dayWindows: Array<[number, CandleInterval]> = [
      [1, '1m'],
      [7, '5m'],
      [14, '15m'],
      [30, '30m'],
      [90, '1h'],
      [180, '2h'],
      [365, '4h'],
    ]

    for (const [days, minimum] of dayWindows) {
      const compatibility = rollingVwapSettingsTimeframeCompatibility(fixedWindow(days).fixedTimePeriod, minimum)
      assert.equal(compatibility.supported, true, `${days}D should be supported on ${minimum}`)

      const minimumIndex = CANDLE_INTERVALS.indexOf(minimum)
      if (minimumIndex > 0) {
        const smaller = CANDLE_INTERVALS[minimumIndex - 1]
        const rejected = rollingVwapSettingsTimeframeCompatibility(fixedWindow(days).fixedTimePeriod, smaller)
        assert.equal(rejected.supported, false, `${days}D should be rejected on ${smaller}`)
      }
    }
  })

  it('keeps 1Y supported on 4h and rejects it on 2h', () => {
    assert.equal(rollingVwapSettingsSupportedOnInterval(fixedWindow(365).fixedTimePeriod, '4h'), true)
    const rejected = rollingVwapSettingsTimeframeCompatibility(fixedWindow(365).fixedTimePeriod, '2h')
    assert.equal(rejected.supported, false)
    assert.equal(rejected.reason, 'interval-too-small')
    assert.equal(rollingVwapTimeframeCompatibilityReason(rejected), 'needs 4h chart timeframe')
  })
})

describe('Rolling VWAP Auto mode compatibility', () => {
  it('maps Auto on every supported interval to the approved bucket', () => {
    for (const interval of CANDLE_INTERVALS) {
      const settings = createDefaultRollingVwapSettings()
      const compatibility = rollingVwapSettingsTimeframeCompatibility(settings.fixedTimePeriod, interval)
      assert.equal(compatibility.supported, true, interval)
      assert.equal(compatibility.bucket?.period, AUTO_EXPECTATIONS[interval].period, interval)
      assert.equal(compatibility.minimumInterval, AUTO_EXPECTATIONS[interval].minimum, interval)
    }
  })

  it('re-evaluates the same instance on interval change without changing the interval', () => {
    const settings = fixedWindow(7)
    const instance = createRollingVwapInstance({ settings })

    assert.equal(rollingVwapSettingsSupportedOnInterval(instance.settings.fixedTimePeriod, '1m'), false)
    assert.equal(rollingVwapSettingsSupportedOnInterval(instance.settings.fixedTimePeriod, '5m'), true)
    assert.equal(rollingVwapSettingsSupportedOnInterval(instance.settings.fixedTimePeriod, '1m'), false)
    assert.equal(instance.settings.fixedTimePeriod.days, 7)
  })

  it('does not render an incompatible instance but renders it on a larger interval', () => {
    const instance = createRollingVwapInstance({ settings: fixedWindow(7) })
    const visibility: boolean[] = []
    const line = {
      setData: () => {},
      update: () => {},
      applyOptions: (options: { visible?: boolean; lastValueVisible?: boolean }) => {
        if (typeof options.visible === 'boolean') visibility.push(options.visible)
      },
    }
    const bundle = {
      center: line,
      bands: {
        upper1: line,
        lower1: line,
        upper2: line,
        lower2: line,
        upper3: line,
        lower3: line,
      },
      ordered: [line],
    } as unknown as Parameters<typeof setRollingVwapInstanceSeriesVisibility>[0]

    setRollingVwapInstanceSeriesVisibility(bundle, instance, '1m')
    assert.equal(visibility[0], false)

    visibility.length = 0
    setRollingVwapInstanceSeriesVisibility(bundle, instance, '5m')
    assert.equal(visibility[0], true)
  })
})
