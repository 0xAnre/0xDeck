import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  claimRectangleKeyboardPanel,
  isActiveRectangleKeyboardPanel,
  isRectangleKeyboardFocusOnOutsideControl,
} from './rectangleKeyboardScope.ts'

describe('rectangleKeyboardScope', () => {
  it('restores keyboard claim after portalled menu pointerdown clears it', () => {
    const panelId = 'btc-perpetual-chart-abc123'
    claimRectangleKeyboardPanel(panelId)
    assert.equal(isActiveRectangleKeyboardPanel(panelId), true)

    claimRectangleKeyboardPanel(null)
    assert.equal(isActiveRectangleKeyboardPanel(panelId), false)

    claimRectangleKeyboardPanel(panelId)
    assert.equal(isActiveRectangleKeyboardPanel(panelId), true)
  })

  it('treats focus on a control outside the chart as foreign', () => {
    class FakeElement {
      parent: FakeElement | null
      ownerDocument: { body: FakeElement; documentElement: FakeElement }

      constructor(parent: FakeElement | null = null) {
        this.parent = parent
        this.ownerDocument = { body: this, documentElement: this }
      }

      contains(node: FakeElement): boolean {
        let current: FakeElement | null = node
        while (current) {
          if (current === this) return true
          current = current.parent
        }
        return false
      }
    }

    const originalHtmlElement = globalThis.HTMLElement
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: FakeElement,
    })

    const body = new FakeElement()
    const chart = new FakeElement()
    const chartChild = new FakeElement(chart)
    const headerButton = new FakeElement()
    headerButton.ownerDocument = body.ownerDocument
    chart.ownerDocument = body.ownerDocument
    chartChild.ownerDocument = body.ownerDocument

    assert.equal(isRectangleKeyboardFocusOnOutsideControl(headerButton as never, chart as never), true)
    assert.equal(isRectangleKeyboardFocusOnOutsideControl(chartChild as never, chart as never), false)
    assert.equal(isRectangleKeyboardFocusOnOutsideControl(body as never, chart as never), false)

    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: originalHtmlElement,
    })
  })
})
