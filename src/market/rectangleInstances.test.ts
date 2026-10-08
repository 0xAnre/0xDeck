import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createRectangleInstance,
  normalizeRectangleBounds,
  sanitizeRectangleInstances,
  setRectangleInstanceFillColor,
  setRectangleInstanceFillOpacity,
  setRectangleInstanceLocked,
  updateRectangleInstancesById,
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

  it('sanitizes lock, color, and opacity with legacy defaults', () => {
    const legacy = createRectangleInstance({
      fromTime: 10,
      toTime: 20,
      lowPrice: 1,
      highPrice: 2,
    })!
    const sanitizedLegacy = sanitizeRectangleInstances([legacy])[0]
    assert.equal(sanitizedLegacy.locked, undefined)
    assert.equal(sanitizedLegacy.fillColor, undefined)
    assert.equal(sanitizedLegacy.fillOpacity, undefined)

    const styled = sanitizeRectangleInstances([
      {
        ...legacy,
        locked: true,
        fillColor: '#aabbcc',
        fillOpacity: 35,
        fillColorBad: '#abc',
      },
    ])[0]
    assert.equal(styled.locked, true)
    assert.equal(styled.fillColor, '#aabbcc')
    assert.equal(styled.fillOpacity, 35)
  })

  it('updates lock and style fields per instance id', () => {
    const first = createRectangleInstance({
      fromTime: 10,
      toTime: 20,
      lowPrice: 1,
      highPrice: 2,
    })!
    const second = createRectangleInstance({
      fromTime: 30,
      toTime: 40,
      lowPrice: 3,
      highPrice: 4,
      existingIds: new Set([first.id]),
    })!
    const locked = updateRectangleInstancesById([first, second], first.id, (instance) =>
      setRectangleInstanceLocked(instance, true),
    )
    assert.equal(locked[0].locked, true)
    assert.equal(locked[1].locked, undefined)

    const colored = updateRectangleInstancesById(locked, second.id, (instance) =>
      setRectangleInstanceFillColor(instance, '#ff00ff'),
    )
    assert.equal(colored[1].fillColor, '#ff00ff')

    const opacity = updateRectangleInstancesById(colored, second.id, (instance) =>
      setRectangleInstanceFillOpacity(instance, 20),
    )
    assert.equal(opacity[1].fillOpacity, undefined)
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
      const styled = {
        ...instance,
        locked: true,
        fillColor: '#123456',
        fillOpacity: 55,
      }
      saveWidgetRectangleInstances('panel-a', [styled])
      saveWidgetRectangleInstances('panel-b', [])
      const loadedA = loadWidgetRectangleInstances('panel-a')[0]
      assert.equal(loadedA.locked, true)
      assert.equal(loadedA.fillColor, '#123456')
      assert.equal(loadedA.fillOpacity, 55)
      assert.equal(loadWidgetRectangleInstances('panel-b').length, 0)
      assert.ok(storage.has(WIDGET_RECTANGLE_INSTANCES_STORAGE_KEY))
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    }
  })
})
