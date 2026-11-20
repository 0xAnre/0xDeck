import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  runIndicatorSettingsGearClick,
  runMenuSettingsClick,
  toggleMarketIndicatorSelection,
} from './headerIndicatorMenuActions.ts'

describe('header menu settings gear', () => {
  it('closes the menu before opening the settings surface', () => {
    const calls: string[] = []
    runMenuSettingsClick({
      closeDropdown: () => calls.push('close'),
      onSettingsClick: () => calls.push('open'),
    })
    assert.deepEqual(calls, ['close', 'open'])
  })

  it('still closes the menu when no settings handler is wired', () => {
    let closed = 0
    runMenuSettingsClick({ closeDropdown: () => (closed += 1) })
    assert.equal(closed, 1)
  })

  it('passes the indicator id through the gear click', () => {
    const calls: string[] = []
    runIndicatorSettingsGearClick({
      indicatorId: 'rsi',
      closeDropdown: () => calls.push('close'),
      onIndicatorSettingsClick: (indicatorId) => calls.push(indicatorId),
    })
    assert.deepEqual(calls, ['close', 'rsi'])
  })

  it('keeps the indicator toggle selection order stable', () => {
    assert.deepEqual(toggleMarketIndicatorSelection([], 'rsi', true), ['rsi'])
    assert.deepEqual(toggleMarketIndicatorSelection(['rsi'], 'rsi', true), ['rsi'])
    assert.deepEqual(
      toggleMarketIndicatorSelection(['rsi', 'triple-ema'], 'rsi', false),
      ['triple-ema'],
    )
  })
})
