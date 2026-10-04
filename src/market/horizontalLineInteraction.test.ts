import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyHorizontalLineClick,
  armHorizontalLineTool,
  cancelHorizontalLineInteraction,
  INITIAL_HORIZONTAL_LINE_INTERACTION_STATE,
  isHorizontalLineToolArmed,
} from './horizontalLineInteraction.ts'
import { createHorizontalLineInstance } from './horizontalLineInstances.ts'

describe('horizontalLineInteraction', () => {
  it('arms and cancels one-shot placement', () => {
    const armed = armHorizontalLineTool()
    assert.equal(isHorizontalLineToolArmed(armed), true)
    const cancelled = cancelHorizontalLineInteraction(armed)
    assert.deepEqual(cancelled, INITIAL_HORIZONTAL_LINE_INTERACTION_STATE)
  })

  it('completes instance on valid click and exits armed state', () => {
    const armed = armHorizontalLineTool()
    const result = applyHorizontalLineClick(armed, 65_432.1, [])
    assert.equal(result.state.phase, 'inactive')
    assert.notEqual(result.completedInstance, null)
    assert.equal(result.completedInstance?.price, 65_432.1)
  })

  it('ignores invalid click price while armed', () => {
    const armed = armHorizontalLineTool()
    const result = applyHorizontalLineClick(armed, null, [])
    assert.equal(result.state.phase, 'armed')
    assert.equal(result.completedInstance, null)
  })

  it('deduplicates ids against existing instances', () => {
    const existing = createHorizontalLineInstance({ price: 1 })
    assert.notEqual(existing, null)
    const armed = armHorizontalLineTool()
    const result = applyHorizontalLineClick(armed, 2, [existing!])
    assert.notEqual(result.completedInstance, null)
    assert.notEqual(result.completedInstance?.id, existing!.id)
  })
})
