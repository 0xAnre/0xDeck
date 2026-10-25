import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  createScreenNavigationSequenceHandler,
  isEditableKeyboardTarget,
  resolveLockedWorkspaceScreenScrollTop,
  resolveNearestWorkspaceScreenIndex,
  resolveWorkspaceScreenExtentHeight,
  resolveWorkspaceScreenScrollTop,
  scrollToWorkspaceScreenAtIndex,
  WORKSPACE_SCREEN_COUNT,
  type ScreenNavigationKeyEvent,
} from './screenNavigationShortcuts.ts'

const KEY_FROM_CODE: Record<string, string> = {
  KeyP: 'p',
  KeyA: 'a',
  KeyG: 'g',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
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
  it('maps p then 1 through p then 9 to zero-based indexes 0 through 8', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 1; digit <= WORKSPACE_SCREEN_COUNT; digit += 1) {
      assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)
      assert.equal(
        sequence.handleKeyDown(shortcutEvent({ code: `Digit${digit}` })),
        digit - 1,
      )
    }
    sequence.dispose()
  })

  it('does not navigate for p then 0', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit0' })), null)
    // The zero cancelled the sequence, so the next digit must not navigate either.
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit1' })), null)
    sequence.dispose()
  })

  it('does not navigate when pressing 1 through 9 without a preceding p', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 1; digit <= WORKSPACE_SCREEN_COUNT; digit += 1) {
      assert.equal(sequence.handleKeyDown(shortcutEvent({ code: `Digit${digit}` })), null)
    }
    sequence.dispose()
  })

  it('does not navigate after p when the timeout expires before a digit', () => {
    const timeoutMs = 50
    const sequence = createScreenNavigationSequenceHandler({ timeoutMs })
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)

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

  it('cancels the sequence after p then a non-matching key', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyA' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit2' })), null)
    sequence.dispose()
  })

  it('allows a new p to start a fresh sequence after cancellation', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyA' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit4' })), 3)
    sequence.dispose()
  })

  it('does not navigate when using the former g then 1 through 5 sequence', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 1; digit <= 5; digit += 1) {
      assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyG' })), null)
      assert.equal(sequence.handleKeyDown(shortcutEvent({ code: `Digit${digit}` })), null)
    }
    sequence.dispose()
  })

  it('navigates to screens 6 through 9 from shifted digits and alternate layouts', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 6; digit <= 9; digit += 1) {
      assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyR', key: 'p' })), null)
      assert.equal(
        sequence.handleKeyDown(
          shortcutEvent({ code: `Digit${digit}`, key: String(digit), shiftKey: true }),
        ),
        digit - 1,
      )
    }
    sequence.dispose()
  })

  it('matches typed digit characters via event.key (e.g. AZERTY shift+digit)', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP', key: 'p' })), null)
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
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP', key: 'p' })), null)
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
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP', key: 'p' })), null)
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ code: 'Digit1', key: '&' })),
      null,
    )
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit3', key: '3' })), null)
    sequence.dispose()
  })

  it('arms the sequence when p is typed on a non-KeyP physical position (e.g. alternate layout)', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyR', key: 'p' })), null)
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit4', key: '4' })), 3)
    sequence.dispose()
  })

  it('ignores Cmd+1 through Cmd+9 and Cmd+Option chords', () => {
    const sequence = createScreenNavigationSequenceHandler()
    for (let digit = 1; digit <= WORKSPACE_SCREEN_COUNT; digit += 1) {
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
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ metaKey: true, code: 'Digit2' })),
      null,
    )
    sequence.dispose()
  })

  it('ignores unrelated keys and modified p', () => {
    const sequence = createScreenNavigationSequenceHandler()
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit6' })), null)
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ metaKey: true, code: 'KeyP' })),
      null,
    )
    assert.equal(
      sequence.handleKeyDown(shortcutEvent({ ctrlKey: true, code: 'KeyP' })),
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
        sequence.handleKeyDown(shortcutEvent({ code: 'KeyP', target: target as never })),
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

    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'KeyP' })), null)
    sequence.dispose()
    assert.equal(clearTimeoutSpy.mock.callCount(), 1)

    globalThis.clearTimeout = originalClearTimeout
    assert.equal(sequence.handleKeyDown(shortcutEvent({ code: 'Digit1' })), null)
  })
})

