import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyFixedRangeVolumeProfileClick,
  applyFixedRangeVolumeProfileCrosshairTime,
  armFixedRangeVolumeProfileTool,
  cancelFixedRangeVolumeProfileInteraction,
  INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
} from './fixedRangeVolumeProfileInteraction.ts'
import {
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
} from './fixedRangeVolumeProfileInstances.ts'

describe('fixedRangeVolumeProfileInteraction', () => {
  it('normalizes right-to-left selection on second click', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const first = applyFixedRangeVolumeProfileClick(armed, 200, [])
    const second = applyFixedRangeVolumeProfileClick(first.state, 100, [])
    assert.equal(second.completedInstance?.fromTime, 100)
    assert.equal(second.completedInstance?.toTime, 200)
  })

  it('does not create instance when both clicks share the same timestamp', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const first = applyFixedRangeVolumeProfileClick(armed, 100, [])
    const second = applyFixedRangeVolumeProfileClick(first.state, 100, [])
    assert.equal(second.completedInstance, null)
    assert.equal(second.state.phase, 'armed')
  })

  it('completes instance on two distinct clicks', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const first = applyFixedRangeVolumeProfileClick(armed, 100, [])
    const second = applyFixedRangeVolumeProfileClick(first.state, 150, [])
    assert.notEqual(second.completedInstance, null)
    assert.equal(second.state.phase, 'inactive')
  })

  it('updates preview only after first click', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const unchanged = applyFixedRangeVolumeProfileCrosshairTime(armed, 120)
    assert.equal(unchanged, armed)
    const preview = applyFixedRangeVolumeProfileClick(armed, 100, []).state
    const moved = applyFixedRangeVolumeProfileCrosshairTime(preview, 140)
    assert.equal(moved.draft?.previewTime, 140)
  })

  it('escape cancels draft selection', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const preview = applyFixedRangeVolumeProfileClick(armed, 100, []).state
    const cancelled = cancelFixedRangeVolumeProfileInteraction(preview)
    assert.deepEqual(cancelled, INITIAL_FIXED_RANGE_VP_INTERACTION_STATE)
  })

  it('escape before first click is a safe no-op', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const cancelled = cancelFixedRangeVolumeProfileInteraction(armed)
    assert.deepEqual(cancelled, INITIAL_FIXED_RANGE_VP_INTERACTION_STATE)
  })

  it('preserves multiple instances across completions', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const first = applyFixedRangeVolumeProfileClick(armed, 100, []).state
    const completed = applyFixedRangeVolumeProfileClick(first, 120, []).completedInstance!
    const second = applyFixedRangeVolumeProfileClick(
      armFixedRangeVolumeProfileTool(),
      200,
      [completed],
    ).state
    const secondCompleted = applyFixedRangeVolumeProfileClick(second, 240, [completed]).completedInstance!
    assert.equal(completed.fromTime, 100)
    assert.equal(secondCompleted.fromTime, 200)
  })

  it('applies default rowCount and valueAreaPercent', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const preview = applyFixedRangeVolumeProfileClick(armed, 10, []).state
    const completed = applyFixedRangeVolumeProfileClick(preview, 20, []).completedInstance!
    assert.equal(completed.rowCount, DEFAULT_FIXED_RANGE_VP_ROW_COUNT)
    assert.equal(completed.valueAreaPercent, DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT)
  })
})
