import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  loadWidgetDottedLineInstances,
  saveWidgetDottedLineInstances,
  WIDGET_DOTTED_LINE_INSTANCES_STORAGE_KEY,
} from '../dottedLineInstancesStorage.ts'

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

describe('dottedLineInstancesStorage', () => {
  it('isolates instance lists per panel id', () => {
    const line = {
      id: 'dotted-line-a',
      fromTime: 100,
      fromPrice: 50_000,
      toTime: 200,
      toPrice: 51_000,
    }
    saveWidgetDottedLineInstances('panel-a', [line])
    assert.equal(loadWidgetDottedLineInstances('panel-a').length, 1)
    assert.equal(loadWidgetDottedLineInstances('panel-b').length, 0)
    const raw = memory.get(WIDGET_DOTTED_LINE_INSTANCES_STORAGE_KEY)
    assert.ok(raw?.includes('panel-a'))
  })

  it('drops malformed entries on save', () => {
    saveWidgetDottedLineInstances('panel-a', [
      {
        id: 'dotted-line-valid',
        fromTime: 100,
        fromPrice: 50_000,
        toTime: 200,
        toPrice: 51_000,
      },
      { id: 'nope', fromTime: 1, fromPrice: 1, toTime: 2, toPrice: 2 },
    ])
    assert.equal(loadWidgetDottedLineInstances('panel-a').length, 1)
  })
})
