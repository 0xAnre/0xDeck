import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  armPanePointerClickForDoubleClick,
  attachPaneNativeDoubleClickIntervalObserver,
  cancelPanePointerClickForDoubleClick,
  commitPanePointerClickForDoubleClick,
  completePaneDoubleClickSequenceForSettings,
  consumeCompletedClickForDoubleClickSequence,
  FALLBACK_DOUBLE_CLICK_INTERVAL_MS,
  invalidatePanePointerClickForDoubleClickOnDrag,
  markPaneDoubleClickSequenceDragTainted,
  markPanePointerDragCommittedForSettingsSuppression,
  notePaneNativePrimaryClick,
  shouldSuppressChartObjectSettingsDoubleClick,
} from './paneDoubleClickPointerGuard.ts'

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
      consumeCompletedClickForDoubleClickSequence(
        pane,
        0,
        0,
        FALLBACK_DOUBLE_CLICK_INTERVAL_MS + 1,
      ),
      false,
    )
  })

  it('consumes the second press when native primary click extends the interval', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 10, 20, 0)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 700), true)
  })

  it('does not consume when native primary click is outside the double-click interval', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 10, 20, 0)
    assert.equal(
      consumeCompletedClickForDoubleClickSequence(
        pane,
        12,
        22,
        FALLBACK_DOUBLE_CLICK_INTERVAL_MS + 100,
      ),
      false,
    )
  })

  it('does not consume when native primary click expired before the second press', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 10, 20, 0)
    const muchLater = 60_000
    notePaneNativePrimaryClick(pane, 10, 20, muchLater)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, muchLater + 50), false)
  })

  it('does not pair a stale completed click with a newer native primary click', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 10, 20, 0)
    notePaneNativePrimaryClick(pane, 10, 20, 900)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 950), false)
  })

  it('keeps drawing completed click when an unrelated pane native click precedes double-click', () => {
    const pane = {} as HTMLElement
    notePaneNativePrimaryClick(pane, 200, 200, 100)
    armPanePointerClickForDoubleClick(pane, 10, 20, 200)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 10, 20, 200)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 250), true)
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
    markPanePointerDragCommittedForSettingsSuppression(pane, 30, 20)
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

  it('does not taint during pointer wobble before release classifies the gesture', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 15, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 15, 20, 50), false)
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
    markPanePointerDragCommittedForSettingsSuppression(pane, 30, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 30, 20), true)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 30, 20), false)
  })

  it('marks tainted when a drag is committed after pending click tracking', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    markPanePointerDragCommittedForSettingsSuppression(pane, 28, 22)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 28, 22), true)
  })

  it('does not suppress settings double-click after the double-click interval', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    markPanePointerDragCommittedForSettingsSuppression(pane, 30, 20, 0)
    assert.equal(
      shouldSuppressChartObjectSettingsDoubleClick(
        pane,
        30,
        20,
        FALLBACK_DOUBLE_CLICK_INTERVAL_MS + 1,
      ),
      false,
    )
  })

  it('does not suppress double-click far from the drag-tainted location', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    markPanePointerDragCommittedForSettingsSuppression(pane, 30, 20, 0)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 200, 200, 50), false)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 28, 22, 50), true)
  })

  it('taints settings suppression when a committed drag is marked tainted', () => {
    const pane = {} as HTMLElement
    markPaneDoubleClickSequenceDragTainted(pane, 5, 5, 0)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 5, 5, 100), true)
  })

  it('clears drag taint when a wobble resolves as a click', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 17, 20)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 17, 20, 50), false)
    commitPanePointerClickForDoubleClick(pane, { clientX: 10, clientY: 20, time: 10 })
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), true)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 12, 22, 100), false)
  })

  it('restores a completed click after wobble invalidates pending tracking', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    invalidatePanePointerClickForDoubleClickOnDrag(pane, 10, 20, 30, 20)
    commitPanePointerClickForDoubleClick(pane, { clientX: 10, clientY: 20, time: 10 })
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), true)
  })

  it('taints settings suppression when the second press of a double-click drags', () => {
    const pane = {} as HTMLElement
    armPanePointerClickForDoubleClick(pane, 10, 20, 0)
    commitPanePointerClickForDoubleClick(pane)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 12, 22, 100), true)
    markPaneDoubleClickSequenceDragTainted(pane, 12, 22, 150)
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 12, 22, 200), true)
  })

  it('preserves drag taint when a click commits near the drag release before dblclick', () => {
    const pane = {} as HTMLElement
    markPaneDoubleClickSequenceDragTainted(pane, 30, 20, 50)
    commitPanePointerClickForDoubleClick(pane, { clientX: 28, clientY: 22, time: 80 })
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 28, 22, 100), true)
  })

  it('clears drag taint when a click commit is outside the tainted sequence', () => {
    const pane = {} as HTMLElement
    markPaneDoubleClickSequenceDragTainted(pane, 30, 20, 50)
    commitPanePointerClickForDoubleClick(pane, { clientX: 200, clientY: 200, time: 80 })
    assert.equal(shouldSuppressChartObjectSettingsDoubleClick(pane, 30, 20, 100), false)
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

  it('does not shrink the interval after a fast native double-click', () => {
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
    notePaneNativePrimaryClick(pane, 5, 5, 0)
    listeners.get('click')?.({
      detail: 2,
      clientX: 5,
      clientY: 5,
      timeStamp: 300,
    } as MouseEvent)

    armPanePointerClickForDoubleClick(pane, 5, 5, 1000)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 5, 5, 1000)
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 5, 5, 1700), true)
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
    notePaneNativePrimaryClick(pane, 5, 5, 0)

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

  it('learns interval from the first native click after the second press consumes pointer state', () => {
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
    notePaneNativePrimaryClick(pane, 5, 5, 0)

    const secondPressTime = 700
    assert.equal(consumeCompletedClickForDoubleClickSequence(pane, 5, 5, secondPressTime), true)

    listeners.get('click')?.({
      detail: 2,
      clientX: 5,
      clientY: 5,
      timeStamp: 900,
    } as MouseEvent)

    completePaneDoubleClickSequenceForSettings(pane)

    const nextSequenceStart = 2000
    armPanePointerClickForDoubleClick(pane, 5, 5, nextSequenceStart)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 5, 5, nextSequenceStart)
    assert.equal(
      consumeCompletedClickForDoubleClickSequence(pane, 5, 5, nextSequenceStart + 850),
      true,
    )

    armPanePointerClickForDoubleClick(pane, 5, 5, 4000)
    commitPanePointerClickForDoubleClick(pane)
    notePaneNativePrimaryClick(pane, 5, 5, 4000)
    assert.equal(
      consumeCompletedClickForDoubleClickSequence(pane, 5, 5, 4000 + 1000),
      false,
    )
  })
})
