import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createDottedLineInstance,
  sanitizeDottedLineInstances,
  type DottedLineInstance,
} from './dottedLineInstances.ts'

describe('dottedLineInstances', () => {
  it('sanitizes malformed persisted values', () => {
    const valid: DottedLineInstance = {
      id: 'dotted-line-abc',
      fromTime: 100,
      fromPrice: 50_000,
      toTime: 200,
      toPrice: 51_000,
    }
    const result = sanitizeDottedLineInstances([
      valid,
      { id: 'bad', fromTime: 1, fromPrice: 1, toTime: 2, toPrice: 2 },
      null,
      { id: 'dotted-line-dup', fromTime: 100, fromPrice: 1, toTime: 100, toPrice: 1 },
    ])
    assert.deepEqual(result, [valid])
  })

  it('creates instance with unique id', () => {
    const instance = createDottedLineInstance(
      { time: 100, price: 50_000 },
      { time: 200, price: 51_000 },
      new Set(['dotted-line-existing']),
    )
    assert.notEqual(instance, null)
    assert.match(instance?.id ?? '', /^dotted-line-/)
  })
})
