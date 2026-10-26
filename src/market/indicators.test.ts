import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildMarketIndicatorOptions,
  DEFAULT_MARKET_INDICATORS,
  indicatorContextLevel,
  isIndicatorSupportedOnInterval,
  isMarketIndicatorId,
  MARKET_INDICATOR_BAND_FILL_IDS,
  MARKET_INDICATOR_DEFINITIONS,
  marketIndicatorSupportsBandFill,
  MARKET_INDICATOR_IDS,
  requiredVwapContextLevel,
} from './indicators.ts'
import { CANDLE_INTERVALS } from './types.ts'

describe('DEFAULT_MARKET_INDICATORS', () => {
  it('is empty so new BTC Perp panels open without indicators', () => {
    assert.deepEqual(DEFAULT_MARKET_INDICATORS, [])
  })
})

describe('market indicator ids', () => {
  it('accepts long-horizon vwap indicators', () => {
    assert.equal(isMarketIndicatorId('monthly-vwap'), true)
    assert.equal(isMarketIndicatorId('quarterly-vwap'), true)
    assert.equal(isMarketIndicatorId('yearly-vwap'), true)
  })

  it('accepts rolling-vwap', () => {
    assert.equal(isMarketIndicatorId('rolling-vwap'), true)
  })

  it('accepts dual-ema', () => {
    assert.equal(isMarketIndicatorId('dual-ema'), true)
  })

  it('rejects removed sma and legacy ema-200 indicator ids', () => {
    assert.equal(isMarketIndicatorId('sma-20'), false)
    assert.equal(isMarketIndicatorId('sma-50'), false)
    assert.equal(isMarketIndicatorId('sma-100'), false)
    assert.equal(isMarketIndicatorId('sma-200'), false)
    assert.equal(isMarketIndicatorId('ema-200'), false)
  })
})

describe('time-based VWAP band fill support', () => {
  it('exposes background fill for exactly the five time-based VWAPs', () => {
    assert.deepEqual([...MARKET_INDICATOR_BAND_FILL_IDS], [
      'daily-vwap',
      'weekly-vwap',
      'monthly-vwap',
      'quarterly-vwap',
      'yearly-vwap',
    ])
    for (const id of MARKET_INDICATOR_BAND_FILL_IDS) {
      assert.equal(marketIndicatorSupportsBandFill(id), true)
    }
    for (const id of ['triple-ema', 'dual-ema', 'rolling-vwap', 'rsi', 'aggregated-liquidations'] as const) {
      assert.equal(marketIndicatorSupportsBandFill(id), false)
    }
  })
})

describe('dual-ema registry', () => {
  it('lists 2 EMA after 3 EMA with all-interval support', () => {
    const tripleIndex = MARKET_INDICATOR_IDS.indexOf('triple-ema')
    const dualEmaIndex = MARKET_INDICATOR_IDS.indexOf('dual-ema')
    assert.equal(tripleIndex >= 0, true)
    assert.equal(dualEmaIndex, tripleIndex + 1)
    const def = MARKET_INDICATOR_DEFINITIONS['dual-ema']
    assert.equal(def.label, '2 EMA')
    assert.equal(def.contextLevel, null)
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(isIndicatorSupportedOnInterval('dual-ema', interval), true)
    }
  })

  it('exposes 2 EMA in indicator menu options', () => {
    const options = buildMarketIndicatorOptions('1m')
    const dualEma = options.find((o) => o.value === 'dual-ema')
    assert.equal(dualEma?.label, '2 EMA')
    assert.equal(dualEma?.disabled, false)
  })
})

describe('rolling-vwap registry', () => {
  it('is enabled on all chart intervals with no context level', () => {
    const def = MARKET_INDICATOR_DEFINITIONS['rolling-vwap']
    assert.equal(def.label, 'Rolling VWAP')
    assert.equal(def.contextLevel, null)
    assert.equal(indicatorContextLevel('rolling-vwap'), null)
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(isIndicatorSupportedOnInterval('rolling-vwap', interval), true)
    }
  })

  it('does not widen requiredVwapContextLevel when only rolling-vwap is selected', () => {
    assert.equal(requiredVwapContextLevel(['rolling-vwap'], '1m'), 'daily')
    assert.equal(requiredVwapContextLevel(['rolling-vwap'], '1w'), 'daily')
  })
})