describe('resolveWorkspaceScreenScrollTop', () => {
  const pageHeight = 800
  const nineScreens = {
    clientHeight: pageHeight,
    scrollHeight: resolveWorkspaceScreenExtentHeight(pageHeight),
  }

  it('maps screen indexes 0 through 8 to exact page start offsets for Screens 1 through 9', () => {
    for (let index = 0; index < WORKSPACE_SCREEN_COUNT; index += 1) {
      assert.equal(resolveWorkspaceScreenScrollTop(nineScreens, index), index * pageHeight)
    }
  })

  it('exposes all 9 screens even when the grid content is only one viewport tall', () => {
    const gridContentHeight = pageHeight
    // The wrapper inside the scroller keeps at least the virtual 9-screen extent.
    const emptyScreens = {
      clientHeight: pageHeight,
      scrollHeight: Math.max(gridContentHeight, resolveWorkspaceScreenExtentHeight(pageHeight)),
    }
    const reachable = Array.from({ length: WORKSPACE_SCREEN_COUNT }, (_, index) =>
      resolveWorkspaceScreenScrollTop(emptyScreens, index),
    )
    assert.deepEqual(reachable, [0, 800, 1600, 2400, 3200, 4000, 4800, 5600, 6400])
  })

  it('does not depend on panel count or widget order', () => {
    const threePages = { clientHeight: pageHeight, scrollHeight: pageHeight * 3 }
    const manyWidgetsOneScreen = { clientHeight: pageHeight, scrollHeight: pageHeight * 3 }
    assert.equal(resolveWorkspaceScreenScrollTop(threePages, 1), pageHeight)
    assert.equal(resolveWorkspaceScreenScrollTop(manyWidgetsOneScreen, 2), pageHeight * 2)
  })

  it('sends p+2 and p+3 to Screen 2 and 3 starts when multiple widgets share Screen 1', () => {
    const container = { clientHeight: pageHeight, scrollHeight: pageHeight * 4 }
    assert.equal(resolveWorkspaceScreenScrollTop(container, 0), 0)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 1), pageHeight)
    assert.equal(resolveWorkspaceScreenScrollTop(container, 2), pageHeight * 2)
  })

  it('clamps to max scroll when a screen starts within content but past the scroll range', () => {
    const partialSecondScreen = { clientHeight: pageHeight, scrollHeight: 1200 }
    assert.equal(resolveWorkspaceScreenScrollTop(partialSecondScreen, 0), 0)
    assert.equal(resolveWorkspaceScreenScrollTop(partialSecondScreen, 1), 400)
    assert.equal(resolveWorkspaceScreenScrollTop(partialSecondScreen, 2), null)
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
    assert.equal(resolveWorkspaceScreenScrollTop(nineScreens, -1), null)
    assert.equal(resolveWorkspaceScreenScrollTop(nineScreens, WORKSPACE_SCREEN_COUNT), null)
  })
})

describe('resolveWorkspaceScreenExtentHeight', () => {
  it('reserves exactly 9 viewports so empty screens stay reachable', () => {
    assert.equal(resolveWorkspaceScreenExtentHeight(800), 800 * WORKSPACE_SCREEN_COUNT)
    assert.equal(resolveWorkspaceScreenExtentHeight(517), 517 * WORKSPACE_SCREEN_COUNT)
  })

  it('reserves nothing before the workspace has a measurable viewport', () => {
    assert.equal(resolveWorkspaceScreenExtentHeight(0), 0)
    assert.equal(resolveWorkspaceScreenExtentHeight(-10), 0)
  })
})

describe('resolveNearestWorkspaceScreenIndex', () => {
  const pageHeight = 800
  const nineScreens = {
    clientHeight: pageHeight,
    scrollHeight: resolveWorkspaceScreenExtentHeight(pageHeight),
  }

  it('resolves exact screen tops to their own index', () => {
    for (let index = 0; index < WORKSPACE_SCREEN_COUNT; index += 1) {
      assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, index * pageHeight), index)
    }
  })

  it('resolves an arbitrary offset between two screens to the nearest screen', () => {
    assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, 390), 0)
    assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, 410), 1)
    assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, pageHeight * 3 + 700), 4)
    assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, pageHeight * 6 + 10), 6)
  })

  it('clamps to the first and last screen for out-of-range offsets', () => {
    assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, -500), 0)
    assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, pageHeight * 40), 8)
  })

  it('treats an unmeasurable workspace as screen 1 and never returns an unreachable screen', () => {
    assert.equal(resolveNearestWorkspaceScreenIndex({ clientHeight: 0, scrollHeight: 0 }, 900), 0)
    const twoPages = { clientHeight: pageHeight, scrollHeight: pageHeight * 2 }
    assert.equal(resolveNearestWorkspaceScreenIndex(twoPages, pageHeight), 1)
    assert.equal(resolveNearestWorkspaceScreenIndex(twoPages, pageHeight * 5), 1)
  })
})

