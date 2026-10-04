import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  loadWidgetHorizontalLineInstances,
  saveWidgetHorizontalLineInstances,
  WIDGET_HORIZONTAL_LINE_INSTANCES_STORAGE_KEY,
} from '../horizontalLineInstancesStorage.ts'
import {
  createHorizontalLineInstance,
  sanitizeHorizontalLineInstances,
} from './horizontalLineInstances.ts'

describe('horizontalLineInstances', () => {
  it('creates instances with unique ids and positive price', () => {
    const first = createHorizontalLineInstance({ price: 100_000 })
    const second = createHorizontalLineInstance({
      price: 99_000,
      existingIds: new Set([first!.id]),
    })
    assert.notEqual(first, null)
    assert.notEqual(second, null)
    assert.notEqual(first!.id, second!.id)
    assert.equal(first!.price, 100_000)
  })

  it('drops invalid, duplicate, and non-positive prices', () => {
    const valid = createHorizontalLineInstance({ price: 42 })
    const sanitized = sanitizeHorizontalLineInstances([
      valid,
      valid,
      { id: 'hline-bad', price: -1 },
      { id: 'not-hline', price: 10 },
      { id: 'hline-ok', price: 0 },
      { id: 'hline-good', price: 12.5 },
    ])
    assert.equal(sanitized.length, 2)
    assert.equal(sanitized[0]?.id, valid!.id)
    assert.equal(sanitized[1]?.price, 12.5)
  })
})

describe('horizontalLineInstances storage', () => {
  const panelA = 'panel-a'
  const panelB = 'panel-b'

  it('stores instances per widget panel', () => {
    const memory = new Map<string, string>()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value)
        },
        removeItem: (key: string) => {
          memory.delete(key)
        },
      },
    })

    const instance = createHorizontalLineInstance({ price: 50_000 })
    assert.notEqual(instance, null)
    saveWidgetHorizontalLineInstances(panelA, [instance!])
    saveWidgetHorizontalLineInstances(panelB, [])

    assert.equal(loadWidgetHorizontalLineInstances(panelA).length, 1)
    assert.equal(loadWidgetHorizontalLineInstances(panelB).length, 0)

    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    memory.delete(WIDGET_HORIZONTAL_LINE_INSTANCES_STORAGE_KEY)
  })

  it('returns empty list for invalid json', () => {
    const memory = new Map<string, string>([[WIDGET_HORIZONTAL_LINE_INSTANCES_STORAGE_KEY, '{']])
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value)
        },
        removeItem: (key: string) => {
          memory.delete(key)
        },
      },
    })
    assert.deepEqual(loadWidgetHorizontalLineInstances('any'), [])
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
  })
})
