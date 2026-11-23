import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_CHART_INDICATOR_SERIES_PLAN,
  FULL_CHART_INDICATOR_SERIES_PLAN,
  plannedChartIndicatorSeries,
  resolveChartIndicatorSeriesPlan,
} from './chartIndicatorSeriesPlan.ts'

describe('resolveChartIndicatorSeriesPlan', () => {
  it('plans no indicator series by default (no indicators selected)', () => {
    const plan = resolveChartIndicatorSeriesPlan({ activeIndicators: [], interval: '1m' })
    assert.deepEqual(plan, EMPTY_CHART_INDICATOR_SERIES_PLAN)
    assert.deepEqual(plannedChartIndicatorSeries(plan), [])
  })

  it('plans both EMA groups from the selection alone, on every interval', () => {
    for (const interval of ['1m', '5m', '1h', '4h', '1d', '1w'] as const) {
      const plan = resolveChartIndicatorSeriesPlan({
        activeIndicators: ['triple-ema', 'dual-ema'],
        interval,
      })
      assert.equal(plan['triple-ema'], true, interval)
      assert.equal(plan['dual-ema'], true, interval)
    }
  })

  it('plans a session VWAP only when it is selected and supported on the interval', () => {
    const onDaily = resolveChartIndicatorSeriesPlan({
      activeIndicators: ['daily-vwap', 'weekly-vwap', 'monthly-vwap', 'quarterly-vwap', 'yearly-vwap'],
      interval: '1m',
    })
    assert.equal(onDaily['daily-vwap'], true)
    assert.equal(onDaily['weekly-vwap'], true)
    assert.equal(onDaily['monthly-vwap'], false)
    assert.equal(onDaily['quarterly-vwap'], false)
    assert.equal(onDaily['yearly-vwap'], false)

    const onWeekly = resolveChartIndicatorSeriesPlan({
      activeIndicators: ['yearly-vwap', 'monthly-vwap'],
      interval: '1w',
    })
    assert.equal(onWeekly['yearly-vwap'], true)
    assert.equal(onWeekly['monthly-vwap'], false)
  })

  it('ignores unrelated indicators (rolling VWAP, RSI, liquidations)', () => {
    const plan = resolveChartIndicatorSeriesPlan({
      activeIndicators: ['rolling-vwap', 'rsi', 'aggregated-liquidations'],
      interval: '1m',
    })
    assert.deepEqual(plannedChartIndicatorSeries(plan), [])
  })

  it('returns a stable key order regardless of selection order', () => {
    const plan = resolveChartIndicatorSeriesPlan({
      activeIndicators: ['yearly-vwap', 'triple-ema', 'daily-vwap'],
      interval: '1d',
    })
    assert.deepEqual(plannedChartIndicatorSeries(plan), [
      'triple-ema',
      'daily-vwap',
      'yearly-vwap',
    ])
  })

  it('keeps the full plan available for callers without a selection', () => {
    assert.deepEqual(plannedChartIndicatorSeries(FULL_CHART_INDICATOR_SERIES_PLAN), [
      'triple-ema',
      'dual-ema',
      'daily-vwap',
      'weekly-vwap',
      'monthly-vwap',
      'quarterly-vwap',
      'yearly-vwap',
    ])
  })
})
