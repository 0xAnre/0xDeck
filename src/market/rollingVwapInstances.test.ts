import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CANDLE_INTERVALS } from './types.ts'
import { rollingVwapAutoWindowMs } from './rollingVwap.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import {
  addRollingVwapInstance,
  createRollingVwapInstance,
  deleteRollingVwapInstance,
  findRollingVwapInstance,
  rollingVwapInstancePeriodLabel,
  sanitizeRollingVwapInstances,
  setRollingVwapInstanceEnabled,
  updateRollingVwapInstance,
} from './rollingVwapInstances.ts'

describe('rollingVwapInstances', () => {
  it('stores two instances with distinct settings on one panel list', () => {
    const first = createRollingVwapInstance({ id: 'a', randomId: () => 'x' })
    first.settings.minBars = 11
    const second = createRollingVwapInstance({
      id: 'b',
      existingIds: new Set(['a']),
      randomId: () => 'y',
    })
    second.settings.minBars = 22
    const list = addRollingVwapInstance(addRollingVwapInstance([], first), second)
    assert.equal(list.length, 2)
    assert.equal(list[0].settings.minBars, 11)
    assert.equal(list[1].settings.minBars, 22)
  })

  it('drops duplicate ids keeping the first valid instance', () => {
    const instances = sanitizeRollingVwapInstances([
      { id: 'dup', enabled: true, settings: createDefaultRollingVwapSettings() },
      { id: 'dup', enabled: false, settings: createDefaultRollingVwapSettings() },
      { id: 'ok', enabled: true, settings: createDefaultRollingVwapSettings() },
    ])
    assert.equal(instances.length, 2)
    assert.equal(instances[0].id, 'dup')
    assert.equal(instances[0].enabled, true)
  })

  it('add update delete and toggle only affect the targeted instance', () => {
    const a = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    const b = createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' })
    let list = addRollingVwapInstance(addRollingVwapInstance([], a), b)

    list = updateRollingVwapInstance(list, 'a', {
      settings: { ...list[0].settings, minBars: 40 },
    })
    assert.equal(findRollingVwapInstance(list, 'a')?.settings.minBars, 40)
    assert.equal(findRollingVwapInstance(list, 'b')?.settings.minBars, 10)

    list = setRollingVwapInstanceEnabled(list, 'b', false)
    assert.equal(findRollingVwapInstance(list, 'b')?.enabled, false)
    assert.equal(findRollingVwapInstance(list, 'a')?.enabled, true)

    list = deleteRollingVwapInstance(list, 'a')
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'b')
  })

  it('does not share mutable settings references between instances or clones', () => {
    const a = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    const b = createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' })
    const list = sanitizeRollingVwapInstances([a, b])
    assert.notEqual(list[0].settings, list[1].settings)
    assert.notEqual(list[0].settings.multipliers, list[1].settings.multipliers)
    list[0].settings.minBars = 99
    assert.equal(list[1].settings.minBars, 10)
    const found = findRollingVwapInstance(list, 'a')
    assert.notEqual(found?.settings, list[0].settings)
  })
})

describe('rollingVwapInstancePeriodLabel', () => {
  const base = createDefaultRollingVwapSettings()

  it('formats automatic windows for every chart timeframe', () => {
    const expected: Record<string, string> = {
      '1m': '1H',
      '5m': '4H',
      '30m': '1D',
      '4h': '3D',
      '1d': '1M',
      '1w': '90D',
    }
    for (const interval of CANDLE_INTERVALS) {
      const instance = createRollingVwapInstance({
        id: interval,
        settings: { ...base, fixedTimePeriod: { ...base.fixedTimePeriod, useFixedTimePeriod: false } },
        randomId: () => interval,
      })
      assert.equal(rollingVwapInstancePeriodLabel(instance, interval), expected[interval])
      assert.equal(rollingVwapAutoWindowMs(interval) > 0, true)
    }
  })

  it('formats fixed 1D, 4H, 30min and 0min labels', () => {
    const oneDay = createRollingVwapInstance({
      id: 'd',
      settings: {
        ...base,
        fixedTimePeriod: { useFixedTimePeriod: true, days: 1, hours: 0, minutes: 0 },
      },
      randomId: () => 'd',
    })
    const fourHours = createRollingVwapInstance({
      id: 'h',
      settings: {
        ...base,
        fixedTimePeriod: { useFixedTimePeriod: true, days: 0, hours: 4, minutes: 0 },
      },
      randomId: () => 'h',
    })
    const thirtyMin = createRollingVwapInstance({
      id: 'm',
      settings: {
        ...base,
        fixedTimePeriod: { useFixedTimePeriod: true, days: 0, hours: 0, minutes: 30 },
      },
      randomId: () => 'm',
    })
    const zero = createRollingVwapInstance({
      id: 'z',
      settings: {
        ...base,
        fixedTimePeriod: { useFixedTimePeriod: true, days: 0, hours: 0, minutes: 0 },
      },
      randomId: () => 'z',
    })

    assert.equal(rollingVwapInstancePeriodLabel(oneDay, '1m'), '1D')
    assert.equal(rollingVwapInstancePeriodLabel(fourHours, '1m'), '4H')
    assert.equal(rollingVwapInstancePeriodLabel(thirtyMin, '1m'), '30min')
    assert.equal(rollingVwapInstancePeriodLabel(zero, '1m'), '0min')
  })
})
