import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  armPanePointerClickForDoubleClick,
  cancelPanePointerClickForDoubleClick,
  commitPanePointerClickForDoubleClick,
  consumeCompletedClickForDoubleClickSequence,
  invalidatePanePointerClickForDoubleClickOnDrag,
  markPaneDoubleClickSequenceDragTainted,
  markPanePointerDragCommittedForSettingsSuppression,
  shouldSuppressChartObjectSettingsDoubleClick,
  attachPaneNativeDoubleClickIntervalObserver,
  FALLBACK_DOUBLE_CLICK_INTERVAL_MS,
} from './paneDoubleClickPointerGuard.ts'

const DOUBLE_CLICK_INTERVAL_MS = FALLBACK_DOUBLE_CLICK_INTERVAL_MS

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

  it('taints and clears completed click when a small committed drag exceeds click tolerance', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    markPanePointerDragCommittedForSettingsSuppression(pane, 10, 20, 50)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), false)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 12, 22, 100), true)
  })

  it('invalidates pending click when movement exceeds click tolerance but stays within double-click distance', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 15, 20, 0)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 15, 20, 50), true)
  })

  it('does not record a cancelled pending click', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    cancelPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), false)
  })
})

describe('shouldSuppressChartObjectSettingsDoubleClick', () => {
  it('suppresses once after a drag-tainted sequence near the drag release point', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 30, 20), true)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 30, 20), false)
  })

  it('marks tainted when drag invalidates pending click tracking', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 28, 22), true)
  })

  it('does not suppress settings double-click after the double-click interval', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20, 0)
    assert.equal(
      shouldSuppressChartObjectSettingsDoubleClick(
        pane,
        30,
        20,
        DOUBLE_CLICK_INTERVAL_MS + 1,
      ),
      false,
    )
  })

  it('does not suppress double-click far from the drag-tainted location', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20, 0)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 200, 200, 50), false)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 28, 22, 50), true)
  })

  it('taints settings suppression when a committed drag is marked tainted', () => {
    const pane = {} as HTMLElement
    markPaneDoubleClickSequenceDragTainted(pane, 5, 5, 0)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 5, 5, 100), true)
  })

  it('taints when pointer movement exceeds click tolerance but stays within double-click distance', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 17, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 17, 20, 50), true)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), false)
  })

  it('taints settings suppression when the second press of a double-click drags', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), true)
    markPaneDoubleClickSequenceDragTainted(pane, 12, 22, 150)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 12, 22, 200), true)
  })
})

describe('attachPaneNativeDoubleClickIntervalObserver', () => {
  it('uses a fallback interval wider than the legacy 500 ms default', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 0, 0, 0)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 0, 0, 750), true)

    const panePastFallback = {} as HTMLElement
    armPanePointerClickForDoubleClick(panePastFallback, 0, 0, 0)
    commitPanePointerClickForDoubleClick(panePastFallback)
    assert.equal(
      consumeCompletedClickForDoubleClickSequence(
        panePastFallback,
        0,
        0,
        FALLBACK_DOUBLE_CLICK_INTERVAL_MS + 1,
      ),
      false,
    )
  })

  it('learns a longer interval from native click detail >= 2', () => {
    const listeners = new Map<string, EventListener>()
    const pane = {
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type: string) => {
        listeners.delete(type)
      },
    } as unknown as HTMLElement

    attachPaneNativeDoubleClickIntervalObserver(pane)
    armPanePointerClickForDoubleClick(pane, 5, 5, 0)
    commitPanePointerClickForDoubleClick(pane)

    const secondPressTime = 1100
    assert.equal(
      consumeCompletedClickForDoubleClickSequence(pane, 5, 5, secondPressTime),
      false,
    )

    listeners.get('click')?.({
      detail: 2,
      clientX: 5,
      clientY: 5,
      timeStamp: secondPressTime,
    } as MouseEvent)

    assert.equal(
      consumeCompletedClickForDoubleClickSequence(pane, 5, 5, secondPressTime),
      true,
    )
  })
})
