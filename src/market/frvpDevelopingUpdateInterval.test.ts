import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import {
  DEFAULT_FRVP_DEVELOPING_UPDATE_BARS,
  FRVP_DEVELOPING_UPDATE_BARS,
  frvpDevelopingUpdateBarsLabel,
  frvpInstanceDevelopingUpdateBars,
  isFrvpDevelopingUpdateBars,
  sanitizeFrvpDevelopingUpdateBars,
  setFrvpInstanceDevelopingUpdateBars,
} from './frvpDevelopingUpdateInterval.ts'

function instance(
  overrides: Partial<FixedRangeVolumeProfileInstance> = {},
): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-test',
    fromTime: 1_000,
    toTime: 2_000,
    selectionInterval: '1m',
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
    ...overrides,
  }
}

describe('frvpDevelopingUpdateInterval', () => {
  it('defaults to every bar with the documented allowed set', () => {
    assert.equal(DEFAULT_FRVP_DEVELOPING_UPDATE_BARS, 1)
    assert.deepEqual([...FRVP_DEVELOPING_UPDATE_BARS], [1, 3, 5, 10, 30, 60])
    assert.equal(frvpInstanceDevelopingUpdateBars(instance()), 1)
  })

  it('resolves a stored interval and rejects invalid values', () => {
    assert.equal(frvpInstanceDevelopingUpdateBars(instance({ developingUpdateBars: 10 })), 10)
    assert.equal(isFrvpDevelopingUpdateBars(1), true)
    assert.equal(isFrvpDevelopingUpdateBars(60), true)
    assert.equal(isFrvpDevelopingUpdateBars(2), false)
    assert.equal(isFrvpDevelopingUpdateBars('5'), false)
    assert.equal(isFrvpDevelopingUpdateBars(undefined), false)
    assert.equal(sanitizeFrvpDevelopingUpdateBars(30), 30)
    assert.equal(sanitizeFrvpDevelopingUpdateBars(2), undefined)
    assert.equal(
      frvpInstanceDevelopingUpdateBars(instance({ developingUpdateBars: 2 as never })),
      1,
    )
    assert.equal(
      frvpInstanceDevelopingUpdateBars(instance({ developingUpdateBars: null as never })),
      1,
    )
  })

  it('stores a non-default interval and clears the field on reset', () => {
    let next = setFrvpInstanceDevelopingUpdateBars(instance(), 10)
    assert.equal(next.developingUpdateBars, 10)
    assert.equal(frvpInstanceDevelopingUpdateBars(next), 10)

    next = setFrvpInstanceDevelopingUpdateBars(next, 1)
    assert.equal(next.developingUpdateBars, undefined)
    assert.equal('developingUpdateBars' in next, false)
    assert.equal(frvpInstanceDevelopingUpdateBars(next), 1)
  })

  it('ignores an invalid interval change', () => {
    const stored = instance({ developingUpdateBars: 5 })
    assert.equal(setFrvpInstanceDevelopingUpdateBars(stored, 7 as never), stored)
  })

  it('labels the interval for the settings dialog', () => {
    assert.equal(frvpDevelopingUpdateBarsLabel(1), 'Every bar (default)')
    assert.equal(frvpDevelopingUpdateBarsLabel(3), 'Every 3 bars')
    assert.equal(frvpDevelopingUpdateBarsLabel(60), 'Every 60 bars')
  })
})
