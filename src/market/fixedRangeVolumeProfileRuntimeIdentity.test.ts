import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFixedRangeVolumeProfileReadyRuntime,
  buildFixedRangeVolumeProfileRequestIdentityKey,
  buildFixedRangeVolumeProfileRequestKey,
  isFixedRangeVolumeProfileRuntimeStateCurrent,
} from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import type {
  FixedRangeVolumeProfileRuntimeSnapshot,
  FixedRangeVolumeProfileRuntimeState,
} from './fixedRangeVolumeProfileRuntimeTypes.ts'

function instance(overrides: Partial<FixedRangeVolumeProfileInstance> = {}): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-1',
    fromTime: 100,
    toTime: 200,
    selectionInterval: '1m',
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
    ...overrides,
  }
}

function profile(fromTime: number, toTime: number): FixedRangeVolumeProfileResult {
  return {
    fromTime,
    toTime,
    candleCount: 1,
    profileLow: 100,
    profileHigh: 120,
    rowHeight: 20,
    rows: [
      {
        priceLow: 100,
        priceHigh: 120,
        upVolume: 5,
        downVolume: 5,
        totalVolume: 10,
        inValueArea: true,
      },
    ],
    totalVolume: 10,
    pocRowIndex: 0,
    pocPrice: 110,
    pocVolume: 10,
    vah: 115,
    val: 105,
    valueAreaVolume: 10,
    valueAreaPercentAchieved: 100,
  }
}

function readyState(
  target: FixedRangeVolumeProfileInstance,
  identityTimes?: { fromTime: number; toTime: number } | null,
): FixedRangeVolumeProfileRuntimeState {
  const identityKey = buildFixedRangeVolumeProfileRequestIdentityKey(target, identityTimes ?? null)
  const value = profile(target.fromTime, target.toTime)
  return {
    status: 'ready',
    instanceId: target.id,
    identityKey,
    requestStartTime: target.fromTime,
    requestEndTime: target.toTime,
    sourceInterval: '1m',
    profile: value,
    pipeline: {
      instanceId: target.id,
      requestStartTime: target.fromTime,
      requestEndTime: target.toTime,
      sourceInterval: '1m',
      profile: value,
    },
  }
}

describe('fixedRangeVolumeProfileRuntimeIdentity', () => {
  it('changes the request identity key when the selection times change', () => {
    const before = buildFixedRangeVolumeProfileRequestIdentityKey(instance())
    const after = buildFixedRangeVolumeProfileRequestIdentityKey(instance({ toTime: 260 }))
    assert.notEqual(before, after)
  })

  it('reuses an explicit identity-times override for preview validation', () => {
    const committed = instance()
    const preview = instance({ toTime: 260 })
    const state = readyState(committed)
    // Preview display bounds no longer match the loaded profile's identity.
    assert.equal(isFixedRangeVolumeProfileRuntimeStateCurrent(state, preview), false)
    // The override restores the committed identity so the preview keeps rendering.
    assert.equal(
      isFixedRangeVolumeProfileRuntimeStateCurrent(state, preview, {
        fromTime: committed.fromTime,
        toTime: committed.toTime,
      }),
      true,
    )
  })

  it('suppresses a ready profile after the committed range changes', () => {
    const previous = instance()
    const next = instance({ fromTime: 300, toTime: 400 })
    const runtime: FixedRangeVolumeProfileRuntimeSnapshot = { 'frvp-1': readyState(previous) }
    assert.deepEqual([...buildFixedRangeVolumeProfileReadyRuntime([next], runtime).keys()], [])
  })

  it('keeps a ready profile whose identity matches the current instance', () => {
    const current = instance()
    const runtime: FixedRangeVolumeProfileRuntimeSnapshot = { 'frvp-1': readyState(current) }
    const ready = buildFixedRangeVolumeProfileReadyRuntime([current], runtime)
    assert.deepEqual([...ready.keys()], ['frvp-1'])
  })

  it('keeps an intentional resize preview via the identity-times resolver', () => {
    const committed = instance()
    const preview = instance({ toTime: 260 })
    const runtime: FixedRangeVolumeProfileRuntimeSnapshot = { 'frvp-1': readyState(committed) }
    const ready = buildFixedRangeVolumeProfileReadyRuntime([preview], runtime, () => ({
      fromTime: committed.fromTime,
      toTime: committed.toTime,
    }))
    assert.deepEqual([...ready.keys()], ['frvp-1'])
  })

  it('ignores loading and error states', () => {
    const current = instance()
    const loading: FixedRangeVolumeProfileRuntimeState = {
      status: 'loading',
      instanceId: current.id,
      identityKey: buildFixedRangeVolumeProfileRequestIdentityKey(current),
    }
    const error: FixedRangeVolumeProfileRuntimeState = {
      status: 'error',
      instanceId: current.id,
      identityKey: buildFixedRangeVolumeProfileRequestIdentityKey(current),
      message: 'failed',
    }
    const runtime: FixedRangeVolumeProfileRuntimeSnapshot = { 'frvp-1': loading, 'frvp-2': error }
    assert.equal(buildFixedRangeVolumeProfileReadyRuntime([current], runtime).size, 0)
  })

  it('changes the identity key when extendRight changes', () => {
    const off = buildFixedRangeVolumeProfileRequestIdentityKey(instance())
    const on = buildFixedRangeVolumeProfileRequestIdentityKey(instance({ extendRight: true }))
    assert.notEqual(off, on)
  })

  it('does not change the identity key for unrelated state', () => {
    const base = instance()
    const withUnrelated = instance({ locked: true, displaySequence: 9 })
    assert.equal(
      buildFixedRangeVolumeProfileRequestIdentityKey(base),
      buildFixedRangeVolumeProfileRequestIdentityKey(withUnrelated),
    )
  })

  it('advances the request key with the live edge only when Extend Right is on', () => {
    const off = instance({ extendRight: false })
    assert.equal(
      buildFixedRangeVolumeProfileRequestKey(off, 500),
      buildFixedRangeVolumeProfileRequestKey(off, 900),
    )

    const on = instance({ extendRight: true })
    const before = buildFixedRangeVolumeProfileRequestKey(on, 500)
    const after = buildFixedRangeVolumeProfileRequestKey(on, 900)
    assert.notEqual(before, after)
    // The rendered/selection identity stays stable so the last profile keeps
    // rendering while the extended request is in flight.
    assert.equal(
      buildFixedRangeVolumeProfileRequestIdentityKey(on),
      buildFixedRangeVolumeProfileRequestIdentityKey(on),
    )
  })

  it('keeps the request key stable when the live edge is behind toTime', () => {
    const on = instance({ toTime: 500, extendRight: true })
    assert.equal(
      buildFixedRangeVolumeProfileRequestKey(on, 400),
      buildFixedRangeVolumeProfileRequestKey(on, null),
    )
  })
})
