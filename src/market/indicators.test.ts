import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildMarketIndicatorOptions,
  DEFAULT_MARKET_INDICATORS,
  isIndicatorSupportedOnInterval,
  isMarketIndicatorId,
  requiredVwapContextLevel,
} from './indicators.ts'

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
