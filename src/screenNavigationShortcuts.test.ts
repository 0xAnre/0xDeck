import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  createScreenNavigationSequenceHandler,
  isEditableKeyboardTarget,
  resolveWorkspaceScreenScrollTop,
  scrollToWorkspaceScreenAtIndex,
  type ScreenNavigationKeyEvent,
} from './screenNavigationShortcuts.ts'

const KEY_FROM_CODE: Record<string, string> = {
  KeyG: 'g',
  KeyA: 'a',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
}

function shortcutEvent(
  partial: Partial<ScreenNavigationKeyEvent> & Pick<ScreenNavigationKeyEvent, 'code'>,
): ScreenNavigationKeyEvent {
  const key = partial.key ?? KEY_FROM_CODE[partial.code] ?? partial.code
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key,
    code: partial.code,
    target: null,
    ...partial,
  }
}

describe('createScreenNavigationSequenceHandler', () => {
  it('maps g then 1 through g then 5 to zero-based indexes 0 through 4', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 1; digit <= 5; digit += 1) {
      assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)
      assert.equal(
        sequence.handleKeyDown(shortcutEvent({ code: `Digit${digit}` })),
        digit - 1,
      )
    }
    sequence.dispose()
  })

  it('does not navigate when pressing 1 through 5 without a preceding g', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 1; digit <= 5; digit += 1) {
      assert.equal(sequence.handleKeyDown(shortcutEvent({ code: `Digit${digit}` })), null)
    }
    sequence.dispose()
  })

  it('does not navigate after g when the timeout expires before a digit', () => {
    const timeoutMs = 50
    const sequence = createScreenNavigationSequenceHandler({ timeoutMs })
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)

    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        try {
          assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit1' })), null)
          sequence.dispose()
          resolve()
        } catch (error) {
          reject(error)
        }
      }, timeoutMs + 25)
    })
  })

  it('cancels the sequence after g then a non-matching key', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyA' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit2' })), null)
    sequence.dispose()
  })

  it('allows a new g to start a fresh sequence after cancellation', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyA' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit4' })), 3)
    sequence.dispose()
  })

  it('matches typed digit characters via event.key (e.g. AZERTY shift+digit)', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG', key: 'g' })), null)
    assert.equal(
      sequence.handleKeyDown(
        shortcutEvent({ code: 'Digit2', key: '2', shiftKey: true }),
      ),
      1,
    )
    sequence.dispose()
  })

  it('retains the sequence through a separate Shift keydown before a shifted digit', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG', key: 'g' })), null)
    assert.equal(
      sequence.handleKeyDown(
        shortcutEvent({ code: 'ShiftLeft', key: 'Shift', shiftKey: true }),
      ),
      null,
    )
    assert.equal(
      sequence.handleKeyDown(
        shortcutEvent({ code: 'Digit2', key: '2', shiftKey: true }),
      ),
      1,
    )
    sequence.dispose()
  })

  it('does not navigate from physical digit position when the typed character is not 1-5', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG', key: 'g' })), null)
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ code: 'Digit1', key: '&' })),
      null,
    )
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit3', key: '3' })), null)
    sequence.dispose()
  })

  it('arms the sequence when g is typed on a non-KeyG physical position (e.g. Dvorak)', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyI', key: 'g' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit4', key: '4' })), 3)
    sequence.dispose()
  })

  it('ignores Cmd+1 through Cmd+5 and Cmd+Option chords', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 1; digit <= 5; digit += 1) {
      assert.equal(
        sequence.handleKeyDown(shortcutEvent({ metaKey: true, code: `Digit${digit}` })),
        null,
      )
      assert.equal(
        sequence.handleKeyDown(
          shortcutEvent({ metaKey: true, altKey: true, code: `Digit${digit}` }),
        ),
        null,
      )
    }
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ metaKey: true, code: 'Digit2' })),
      null,
    )
    sequence.dispose()
  })

  it('ignores unrelated keys and modified g', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit6' })), null)
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ metaKey: true, code: 'KeyG' })),
      null,
    )
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ ctrlKey: true, code: 'KeyG' })),
      null,
    )
    sequence.dispose()
  })

  it('ignores shortcuts when the target is an editable field', () => {
    class FakeElement {
      tagName: string
      isContentEditable = false
      parent: FakeElement | null = null

      constructor(tagName: string, parent: FakeElement | null = null) {
        this.tagName = tagName
        this.parent = parent
      }

      closest(selector: string): FakeElement | null {
        if (selector === '[contenteditable]' && this.isContentEditable) return this
        return this.parent?.closest(selector) ?? null
      }
    }

    const originalHtmlElement = globalThis.HTMLElement
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: FakeElement,
    })

    const input = new FakeElement('INPUT')
    const textarea = new FakeElement('TEXTAREA')
    const select = new FakeElement('SELECT')
    const editable = new FakeElement('DIV')
    editable.isContentEditable = true

    for (const target of [input, textarea, select, editable]) {
      const sequence = createScreenNavigationSequenceHandler()
      assert.equal(
        sequence.handleKeyDown(shortcutEvent({ code: 'KeyG', target: target as never })),
        null,
      )
      assert.equal(
        sequence.handleKeyDown(shortcutEvent({ code: 'Digit3', target: target as never })),
        null,
      )
      sequence.dispose()
    }

    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: originalHtmlElement,
    })
  })

  it('clears pending state on dispose', () => {
    const sequence = createScreenNavigationSequenceHandler()
    const clearTimeoutSpy = mock.fn(globalThis.clearTimeout)
    const originalClearTimeout = globalThis.clearTimeout
    globalThis.clearTimeout = clearTimeoutSpy

    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)
    sequence.dispose()
    assert.equal(clearTimeoutSpy.mock.callCount(), 1)

    globalThis.clearTimeout = originalClearTimeout
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit1' })), null)
  })
})

