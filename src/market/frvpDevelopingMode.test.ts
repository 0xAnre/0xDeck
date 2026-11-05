import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import {
  DEFAULT_FRVP_LEVEL_RENDER_MODE,
  FRVP_LEVEL_RENDER_MODE_LABELS,
  FRVP_LEVEL_RENDER_MODES,
  frvpInstancePocMode,
  frvpInstanceValueAreaMode,
  frvpRenderModeShowsLine,
  frvpRenderModeShowsStep,
  isFrvpLevelRenderMode,
  sanitizeFrvpLevelRenderMode,
  setFrvpInstancePocMode,
  setFrvpInstanceValueAreaMode,
} from './frvpDevelopingMode.ts'

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

describe('frvpDevelopingMode', () => {
  it('defaults to the flat full-range line for both groups', () => {
    assert.equal(DEFAULT_FRVP_LEVEL_RENDER_MODE, 'line')
    assert.deepEqual([...FRVP_LEVEL_RENDER_MODES], ['line', 'step', 'both'])
    assert.equal(frvpInstanceValueAreaMode(instance()), 'line')
    assert.equal(frvpInstancePocMode(instance()), 'line')
  })

  it('resolves stored modes independently per group', () => {
    const valueAreaStep = instance({ valueAreaMode: 'step' })
    assert.equal(frvpInstanceValueAreaMode(valueAreaStep), 'step')
    assert.equal(frvpInstancePocMode(valueAreaStep), 'line')

    const pocBoth = instance({ pocMode: 'both' })
    assert.equal(frvpInstancePocMode(pocBoth), 'both')
    assert.equal(frvpInstanceValueAreaMode(pocBoth), 'line')
  })

  it('falls back to line for invalid stored values', () => {
    assert.equal(isFrvpLevelRenderMode('step'), true)
    assert.equal(isFrvpLevelRenderMode('both'), true)
    assert.equal(isFrvpLevelRenderMode('line'), true)
    assert.equal(isFrvpLevelRenderMode('staircase'), false)
    assert.equal(isFrvpLevelRenderMode(undefined), false)
    assert.equal(sanitizeFrvpLevelRenderMode('step'), 'step')
    assert.equal(sanitizeFrvpLevelRenderMode('nope'), undefined)
    assert.equal(
      frvpInstanceValueAreaMode(instance({ valueAreaMode: 'nope' as never })),
      'line',
    )
    assert.equal(frvpInstancePocMode(instance({ pocMode: null as never })), 'line')
  })

  it('maps every mode to its line and step halves', () => {
    assert.deepEqual(
      FRVP_LEVEL_RENDER_MODES.map((mode) => [mode, frvpRenderModeShowsLine(mode), frvpRenderModeShowsStep(mode)]),
      [
        ['line', true, false],
        ['step', false, true],
        ['both', true, true],
      ],
    )
  })

  it('stores non-default modes and clears the field on reset', () => {
    let next = setFrvpInstanceValueAreaMode(instance(), 'both')
    assert.equal(next.valueAreaMode, 'both')

    next = setFrvpInstancePocMode(next, 'step')
    assert.equal(next.pocMode, 'step')

    next = setFrvpInstanceValueAreaMode(next, 'line')
    next = setFrvpInstancePocMode(next, 'line')
    assert.equal(next.valueAreaMode, undefined)
    assert.equal(next.pocMode, undefined)
    assert.equal('valueAreaMode' in next, false)
    assert.equal('pocMode' in next, false)
  })

  it('ignores an invalid mode change and keeps the stored object', () => {
    const stored = instance({ valueAreaMode: 'step' })
    assert.equal(setFrvpInstanceValueAreaMode(stored, 'nope' as never), stored)
    assert.equal(setFrvpInstancePocMode(stored, 'nope' as never), stored)
  })

  it('labels the three modes for the settings dialog', () => {
    assert.deepEqual(
      FRVP_LEVEL_RENDER_MODES.map((mode) => FRVP_LEVEL_RENDER_MODE_LABELS[mode]),
      ['Line', 'Step', 'Both'],
    )
  })
})
