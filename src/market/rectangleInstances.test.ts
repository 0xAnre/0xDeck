import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createRectangleInstance,
  normalizeRectangleBounds,
  sanitizeRectangleInstances,
} from './rectangleInstances.ts'
import {
  loadWidgetRectangleInstances,
  saveWidgetRectangleInstances,
  WIDGET_RECTANGLE_INSTANCES_STORAGE_KEY,
} from '../rectangleInstancesStorage.ts'

describe('rectangleInstances', () => {
  it('normalizes time and price in every drag direction', () => {
    const bounds = normalizeRectangleBounds(200, 100, 90, 110)
    assert.deepEqual(bounds, { fromTime: 100, toTime: 200, lowPrice: 90, highPrice: 110 })
  })

  it('rejects zero-area rectangles', () => {
    assert.equal(normalizeRectangleBounds(100, 100, 90, 110), null)
    assert.equal(normalizeRectangleBounds(100, 200, 110, 110), null)
  })

  it('creates unique ids and sanitizes malformed records', () => {
    const first = createRectangleInstance({
      fromTime: 100,
      toTime: 120,
      lowPrice: 1,
      highPrice: 2,
    })
    const second = createRectangleInstance({
      fromTime: 130,
      toTime: 140,
      lowPrice: 3,
      highPrice: 4,
      existingIds: new Set(first ? [first.id] : []),
    })
    assert.notEqual(first?.id, second?.id)
    const sanitized = sanitizeRectangleInstances([
      first,
      second,
      { id: 'rect-dup', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 },
      { id: 'rect-dup', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 },
      { id: 'bad', fromTime: 1, toTime: 1, lowPrice: 1, highPrice: 2 },
      null,
    ])
    assert.equal(sanitized.length, 3)
  })

  it('persists per panel in localStorage', () => {
    const storage = new Map<string, string>()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
      },
    })
    try {
      const instance = createRectangleInstance({
        fromTime: 10,
        toTime: 20,
        lowPrice: 1,
        highPrice: 2,
      })!
      saveWidgetRectangleInstances('panel-a', [instance])
      saveWidgetRectangleInstances('panel-b', [])
      assert.equal(loadWidgetRectangleInstances('panel-a').length, 1)
      assert.equal(loadWidgetRectangleInstances('panel-b').length, 0)
      assert.ok(storage.has(WIDGET_RECTANGLE_INSTANCES_STORAGE_KEY))
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    }
  })
})
