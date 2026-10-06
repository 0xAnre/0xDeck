import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildMarketIndicatorOptions,
  DEFAULT_MARKET_INDICATORS,
  indicatorContextLevel,
  isIndicatorSupportedOnInterval,
  isMarketIndicatorId,
  MARKET_INDICATOR_DEFINITIONS,
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

  it('accepts sma-20', () => {
    assert.equal(isMarketIndicatorId('sma-20'), true)
  })

  it('accepts sma-50', () => {
    assert.equal(isMarketIndicatorId('sma-50'), true)
  })

  it('accepts sma-100', () => {
    assert.equal(isMarketIndicatorId('sma-100'), true)
  })

  it('accepts sma-200', () => {
    assert.equal(isMarketIndicatorId('sma-200'), true)
  })
})

describe('sma-20 registry', () => {
  it('is enabled on all six intervals with no context level', () => {
    const def = MARKET_INDICATOR_DEFINITIONS['sma-20']
    assert.equal(def.label, 'SMA 20')
    assert.equal(def.contextLevel, null)
    assert.equal(indicatorContextLevel('sma-20'), null)
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(isIndicatorSupportedOnInterval('sma-20', interval), true)
    }
  })
})

describe('sma-50 registry', () => {
  it('is enabled on all six intervals with no context level', () => {
    const def = MARKET_INDICATOR_DEFINITIONS['sma-50']
    assert.equal(def.label, 'SMA 50')
    assert.equal(def.contextLevel, null)
    assert.equal(indicatorContextLevel('sma-50'), null)
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(isIndicatorSupportedOnInterval('sma-50', interval), true)
    }
  })
})

describe('sma-100 registry', () => {
  it('is enabled on all six intervals with no context level', () => {
    const def = MARKET_INDICATOR_DEFINITIONS['sma-100']
    assert.equal(def.label, 'SMA 100')
    assert.equal(def.contextLevel, null)
    assert.equal(indicatorContextLevel('sma-100'), null)
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(isIndicatorSupportedOnInterval('sma-100', interval), true)
    }
  })
})

describe('sma-200 registry', () => {
  it('is enabled on all six intervals with no context level', () => {
    const def = MARKET_INDICATOR_DEFINITIONS['sma-200']
    assert.equal(def.label, 'SMA 200')
    assert.equal(def.contextLevel, null)
    assert.equal(indicatorContextLevel('sma-200'), null)
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(isIndicatorSupportedOnInterval('sma-200', interval), true)
    }
  })
})

describe('SMA indicator menu options', () => {
  it('lists independent SMA 20, SMA 50, SMA 100, and SMA 200 entries on every interval', () => {
    for (const interval of CANDLE_INTERVALS) {
      const options = buildMarketIndicatorOptions(interval)
      const sma20 = options.find((o) => o.value === 'sma-20')
      const sma50 = options.find((o) => o.value === 'sma-50')
      const sma100 = options.find((o) => o.value === 'sma-100')
      const sma200 = options.find((o) => o.value === 'sma-200')
      assert.equal(sma20?.label, 'SMA 20')
      assert.equal(sma20?.disabled, false)
      assert.equal(sma50?.label, 'SMA 50')
      assert.equal(sma50?.disabled, false)
      assert.equal(sma100?.label, 'SMA 100')
      assert.equal(sma100?.disabled, false)
      assert.equal(sma200?.label, 'SMA 200')
      assert.equal(sma200?.disabled, false)
    }
  })
})

describe('rolling-vwap registry', () => {
  it('is enabled on all six intervals with no context level', () => {
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
