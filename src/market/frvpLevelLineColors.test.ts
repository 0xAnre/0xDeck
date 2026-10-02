import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FRVP_POC_LINE_SEMANTIC_CSS_VAR,
  FRVP_POC_LINE_STROKE_OPACITY,
  readFrvpPocLineStrokeStyle,
} from './frvpLevelLineColors.ts'

describe('frvpLevelLineColors', () => {
  it('routes POC stroke through the down semantic token', () => {
    assert.equal(FRVP_POC_LINE_SEMANTIC_CSS_VAR, '--down')
  })

  it('applies POC stroke opacity when resolving without document', () => {
    const stroke = readFrvpPocLineStrokeStyle()
    assert.match(stroke, new RegExp(`,\\s*${FRVP_POC_LINE_STROKE_OPACITY}\\)$`))
  })
})
