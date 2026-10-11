import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  armPanePointerClickForDoubleClick,
  cancelPanePointerClickForDoubleClick,
  commitPanePointerClickForDoubleClick,
  consumeCompletedClickForDoubleClickSequence,
  invalidatePanePointerClickForDoubleClickOnDrag,
  markPaneDoubleClickSequenceDragTainted,
  shouldSuppressChartObjectSettingsDoubleClick,
} from './paneDoubleClickPointerGuard.ts'

const DOUBLE_CLICK_INTERVAL_MS = 500

describe('consumeCompletedClickForDoubleClickSequence', () => {
  it('consumes only the second press within interval and distance after a completed click', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), true)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 200), false)
  })

  it('does not consume when presses are too far apart in time', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 0, 0, 0)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(
      consumeCompletedClickForDoubleClickSequence(pane, 0, 0, DOUBLE_CLICK_INTERVAL_MS + 1),
      false,
    )
  })

  it('does not consume when presses are too far apart in position', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 0, 0, 0)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 100, 100, 50), false)
  })

  it('does not treat a drag as the first click of a double-click', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), false)
  })

  it('does not record a cancelled pending click', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    cancelPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), false)
  })
})

describe('shouldSuppressChartObjectSettingsDoubleClick', () => {
  it('suppresses once after a drag-tainted sequence', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane), true)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane), false)
  })

  it('marks tainted when drag invalidates pending click tracking', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane), true)
  })

  it('does not suppress settings double-click after the double-click interval', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20, 0)
    assert.equal(
      shouldSuppressChartObjectSettingsDoubleClick(pane, DOUBLE_CLICK_INTERVAL_MS + 1),
      false,
    )
  })

  it('does not taint settings suppression after an ordinary drag without a double-click sequence', () => {
    const pane = {} as HTMLElement
    markPaneDoubleClickSequenceDragTainted(pane)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane), false)
  })

  it('taints settings suppression when the second press of a double-click drags', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), true)
    markPaneDoubleClickSequenceDragTainted(pane, 150)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 200), true)
  })
})
