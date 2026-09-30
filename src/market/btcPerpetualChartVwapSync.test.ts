import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

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
    assert.doesNotMatch(block, /rollingVwaps/i)
    assert.doesNotMatch(block, /setRollingVwapLineSeriesVisible/)
  })
})

describe('syncVwapSeriesVisibility source', () => {
  it('syncs rolling instances through rollingVwapInstances helper', () => {
    assert.match(syncSource, /syncRollingVwapInstancesVisibility/)
    assert.doesNotMatch(syncSource, /bundle\.rollingVwap\b/)
  })
})
