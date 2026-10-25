import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import {
  describeIndicatorHistoryStatus,
  DUAL_EMA_WARMUP_BARS,
  evaluateIndicatorHistoryPlan,
  evaluateIndicatorHistoryRequirement,
  mergeIndicatorHistoryRequirements,
  resolveIndicatorHistoryPlan,
  resolveIndicatorHistoryRequirements,
  TRIPLE_EMA_WARMUP_BARS,
  vwapCalendarPeriodStartSeconds,
} from './indicatorHistoryRequirements.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { MarketCandle } from './types.ts'

const NOW = Date.UTC(2026, 4, 15, 12, 34, 56) / 1000 // Friday 2026-05-15T12:34:56Z

function candle(time: number): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
  }
}

function rollingInstance(
  settings = createDefaultRollingVwapSettings(),
  overrides: Partial<RollingVwapInstance> = {},
): RollingVwapInstance {
  return { id: 'rvwap-test', enabled: true, settings, displaySequence: 1, ...overrides }
}

function anchoredInstance(anchorTime: number): AnchoredVwapInstance {
  return {
    id: 'avwap-test',
    anchorTime,
    displaySequence: 1,
    settings: {} as AnchoredVwapInstance['settings'],
  }
}

describe('indicator history requirements: EMA', () => {
  it('uses 65/105/175 target bars for 3 EMA (175 shared warmup)', () => {
    const [requirement] = resolveIndicatorHistoryRequirements({
      interval: '1m',
      indicators: ['triple-ema'],
      nowSeconds: NOW,
    })
    assert.equal(TRIPLE_EMA_WARMUP_BARS, 175)
    assert.equal(requirement.warmupBars, 175)
    assert.equal(requirement.minimumBarsToCompute, 35)
    assert.equal(requirement.earliestTime, null)
  })

  it('uses 1,000 target bars for 2 EMA and keeps EMA available on all intervals', () => {
    for (const interval of ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'] as const) {
      const [requirement] = resolveIndicatorHistoryRequirements({
        interval,
        indicators: ['dual-ema'],
        nowSeconds: NOW,
      })
      assert.equal(DUAL_EMA_WARMUP_BARS, 1000)
      assert.equal(requirement.warmupBars, 1000)
      assert.equal(requirement.minimumBarsToCompute, 200)
    }
  })
})

describe('indicator history requirements: Anchored VWAP', () => {
  it('requires history back to the anchor timestamp', () => {
    const [requirement] = resolveIndicatorHistoryRequirements({
      interval: '1m',
      indicators: [],
      anchoredVwapInstances: [anchoredInstance(NOW - 9000)],
      nowSeconds: NOW,
    })
    assert.equal(requirement.kind, 'anchored-vwap')
    assert.equal(requirement.label, 'Anchored VWAP 1')
    assert.equal(requirement.earliestTime, NOW - 9000)
    assert.equal(requirement.warmupBars, 2)
  })
})

describe('indicator history requirements: Rolling VWAP', () => {
  it('uses ceil(window / interval) + minBars for a fixed window', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.minBars = 10
    settings.fixedTimePeriod = { useFixedTimePeriod: true, days: 1, hours: 0, minutes: 0 }

    const [requirement] = resolveIndicatorHistoryRequirements({
      interval: '1m',
      indicators: [],
      rollingVwapInstances: [rollingInstance(settings)],
      nowSeconds: NOW,
    })
    assert.equal(requirement.warmupBars, 1440 + 10)
  })

  it('uses rollingVwapAutoWindowMs in Auto mode', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.minBars = 10
    const [requirement] = resolveIndicatorHistoryRequirements({
      interval: '1d',
      indicators: [],
      rollingVwapInstances: [rollingInstance(settings)],
      nowSeconds: NOW,
    })
    // 30.4375d window -> ceil = 31 bars, plus minBars floor.
    assert.equal(requirement.warmupBars, 31 + 10)
  })

  it('skips disabled and incompatible Rolling VWAP instances', () => {
    const fixedWeek = createDefaultRollingVwapSettings()
    fixedWeek.fixedTimePeriod = { useFixedTimePeriod: true, days: 7, hours: 0, minutes: 0 }

    assert.deepEqual(
      resolveIndicatorHistoryRequirements({
        interval: '1m',
        indicators: [],
        rollingVwapInstances: [rollingInstance(fixedWeek)],
        nowSeconds: NOW,
      }),
      [],
    )

    assert.deepEqual(
      resolveIndicatorHistoryRequirements({
        interval: '5m',
        indicators: [],
        rollingVwapInstances: [rollingInstance(fixedWeek, { enabled: false })],
        nowSeconds: NOW,
      }),
      [],
    )
  })
})

