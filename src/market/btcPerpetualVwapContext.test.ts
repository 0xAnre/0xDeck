import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  shouldApplyVwapContextResponse,
  vwapContextLevelSatisfiesLoaded,
} from './btcPerpetualVwapContext.ts'

describe('vwapContextLevelSatisfiesLoaded', () => {
  it('treats yearly as covering monthly', () => {
    assert.equal(vwapContextLevelSatisfiesLoaded('yearly', 'monthly'), true)
  })

  it('does not treat daily as covering weekly', () => {
    assert.equal(vwapContextLevelSatisfiesLoaded('daily', 'weekly'), false)
  })
})

describe('shouldApplyVwapContextResponse', () => {
  it('rejects when indicator selection no longer needs the fetched context level', () => {
    assert.equal(
      shouldApplyVwapContextResponse({
        requestGeneration: 1,
        activeGeneration: 1,
        requestInterval: '4h',
        responseInterval: '4h',
        requestId: 2,
        latestRequestId: 2,
        requestContextLevel: 'quarterly',
        stillNeededContextLevel: 'monthly',
      }),
      false,
    )
  })

  it('accepts current response when still needed', () => {
    assert.equal(
      shouldApplyVwapContextResponse({
        requestGeneration: 1,
        activeGeneration: 1,
        requestInterval: '1d',
        responseInterval: '1d',
        requestId: 3,
        latestRequestId: 3,
        requestContextLevel: 'yearly',
        stillNeededContextLevel: 'yearly',
      }),
      true,
    )
  })
})