describe('indicator support matrix', () => {
  it('disables monthly and quarterly on 1w', () => {
    assert.equal(isIndicatorSupportedOnInterval('monthly-vwap', '1w'), false)
    assert.equal(isIndicatorSupportedOnInterval('quarterly-vwap', '1w'), false)
    assert.equal(isIndicatorSupportedOnInterval('yearly-vwap', '1w'), true)
  })

  it('disables yearly on 4h', () => {
    assert.equal(isIndicatorSupportedOnInterval('yearly-vwap', '4h'), false)
    assert.equal(isIndicatorSupportedOnInterval('monthly-vwap', '4h'), true)
  })

  it('disables daily and weekly on 1w', () => {
    assert.equal(isIndicatorSupportedOnInterval('daily-vwap', '1w'), false)
    assert.equal(isIndicatorSupportedOnInterval('weekly-vwap', '1w'), false)
  })

  it('enables daily and weekly on 1h and 2h', () => {
    assert.equal(isIndicatorSupportedOnInterval('daily-vwap', '1h'), true)
    assert.equal(isIndicatorSupportedOnInterval('weekly-vwap', '1h'), true)
    assert.equal(isIndicatorSupportedOnInterval('daily-vwap', '2h'), true)
    assert.equal(isIndicatorSupportedOnInterval('weekly-vwap', '2h'), true)
  })

  it('enables 3 EMA, 2 EMA, daily/weekly and rolling VWAP on 15m', () => {
    for (const id of ['triple-ema', 'dual-ema', 'daily-vwap', 'weekly-vwap', 'rolling-vwap'] as const) {
      assert.equal(isIndicatorSupportedOnInterval(id, '15m'), true)
    }
  })

  it('keeps monthly, quarterly and yearly VWAP unchanged on 15m', () => {
    assert.equal(isIndicatorSupportedOnInterval('monthly-vwap', '15m'), false)
    assert.equal(isIndicatorSupportedOnInterval('quarterly-vwap', '15m'), false)
    assert.equal(isIndicatorSupportedOnInterval('yearly-vwap', '15m'), false)
  })

  it('keeps monthly and quarterly disabled on 1h and 2h', () => {
    assert.equal(isIndicatorSupportedOnInterval('monthly-vwap', '1h'), false)
    assert.equal(isIndicatorSupportedOnInterval('quarterly-vwap', '1h'), false)
    assert.equal(isIndicatorSupportedOnInterval('monthly-vwap', '2h'), false)
    assert.equal(isIndicatorSupportedOnInterval('quarterly-vwap', '2h'), false)
  })
})

describe('buildMarketIndicatorOptions', () => {
  it('marks unsupported indicators disabled on 4h', () => {
    const options = buildMarketIndicatorOptions('4h')
    const yearly = options.find((o) => o.value === 'yearly-vwap')
    assert.equal(yearly?.disabled, true)
    const monthly = options.find((o) => o.value === 'monthly-vwap')
    assert.equal(monthly?.disabled, false)
  })
})

describe('requiredVwapContextLevel', () => {
  it('picks yearly when monthly quarterly and yearly are active on 1d', () => {
    assert.equal(
      requiredVwapContextLevel(['monthly-vwap', 'quarterly-vwap', 'yearly-vwap'], '1d'),
      'yearly',
    )
  })

  it('picks quarterly when monthly and quarterly are active on 4h', () => {
    assert.equal(
      requiredVwapContextLevel(['monthly-vwap', 'quarterly-vwap'], '4h'),
      'quarterly',
    )
  })

  it('ignores unsupported indicators when computing context', () => {
    assert.equal(requiredVwapContextLevel(['yearly-vwap'], '4h'), 'daily')
    assert.equal(requiredVwapContextLevel(['yearly-vwap'], '1w'), 'yearly')
  })
})

describe('aggregated-liquidations registry', () => {
  it('is registered, selectable on every interval and has no VWAP context', () => {
    assert.equal(isMarketIndicatorId('aggregated-liquidations'), true)
    const def = MARKET_INDICATOR_DEFINITIONS['aggregated-liquidations']
    assert.equal(def.label, 'Aggregated Liquidations')
    assert.equal(def.contextLevel, null)
    assert.equal(indicatorContextLevel('aggregated-liquidations'), null)
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(
        isIndicatorSupportedOnInterval('aggregated-liquidations', interval),
        true,
      )
      const option = buildMarketIndicatorOptions(interval).find(
        (item) => item.value === 'aggregated-liquidations',
      )
      assert.equal(option?.label, 'Aggregated Liquidations')
      assert.equal(option?.disabled, false)
    }
  })

  it('does not widen the required VWAP context', () => {
    assert.equal(requiredVwapContextLevel(['aggregated-liquidations'], '1m'), 'daily')
    assert.equal(
      requiredVwapContextLevel(['aggregated-liquidations', 'yearly-vwap'], '1d'),
      'yearly',
    )
  })
})
