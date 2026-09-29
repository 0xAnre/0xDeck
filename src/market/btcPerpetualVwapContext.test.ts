import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { vwapContextLevelSatisfiesLoaded } from './btcPerpetualVwapContext.ts'

describe('vwapContextLevelSatisfiesLoaded', () => {
  it('treats yearly as covering monthly', () => {
    assert.equal(vwapContextLevelSatisfiesLoaded('yearly', 'monthly'), true)
  })

  it('does not treat daily as covering weekly', () => {
    assert.equal(vwapContextLevelSatisfiesLoaded('daily', 'weekly'), false)
  })
})
