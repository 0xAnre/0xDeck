import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createLineInstance,
  formatLineInstanceLabel,
  normalizeLineEndpoints,
  sanitizeLineInstances,
} from './lineInstances.ts'
import {
  loadWidgetLineInstances,
  saveWidgetLineInstances,
  WIDGET_LINE_INSTANCES_STORAGE_KEY,
} from '../lineInstancesStorage.ts'

describe('lineInstances', () => {
  it('normalizes endpoints and rejects degenerate lines', () => {
    const endpoints = normalizeLineEndpoints(200, 10, 100, 20)
    assert.deepEqual(endpoints, { timeA: 200, priceA: 10, timeB: 100, priceB: 20 })
    assert.equal(normalizeLineEndpoints(100, 10, 100, 10), null)
  })

  it('creates unique ids and sanitizes malformed records', () => {
    const first = createLineInstance({
      timeA: 100,
      priceA: 1,
      timeB: 120,
      priceB: 2,
    })
    const second = createLineInstance({
      timeA: 130,
      priceA: 3,
      timeB: 140,
      priceB: 4,
      existingIds: new Set(first ? [first.id] : []),
    })
    assert.notEqual(first?.id, second?.id)
    const sanitized = sanitizeLineInstances([
      first,
      second,
      { id: 'line-dup', timeA: 1, priceA: 1, timeB: 2, priceB: 2 },
      { id: 'line-dup', timeA: 1, priceA: 1, timeB: 2, priceB: 2 },
      { id: 'bad', timeA: 1, priceA: 1, timeB: 1, priceB: 1 },
      null,
    ])
    assert.equal(sanitized.length, 3)
    if (first) {
      assert.ok(formatLineInstanceLabel(first).includes('→'))
    }
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
      const instance = createLineInstance({
        timeA: 10,
        priceA: 1,
        timeB: 20,
        priceB: 2,
      })!
      saveWidgetLineInstances('panel-a', [instance])
      saveWidgetLineInstances('panel-b', [])
      assert.equal(loadWidgetLineInstances('panel-a').length, 1)
      assert.equal(loadWidgetLineInstances('panel-b').length, 0)
      assert.ok(storage.has(WIDGET_LINE_INSTANCES_STORAGE_KEY))
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    }
  })
})