describe('resolveLockedWorkspaceScreenScrollTop', () => {
  const pageHeight = 800
  const nineScreens = {
    clientHeight: pageHeight,
    scrollHeight: resolveWorkspaceScreenExtentHeight(pageHeight),
  }

  it('holds the exact top of every screen 1 through 9', () => {
    for (let index = 0; index < WORKSPACE_SCREEN_COUNT; index += 1) {
      assert.equal(resolveLockedWorkspaceScreenScrollTop(nineScreens, index), index * pageHeight)
    }
  })

  it('never rests between two screens: drift from a screen top always clamps back to that top', () => {
    for (const activeIndex of [0, 3, 7, 8]) {
      const lockedTop = resolveLockedWorkspaceScreenScrollTop(nineScreens, activeIndex)
      assert.equal(lockedTop, activeIndex * pageHeight)
      // Momentum/scrollbar drift below half a page keeps the same active screen and snaps back.
      for (const drift of [-pageHeight / 2 + 1, -37, 0, 37, pageHeight / 2 - 1]) {
        const drifted = (lockedTop ?? 0) + drift
        assert.equal(resolveNearestWorkspaceScreenIndex(nineScreens, drifted), activeIndex)
        assert.equal(
          resolveLockedWorkspaceScreenScrollTop(nineScreens, activeIndex),
          lockedTop,
        )
      }
    }
  })

  it('clamps into the scroll range when the extent is shorter than the requested screen', () => {
    const shortExtent = { clientHeight: pageHeight, scrollHeight: 1200 }
    assert.equal(resolveLockedWorkspaceScreenScrollTop(shortExtent, 0), 0)
    assert.equal(resolveLockedWorkspaceScreenScrollTop(shortExtent, 1), 400)
    assert.equal(resolveLockedWorkspaceScreenScrollTop(shortExtent, 5), 400)
  })

  it('returns null when the screen cannot be represented', () => {
    assert.equal(resolveLockedWorkspaceScreenScrollTop({ clientHeight: 0, scrollHeight: 0 }, 0), null)
    assert.equal(resolveLockedWorkspaceScreenScrollTop(nineScreens, -1), null)
    assert.equal(resolveLockedWorkspaceScreenScrollTop(nineScreens, WORKSPACE_SCREEN_COUNT), null)
    assert.equal(resolveLockedWorkspaceScreenScrollTop(nineScreens, 1.5), null)
  })

  it('re-aligns the active screen after a viewport resize', () => {
    const beforeResize = {
      clientHeight: 800,
      scrollHeight: resolveWorkspaceScreenExtentHeight(800),
    }
    // Toggling ON at an arbitrary offset picks the nearest screen once, then resize keeps it.
    const activeIndex = resolveNearestWorkspaceScreenIndex(beforeResize, 1700)
    assert.equal(activeIndex, 2)

    const afterResize = {
      clientHeight: 700,
      scrollHeight: resolveWorkspaceScreenExtentHeight(700),
    }
    assert.equal(
      resolveLockedWorkspaceScreenScrollTop(afterResize, activeIndex),
      1400,
    )
    assert.equal(
      resolveNearestWorkspaceScreenIndex(afterResize, 1400),
      activeIndex,
    )
  })
})

describe('scrollToWorkspaceScreenAtIndex', () => {
  it('scrolls to the exact top offset for the requested screen', () => {
    const pageHeight = 600
    const scrollCalls: { top: number; behavior?: ScrollBehavior }[] = []
    const container = {
      clientHeight: pageHeight,
      scrollHeight: resolveWorkspaceScreenExtentHeight(pageHeight),
      scrollTop: 0,
      scrollTo(options: { top: number; behavior?: ScrollBehavior }) {
        scrollCalls.push(options)
      },
    }

    scrollToWorkspaceScreenAtIndex(container, 2)
    assert.deepEqual(scrollCalls, [{ top: pageHeight * 2, behavior: 'smooth' }])
  })

  it('jumps without animation when Screen Lock requests instant alignment', () => {
    const pageHeight = 600
    const scrollCalls: { top: number; behavior?: ScrollBehavior }[] = []
    const container = {
      clientHeight: pageHeight,
      scrollHeight: resolveWorkspaceScreenExtentHeight(pageHeight),
      scrollTop: 0,
      scrollTo(options: { top: number; behavior?: ScrollBehavior }) {
        scrollCalls.push(options)
      },
    }

    scrollToWorkspaceScreenAtIndex(container, 8, { behavior: 'auto' })
    assert.deepEqual(scrollCalls, [{ top: pageHeight * 8, behavior: 'auto' }])
  })

  it('no-ops when the target screen is missing and does not throw', () => {
    const container = {
      clientHeight: 500,
      scrollHeight: 500,
      scrollTop: 0,
      scrollTo() {
        throw new Error('should not scroll')
      },
    }
    scrollToWorkspaceScreenAtIndex(container, 1)
    scrollToWorkspaceScreenAtIndex(container, 8)
  })

  it('scrolls to clamped offset for a partially filled final screen', () => {
    const scrollCalls: { top: number; behavior?: ScrollBehavior }[] = []
    const container = {
      clientHeight: 800,
      scrollHeight: 1200,
      scrollTop: 0,
      scrollTo(options: { top: number; behavior?: ScrollBehavior }) {
        scrollCalls.push(options)
      },
    }
    scrollToWorkspaceScreenAtIndex(container, 1)
    assert.deepEqual(scrollCalls, [{ top: 400, behavior: 'smooth' }])
  })
})

describe('isEditableKeyboardTarget', () => {
  it('returns false for non-element targets', () => {
    assert.equal(isEditableKeyboardTarget(null), false)
    assert.equal(isEditableKeyboardTarget({}), false)
  })
})
