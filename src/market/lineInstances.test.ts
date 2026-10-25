import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_LINE_STROKE_OPACITY_PERCENT,
  createLineInstance,
  formatLineInstanceLabel,
  lineInstanceStrokeOpacityPercent,
  lineInstanceStrokeStyle,
  normalizeLineEndpoints,
  sanitizeLineInstances,
  setLineInstanceStrokeOpacity,
  setLineInstanceStrokeStyle,
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
      assert.match(formatLineInstanceLabel(first), /^Line \d+$/)
    }
  })

  it('defaults line stroke opacity to 100 and persists overrides independently', () => {
    const instance = createLineInstance({
      timeA: 10,
      priceA: 1,
      timeB: 20,
      priceB: 2,
    })!
    assert.equal(DEFAULT_LINE_STROKE_OPACITY_PERCENT, 100)
    assert.equal(lineInstanceStrokeOpacityPercent(instance), 100)

    const faded = setLineInstanceStrokeOpacity(instance, 40)
    assert.equal(faded.strokeOpacity, 40)
    assert.equal(lineInstanceStrokeOpacityPercent(faded), 40)
    // Other style fields are untouched by an opacity change.
    assert.equal(faded.strokeColor, instance.strokeColor)
    assert.equal(faded.lineStyle, instance.lineStyle)

    const restored = setLineInstanceStrokeOpacity(faded, DEFAULT_LINE_STROKE_OPACITY_PERCENT)
    assert.equal(restored.strokeOpacity, undefined)

    assert.equal(setLineInstanceStrokeOpacity(instance, 250).strokeOpacity, undefined)
  })

  it('migrates persisted dashed line styles to solid while keeping other fields', () => {
    const sanitized = sanitizeLineInstances([
      {
        id: 'line-legacy',
        timeA: 10,
        priceA: 1,
        timeB: 20,
        priceB: 2,
        displaySequence: 1,
        strokeColor: '#112233',
        strokeOpacity: 55,
        lineWidth: 3,
        lineStyle: 'dashed',
      },
    ])
    assert.equal(sanitized.length, 1)
    assert.equal(lineInstanceStrokeStyle(sanitized[0]), 'solid')
    assert.equal(sanitized[0].strokeColor, '#112233')
    assert.equal(sanitized[0].strokeOpacity, 55)
    assert.equal(sanitized[0].lineWidth, 3)
  })

  it('does not persist the retired dashed style through the setter', () => {
    const instance = createLineInstance({
      timeA: 10,
      priceA: 1,
      timeB: 20,
      priceB: 2,
    })!
    const dashed = setLineInstanceStrokeStyle(instance, 'dashed' as never)
    assert.equal(dashed.lineStyle, undefined)
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