describe('indicator history requirements: Time-Based VWAP', () => {
  it('resolves the current UTC calendar period start per level', () => {
    assert.equal(vwapCalendarPeriodStartSeconds('daily', NOW), Date.UTC(2026, 4, 15) / 1000)
    assert.equal(vwapCalendarPeriodStartSeconds('weekly', NOW), Date.UTC(2026, 4, 11) / 1000)
    assert.equal(vwapCalendarPeriodStartSeconds('monthly', NOW), Date.UTC(2026, 4, 1) / 1000)
    assert.equal(vwapCalendarPeriodStartSeconds('quarterly', NOW), Date.UTC(2026, 3, 1) / 1000)
    assert.equal(vwapCalendarPeriodStartSeconds('yearly', NOW), Date.UTC(2026, 0, 1) / 1000)
  })

  it('requires the current period start for active context levels', () => {
    const requirements = resolveIndicatorHistoryRequirements({
      interval: '1d',
      indicators: ['daily-vwap', 'weekly-vwap', 'monthly-vwap', 'quarterly-vwap', 'yearly-vwap'],
      nowSeconds: NOW,
    })
    const bySource = new Map(requirements.map((requirement) => [requirement.source, requirement]))
    assert.equal(bySource.get('daily-vwap')?.earliestTime, Date.UTC(2026, 4, 15) / 1000)
    assert.equal(bySource.get('weekly-vwap')?.earliestTime, Date.UTC(2026, 4, 11) / 1000)
    assert.equal(bySource.get('monthly-vwap')?.earliestTime, Date.UTC(2026, 4, 1) / 1000)
    assert.equal(bySource.get('quarterly-vwap')?.earliestTime, Date.UTC(2026, 3, 1) / 1000)
    assert.equal(bySource.get('yearly-vwap')?.earliestTime, Date.UTC(2026, 0, 1) / 1000)
  })

  it('skips context indicators on unsupported intervals', () => {
    assert.deepEqual(
      resolveIndicatorHistoryRequirements({
        interval: '1w',
        indicators: ['daily-vwap', 'weekly-vwap', 'monthly-vwap', 'quarterly-vwap'],
        nowSeconds: NOW,
      }),
      [],
    )
  })
})

describe('indicator history requirements: shared merge', () => {
  it('takes max warmup bars and earliest required timestamp across all indicators', () => {
    const fixedDay = createDefaultRollingVwapSettings()
    fixedDay.minBars = 5
    fixedDay.fixedTimePeriod = { useFixedTimePeriod: true, days: 1, hours: 0, minutes: 0 }

    const requirements = resolveIndicatorHistoryRequirements({
      interval: '1m',
      indicators: ['triple-ema', 'dual-ema', 'daily-vwap'],
      rollingVwapInstances: [rollingInstance(fixedDay)],
      anchoredVwapInstances: [anchoredInstance(NOW - 3 * 86_400)],
      nowSeconds: NOW,
    })
    const plan = mergeIndicatorHistoryRequirements(requirements)
    assert.equal(plan.requirements.length, 5)
    assert.equal(plan.warmupBars, 1440 + 5)
    assert.equal(plan.earliestTime, NOW - 3 * 86_400)
  })

  it('deduplicates repeated indicator ids', () => {
    const plan = resolveIndicatorHistoryPlan({
      interval: '1m',
      indicators: ['triple-ema', 'triple-ema'],
      nowSeconds: NOW,
    })
    assert.equal(plan.requirements.length, 1)
  })
})

describe('indicator history status', () => {
  const anchored = resolveIndicatorHistoryRequirements({
    interval: '1m',
    indicators: [],
    anchoredVwapInstances: [anchoredInstance(1000)],
    nowSeconds: NOW,
  })[0]

  it('marks candles below the period as cannot-compute', () => {
    const [requirement] = resolveIndicatorHistoryRequirements({
      interval: '1w',
      indicators: ['dual-ema'],
      nowSeconds: NOW,
    })
    const entry = evaluateIndicatorHistoryRequirement(requirement, [candle(1), candle(2)])
    assert.equal(entry.status, 'cannot-compute')
  })

  it('marks enough-to-compute but below-target as partial warmup', () => {
    const [requirement] = resolveIndicatorHistoryRequirements({
      interval: '1w',
      indicators: ['dual-ema'],
      nowSeconds: NOW,
    })
    const candles = Array.from({ length: 750 }, (_, index) => candle(index))
    const entry = evaluateIndicatorHistoryRequirement(requirement, candles)
    assert.equal(entry.status, 'partial-warmup')
    assert.match(describeIndicatorHistoryStatus(entry) ?? '', /partial warmup \(750\/1000 bars\)/)
  })

  it('marks an anchor older than available history as cannot-compute', () => {
    const entry = evaluateIndicatorHistoryRequirement(anchored, [candle(2000), candle(3000)])
    assert.equal(entry.status, 'cannot-compute')
    assert.equal(
      describeIndicatorHistoryStatus(entry),
      'Anchored VWAP 1: anchor is older than available history',
    )
  })

  it('reports ready once the anchor is covered', () => {
    const entry = evaluateIndicatorHistoryRequirement(anchored, [candle(1000), candle(2000)])
    assert.equal(entry.status, 'ready')
    assert.equal(describeIndicatorHistoryStatus(entry), null)
  })

  it('evaluates a merged plan into per-indicator notices', () => {
    const plan = resolveIndicatorHistoryPlan({
      interval: '1w',
      indicators: ['triple-ema', 'dual-ema'],
      nowSeconds: NOW,
    })
    const notices = evaluateIndicatorHistoryPlan(
      plan,
      Array.from({ length: 750 }, (_, index) => candle(index)),
    )
      .map(describeIndicatorHistoryStatus)
      .filter((notice): notice is string => notice !== null)
    assert.equal(notices.length, 1)
    assert.match(notices[0], /2 EMA: partial warmup/)
  })
})
