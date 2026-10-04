import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyDottedLineClick,
  applyDottedLineCrosshairAnchor,
  armDottedLineTool,
  cancelDottedLineInteraction,
  INITIAL_DOTTED_LINE_INTERACTION_STATE,
} from './dottedLineInteraction.ts'

const anchor = (time: number, price: number) => ({ time, price })

describe('dottedLineInteraction', () => {
  it('completes instance on two distinct clicks', () => {
    const armed = armDottedLineTool()
    const first = applyDottedLineClick(armed, anchor(100, 50_000), [])
    const second = applyDottedLineClick(first.state, anchor(150, 51_000), [])
    assert.notEqual(second.completedInstance, null)
    assert.equal(second.state.phase, 'inactive')
    assert.equal(second.completedInstance?.fromTime, 100)
    assert.equal(second.completedInstance?.toPrice, 51_000)
  })

  it('does not create instance when both anchors are identical', () => {
    const armed = armDottedLineTool()
    const first = applyDottedLineClick(armed, anchor(100, 50_000), [])
    const second = applyDottedLineClick(first.state, anchor(100, 50_000), [])
    assert.equal(second.completedInstance, null)
    assert.equal(second.state.phase, 'armed')
  })

  it('updates preview only after first click', () => {
    const armed = armDottedLineTool()
    const unchanged = applyDottedLineCrosshairAnchor(armed, anchor(120, 50_100))
    assert.equal(unchanged, armed)
    const preview = applyDottedLineClick(armed, anchor(100, 50_000), []).state
    const moved = applyDottedLineCrosshairAnchor(preview, anchor(140, 50_200))
    assert.equal(moved.draft?.preview.time, 140)
    assert.equal(moved.draft?.preview.price, 50_200)
  })

  it('escape cancels draft selection', () => {
    const armed = armDottedLineTool()
    const preview = applyDottedLineClick(armed, anchor(100, 50_000), []).state
    const cancelled = cancelDottedLineInteraction(preview)
    assert.deepEqual(cancelled, INITIAL_DOTTED_LINE_INTERACTION_STATE)
  })

  it('ignores invalid click coordinates', () => {
    const armed = armDottedLineTool()
    const result = applyDottedLineClick(armed, anchor(-1, 50_000), [])
    assert.equal(result.completedInstance, null)
    assert.equal(result.state.phase, 'armed')
  })
})
