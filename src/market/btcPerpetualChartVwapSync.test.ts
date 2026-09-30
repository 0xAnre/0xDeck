import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  setRollingVwapLineSeriesVisible,
  shouldShowRollingVwapLineSeries,
} from './rollingVwapChartSeries.ts'

const syncSourcePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'btcPerpetualChartVwapSync.ts',
)
const syncSource = readFileSync(syncSourcePath, 'utf8')

function hideAllAnchoredBlock(): string {
  const match = syncSource.match(
    /export function hideAllAnchoredVwapSeries\(bundle: ChartSeriesBundle\): void \{[\s\S]*?\n\}/,
  )
  assert.ok(match, 'hideAllAnchoredVwapSeries must exist')
  return match[0]
}

describe('hideAllAnchoredVwapSeries', () => {
  it('does not call rolling VWAP visibility helpers', () => {
    const block = hideAllAnchoredBlock()
    assert.doesNotMatch(block, /rollingVwap/i)
    assert.doesNotMatch(block, /setRollingVwapLineSeriesVisible/)
  })
})

describe('rolling visibility after anchored hide', () => {
  it('remains driven by indicator selection (sync rolling branch contract)', () => {
    const visible: boolean[] = []
    const series = {
      applyOptions: (opts: { visible?: boolean }) => {
        if (typeof opts.visible === 'boolean') visible.push(opts.visible)
      },
    } as Parameters<typeof setRollingVwapLineSeriesVisible>[0]

    setRollingVwapLineSeriesVisible(
      series,
      shouldShowRollingVwapLineSeries(['rolling-vwap'], '1m'),
    )
    assert.deepEqual(visible, [true])
  })
})
