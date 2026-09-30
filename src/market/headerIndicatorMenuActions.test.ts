import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  runIndicatorSettingsGearClick,
  toggleMarketIndicatorSelection,
} from '../widgetSettings/headerIndicatorMenuActions.ts'

describe('runIndicatorSettingsGearClick', () => {
  it('closes dropdown before invoking settings callback', () => {
    const order: string[] = []
    runIndicatorSettingsGearClick({
      indicatorId: 'rolling-vwap',
      closeDropdown: () => order.push('close'),
      onIndicatorSettingsClick: () => order.push('settings'),
    })
    assert.deepEqual(order, ['close', 'settings'])
  })

  it('invokes settings callback without changing indicator selection', () => {
    let settingsCalled = false
    runIndicatorSettingsGearClick({
      indicatorId: 'rolling-vwap',
      closeDropdown: () => {},
      onIndicatorSettingsClick: () => {
        settingsCalled = true
      },
    })
    assert.equal(settingsCalled, true)
  })
})

describe('toggleMarketIndicatorSelection', () => {
  it('preserves normal checkbox add and remove behavior', () => {
    assert.deepEqual(
      toggleMarketIndicatorSelection([], 'rolling-vwap', true),
      ['rolling-vwap'],
    )
    assert.deepEqual(
      toggleMarketIndicatorSelection(['rolling-vwap', 'daily-vwap'], 'rolling-vwap', false),
      ['daily-vwap'],
    )
    assert.deepEqual(
      toggleMarketIndicatorSelection(['rolling-vwap'], 'rolling-vwap', true),
      ['rolling-vwap'],
    )
  })
})
