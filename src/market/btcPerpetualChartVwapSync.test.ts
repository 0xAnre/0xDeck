import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  ROLLING_VWAP_BAND_SERIES_KEYS,
  setRollingVwapChartSeriesVisibility,
  type RollingVwapChartSeriesBundle,
} from './rollingVwapChartSeries.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'

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

function miniRollingBundle(): RollingVwapChartSeriesBundle {
  const makeLine = () => ({ applyOptions: () => {} })
  const center = makeLine() as RollingVwapChartSeriesBundle['center']
  const bands = {} as RollingVwapChartSeriesBundle['bands']
  const ordered = [center]
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const series = makeLine() as RollingVwapChartSeriesBundle['bands'][typeof key]
    bands[key] = series
    ordered.push(series)
  }
  return { center, bands, ordered }
}

describe('rolling visibility after anchored hide', () => {
  it('remains driven by indicator selection (sync rolling branch contract)', () => {
    let centerVisible = false
    const rolling = miniRollingBundle()
    rolling.center.applyOptions = (opts: { visible?: boolean }) => {
      if (typeof opts.visible === 'boolean') centerVisible = opts.visible
    }
    setRollingVwapChartSeriesVisibility(rolling, {
      activeIndicators: ['rolling-vwap'],
      interval: '1m',
      settings: createDefaultRollingVwapSettings(),
    })
    assert.equal(centerVisible, true)
  })
})
