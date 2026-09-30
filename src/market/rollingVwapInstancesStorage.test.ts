import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createRollingVwapInstance } from './rollingVwapInstances.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import {
  hasWidgetRollingVwapInstancesEntry,
  loadWidgetRollingVwapInstances,
  saveWidgetRollingVwapInstances,
  WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY,
} from '../rollingVwapInstancesStorage.ts'

const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  globalThis.localStorage = {
    get length() {
      return memory.size
    },
    clear() {
      memory.clear()
    },
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
  }
})

afterEach(() => {
  memory.clear()
})

describe('rollingVwapInstancesStorage', () => {
  it('returns empty list when panel has no entry', () => {
    assert.equal(hasWidgetRollingVwapInstancesEntry('panel-a'), false)
    assert.deepEqual(loadWidgetRollingVwapInstances('panel-a'), [])
  })

  it('isolates instance lists per panel id', () => {
    const a = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    a.settings.minBars = 12
    const b = createRollingVwapInstance({ id: 'b', randomId: () => 'b' })
    b.settings.minBars = 34
    saveWidgetRollingVwapInstances('panel-a', [a])
    saveWidgetRollingVwapInstances('panel-b', [b])
    assert.equal(loadWidgetRollingVwapInstances('panel-a')[0].settings.minBars, 12)
    assert.equal(loadWidgetRollingVwapInstances('panel-b')[0].settings.minBars, 34)
  })

  it('distinguishes missing entry from deliberately saved empty list', () => {
    saveWidgetRollingVwapInstances('panel-empty', [])
    assert.equal(hasWidgetRollingVwapInstancesEntry('panel-empty'), true)
    assert.deepEqual(loadWidgetRollingVwapInstances('panel-empty'), [])
    assert.equal(hasWidgetRollingVwapInstancesEntry('panel-missing'), false)
  })

  it('survives corrupt JSON and sanitizes invalid instances', () => {
    memory.set(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY, '{bad-json')
    assert.deepEqual(loadWidgetRollingVwapInstances('panel-a'), [])

    memory.set(
      WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY,
      JSON.stringify({
        'panel-a': [
          { id: '', enabled: true, settings: {} },
          { id: 'ok', enabled: true, settings: createDefaultRollingVwapSettings() },
        ],
      }),
    )
    const loaded = loadWidgetRollingVwapInstances('panel-a')
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].id, 'ok')
  })

  it('does not let mutating a loaded list affect the next load', () => {
    const instance = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    saveWidgetRollingVwapInstances('panel-a', [instance])
    const loaded = loadWidgetRollingVwapInstances('panel-a')
    loaded[0].settings.minBars = 88
    loaded.push(
      createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' }),
    )
    const again = loadWidgetRollingVwapInstances('panel-a')
    assert.equal(again.length, 1)
    assert.equal(again[0].settings.minBars, 10)
  })
})
