import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findPanelNavigationElement,
  isEditableKeyboardTarget,
  PANEL_NAV_ID_ATTR,
  resolveScreenIndexFromShortcut,
  scrollToVisibleScreenAtIndex,
  type ScreenNavigationKeyEvent,
} from './screenNavigationShortcuts.ts'

function shortcutEvent(
  partial: Partial<ScreenNavigationKeyEvent> & Pick<ScreenNavigationKeyEvent, 'code'>,
): ScreenNavigationKeyEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    code: partial.code,
    target: null,
    ...partial,
  }
}

describe('resolveScreenIndexFromShortcut', () => {
  it('maps Cmd+Option+1 through Cmd+Option+5 to zero-based indexes 0 through 4', () => {
    for (let digit = 1; digit <= 5; digit += 1) {
      const index = resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, altKey: true, code: `Digit${digit}` }),
      )
      assert.equal(index, digit - 1)
    }
  })

  it('ignores browser tab and macOS screenshot chords', () => {
    assert.equal(
      resolveScreenIndexFromShortcut(shortcutEvent({ metaKey: true, code: 'Digit1' })),
      null,
    )
    assert.equal(
      resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, shiftKey: true, code: 'Digit3' }),
      ),
      null,
    )
  })

  it('ignores non-meta keypresses and unrelated keys', () => {
    assert.equal(resolveScreenIndexFromShortcut(shortcutEvent({ code: 'Digit1' })), null)
    assert.equal(
      resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, altKey: true, code: 'Digit6' }),
      ),
      null,
    )
    assert.equal(
      resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, altKey: true, code: 'KeyA' }),
      ),
      null,
    )
    assert.equal(
      resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, altKey: true, ctrlKey: true, code: 'Digit2' }),
      ),
      null,
    )
    assert.equal(
      resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, altKey: true, shiftKey: true, code: 'Digit2' }),
      ),
      null,
    )
  })

  it('maps physical digit keys via event.code regardless of layout-specific key values', () => {
    assert.equal(
      resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, altKey: true, code: 'Digit1' }),
      ),
      0,
    )
    assert.equal(
      resolveScreenIndexFromShortcut(
        shortcutEvent({ metaKey: true, altKey: true, code: 'Digit3' }),
      ),
      2,
    )
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
      assert.equal(
        resolveScreenIndexFromShortcut(
          shortcutEvent({
            metaKey: true,
            altKey: true,
            code: 'Digit3',
            target: target as never,
          }),
        ),
        null,
      )
    }

    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: originalHtmlElement,
    })
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
