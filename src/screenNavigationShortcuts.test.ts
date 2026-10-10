import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  createScreenNavigationSequenceHandler,
  findPanelNavigationElement,
  isEditableKeyboardTarget,
  PANEL_NAV_ID_ATTR,
  scrollToVisibleScreenAtIndex,
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

describe('findPanelNavigationElement', () => {
  it('returns the panel element marked with the navigation data attribute', () => {
    const container = {
      querySelector(selector: string) {
        if (selector === `[${PANEL_NAV_ID_ATTR}="chart-abc"]`) {
          return { id: 'chart-abc' }
        }
        return null
      },
    } as HTMLElement

    const found = findPanelNavigationElement(container, 'chart-abc')
    assert.equal((found as { id: string }).id, 'chart-abc')
    assert.equal(findPanelNavigationElement(null, 'chart-abc'), null)
  })
})

describe('scrollToVisibleScreenAtIndex', () => {
  it('no-ops when the target screen is missing and does not throw', () => {
    scrollToVisibleScreenAtIndex([], 0)
    scrollToVisibleScreenAtIndex([null], 0)
    scrollToVisibleScreenAtIndex([{} as HTMLElement], 4, () => {
      throw new Error('should not scroll')
    })
  })

  it('scrolls the element at the requested visible index', () => {
    const scrolled: HTMLElement[] = []
    const first = { id: 'a' } as HTMLElement
    const second = { id: 'b' } as HTMLElement
    scrollToVisibleScreenAtIndex([first, second], 1, (element) => {
      scrolled.push(element)
    })
    assert.deepEqual(scrolled, [second])
  })
})

describe('isEditableKeyboardTarget', () => {
  it('returns false for non-element targets', () => {
    assert.equal(isEditableKeyboardTarget(null), false)
    assert.equal(isEditableKeyboardTarget({}), false)
  })
})
