import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cancelActiveVwapContextRequest,
  isVwapContextAbortError,
  releaseOwnedVwapContextRequest,
} from './btcPerpetualVwapContextRequest.ts'

describe('isVwapContextAbortError', () => {
  it('accepts DOMException and Error abort names', () => {
    assert.equal(isVwapContextAbortError(new DOMException('aborted', 'AbortError')), true)
    assert.equal(isVwapContextAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' })), true)
    assert.equal(isVwapContextAbortError(new Error('network')), false)
  })
})

describe('vwap context request ownership', () => {
  it('cancels active request and bumps latest id', () => {
    const activeControllerRef = { current: new AbortController() }
    const latestRequestIdRef = { current: 5 }
    cancelActiveVwapContextRequest(activeControllerRef, latestRequestIdRef)
    assert.equal(activeControllerRef.current, null)
    assert.equal(latestRequestIdRef.current, 6)
  })

  it('releaseOwned only affects matching active controller and request id', () => {
    const controllerA = new AbortController()
    const controllerB = new AbortController()
    const activeControllerRef = { current: controllerB }
    const latestRequestIdRef = { current: 10 }

    releaseOwnedVwapContextRequest(activeControllerRef, latestRequestIdRef, {
      controller: controllerA,
      requestId: 9,
    })
    assert.equal(activeControllerRef.current, controllerB)
    assert.equal(latestRequestIdRef.current, 10)

    releaseOwnedVwapContextRequest(activeControllerRef, latestRequestIdRef, {
      controller: controllerB,
      requestId: 10,
    })
    assert.equal(activeControllerRef.current, null)
    assert.equal(latestRequestIdRef.current, 11)
  })

  it('stale cleanup does not bump id when a newer request already owns latest', () => {
    const controller = new AbortController()
    const activeControllerRef = { current: controller }
    const latestRequestIdRef = { current: 12 }

    releaseOwnedVwapContextRequest(activeControllerRef, latestRequestIdRef, {
      controller,
      requestId: 11,
    })
    assert.equal(activeControllerRef.current, null)
    assert.equal(latestRequestIdRef.current, 12)
  })
})
