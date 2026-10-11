import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldSuppressPanePointerDownForDoubleClick } from './paneDoubleClickPointerGuard.ts'

const DOUBLE_CLICK_INTERVAL_MS = 500

describe('shouldSuppressPanePointerDownForDoubleClick', () => {
  it('suppresses only the second press within interval and distance', () => {
    const pane = {} as HTMLElement
    assert.equal(shouldSuppressPanePointerDownForDoubleClick(pane, 10, 20, 0), false)
    assert.equal(shouldSuppressPanePointerDownForDoubleClick(pane, 12, 22, 100), true)
    assert.equal(shouldSuppressPanePointerDownForDoubleClick(pane, 12, 22, 200), false)
  })

  it('does not suppress when presses are too far apart in time', () => {
    const pane = {} as HTMLElement
    assert.equal(shouldSuppressPanePointerDownForDoubleClick(pane, 0, 0, 0), false)
    assert.equal(
      shouldSuppressPanePointerDownForDoubleClick(pane, 0, 0, DOUBLE_CLICK_INTERVAL_MS + 1),
      false,
    )
  })

  it('does not suppress when presses are too far apart in position', () => {
    const pane = {} as HTMLElement
    assert.equal(shouldSuppressPanePointerDownForDoubleClick(pane, 0, 0, 0), false)
    assert.equal(
      shouldSuppressPanePointerDownForDoubleClick(pane, 100, 100, 50),
      false,
    )
  })
})
