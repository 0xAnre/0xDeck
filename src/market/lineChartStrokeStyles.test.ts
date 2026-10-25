import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_LINE_CHART_STROKE_STYLE,
  LINE_CHART_STROKE_STYLE_LABELS,
  LINE_CHART_STROKE_STYLES,
  type LineChartStrokeStyle,
  isLineChartStrokeStyle,
  lineChartStrokeDashPattern,
  sanitizeLineChartStrokeStyle,
} from './lineChartStroke.ts'

describe('lineChartStroke styles', () => {
  it('offers exactly Line (solid) and Dot (dotted)', () => {
    assert.deepEqual([...LINE_CHART_STROKE_STYLES], ['solid', 'dotted'])
    assert.deepEqual(LINE_CHART_STROKE_STYLE_LABELS, { solid: 'Line', dotted: 'Dot' })
    assert.equal(isLineChartStrokeStyle('solid'), true)
    assert.equal(isLineChartStrokeStyle('dotted'), true)
    assert.equal(isLineChartStrokeStyle('dashed'), false)
  })

  it('defaults to solid, not the retired dashed style', () => {
    assert.equal(DEFAULT_LINE_CHART_STROKE_STYLE, 'solid')
  })

  it('migrates every persisted dashed value to solid', () => {
    assert.equal(sanitizeLineChartStrokeStyle('dashed'), 'solid')
    assert.equal(sanitizeLineChartStrokeStyle('solid'), 'solid')
    assert.equal(sanitizeLineChartStrokeStyle('dotted'), 'dotted')
    assert.equal(sanitizeLineChartStrokeStyle('weird'), undefined)
    assert.equal(sanitizeLineChartStrokeStyle(undefined), undefined)
  })

  it('returns dash patterns for the selectable styles only', () => {
    assert.deepEqual(lineChartStrokeDashPattern('solid'), [])
    assert.deepEqual(lineChartStrokeDashPattern('dotted'), [2, 3])
  })

  it('renders an unsanitized legacy dashed value as solid', () => {
    assert.deepEqual(lineChartStrokeDashPattern('dashed' as LineChartStrokeStyle), [])
  })
})