describe('resolveWorkspaceScreenScrollTop', () => {
  const pageHeight = 800

  it('maps screen indexes 0 through 4 to exact page start offsets for Screens 1 through 5', () => {
    const container = { clientHeight: pageHeight, scrollHeight: pageHeight * 6 }
    assert.equal(resolveWorkspaceScreenScrollTop(container, 0), 0)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 1), pageHeight)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 2), pageHeight * 2)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 3), pageHeight * 3)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 4), pageHeight * 4)
  })

  it('does not depend on panel count or widget order', () => {
    const threePages = { clientHeight: pageHeight, scrollHeight: pageHeight * 3 }
    const manyWidgetsOneScreen = { clientHeight: pageHeight, scrollHeight: pageHeight * 3 }
    assert.equal(resolveWorkspaceScreenScrollTop(threePages, 1), pageHeight)
    assert.equal(resolveWorkspaceScreenScrollTop(manyWidgetsOneScreen, 2), pageHeight * 2)
  })

  it('sends g+2 and g+3 to Screen 2 and 3 starts when multiple widgets share Screen 1', () => {
    const container = { clientHeight: pageHeight, scrollHeight: pageHeight * 4 }
    assert.equal(resolveWorkspaceScreenScrollTop(container, 0), 0)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 1), pageHeight)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 2), pageHeight * 2)
  })

  it('no-ops for missing screens without throwing', () => {
    const twoPagesReachable = { clientHeight: pageHeight, scrollHeight: pageHeight * 2 }
    assert.equal(resolveWorkspaceScreenScrollTop(twoPagesReachable, 0), 0)
    assert.equal(resolveWorkspaceScreenScrollTop(twoPagesReachable, 1), pageHeight)
    assert.equal(resolveWorkspaceScreenScrollTop(twoPagesReachable, 2), null)
    assert.equal(resolveWorkspaceScreenScrollTop(twoPagesReachable, 4), null)

    const noScroll = { clientHeight: pageHeight, scrollHeight: pageHeight }
    assert.equal(resolveWorkspaceScreenScrollTop(noScroll, 0), 0)
    assert.equal(resolveWorkspaceScreenScrollTop(noScroll, 1), null)

    assert.equal(resolveWorkspaceScreenScrollTop({ clientHeight: 0, scrollHeight: 1000 }, 0), null)
    assert.equal(resolveWorkspaceScreenScrollTop({ clientHeight: pageHeight, scrollHeight: pageHeight * 2 }, -1), null)
    assert.equal(resolveWorkspaceScreenScrollTop({ clientHeight: pageHeight, scrollHeight: pageHeight * 2 }, 5), null)
  })
})

describe('scrollToWorkspaceScreenAtIndex', () => {
  it('scrolls to the exact top offset for the requested screen', () => {
    const pageHeight = 600
    const scrollCalls: { top: number; behavior?: ScrollBehavior }[] = []
    const container = {
      clientHeight: pageHeight,
      scrollHeight: pageHeight * 5,
      scrollTo(options: { top: number; behavior?: ScrollBehavior }) {
        scrollCalls.push(options)
      },
    }

    scrollToWorkspaceScreenAtIndex(container, 2)
    assert.deepEqual(scrollCalls, [{ top: pageHeight * 2, behavior: 'smooth' }])
  })

  it('no-ops when the target screen is missing and does not throw', () => {
    const container = {
      clientHeight: 500,
      scrollHeight: 500,
      scrollTo() {
        throw new Error('should not scroll')
      },
    }
    scrollToWorkspaceScreenAtIndex(container, 1)
    scrollToWorkspaceScreenAtIndex(container, 4)
  })
})

describe('isEditableKeyboardTarget', () => {
  it('returns false for non-element targets', () => {
    assert.equal(isEditableKeyboardTarget(null), false)
    assert.equal(isEditableKeyboardTarget({}), false)
  })
})
