import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  claimRectangleKeyboardPanel,
  isActiveRectangleKeyboardPanel,
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
})
