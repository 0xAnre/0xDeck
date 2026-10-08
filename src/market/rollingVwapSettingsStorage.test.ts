import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import {
  loadWidgetRollingVwapSettings,
  saveWidgetRollingVwapSettings,
  WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY,
} from '../rollingVwapSettingsStorage.ts'

const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  globalThis.localStorage = {
    get length() {
      return memory.size
    },
    clear() {
      memory.clear()
    },
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
  }
})

afterEach(() => {
  memory.clear()
})

describe('rollingVwapSettingsStorage', () => {
  it('returns defaults when panel has no saved entry', () => {
    const settings = loadWidgetRollingVwapSettings('panel-a')
    assert.equal(settings.minBars, 10)
    assert.equal(settings.infoBox.size, 'small')
  })

  it('isolates settings per panel id', () => {
    const a = createDefaultRollingVwapSettings()
    a.minBars = 15
    const b = createDefaultRollingVwapSettings()
    b.minBars = 22

    saveWidgetRollingVwapSettings('panel-a', a)
    saveWidgetRollingVwapSettings('panel-b', b)

    assert.equal(loadWidgetRollingVwapSettings('panel-a').minBars, 15)
    assert.equal(loadWidgetRollingVwapSettings('panel-b').minBars, 22)
  })

  it('returns defaults when stored JSON is corrupt', () => {
    memory.set(WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY, '{not-json')
    assert.equal(loadWidgetRollingVwapSettings('panel-a').minBars, 10)
  })

  it('mutating a loaded settings object does not affect the next load', () => {
    saveWidgetRollingVwapSettings('panel-a', createDefaultRollingVwapSettings())
    const loaded = loadWidgetRollingVwapSettings('panel-a')
    loaded.minBars = 99
    loaded.infoBox.visible = false
    assert.equal(loadWidgetRollingVwapSettings('panel-a').minBars, 10)
    assert.equal(loadWidgetRollingVwapSettings('panel-a').infoBox.visible, true)
  })

  it('round-trips lineWidth through panel storage', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.lineWidth = 3
    saveWidgetRollingVwapSettings('panel-a', settings)
    assert.equal(loadWidgetRollingVwapSettings('panel-a').lineWidth, 3)
  })

  it('round-trips center-line presentation through panel storage', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.lineColor = '#abcdef'
    settings.lineOpacity = 40
    settings.lineStyle = 'dotted'
    saveWidgetRollingVwapSettings('panel-a', settings)
    const loaded = loadWidgetRollingVwapSettings('panel-a')
    assert.equal(loaded.lineColor, '#abcdef')
    assert.equal(loaded.lineOpacity, 40)
    assert.equal(loaded.lineStyle, 'dotted')
  })

  it('loads legacy settings without lineWidth at width 1', () => {
    const legacy = createDefaultRollingVwapSettings()
    memory.set(
      WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          fixedTimePeriod: legacy.fixedTimePeriod,
          minBars: legacy.minBars,
          multipliers: legacy.multipliers,
          bandColors: legacy.bandColors,
          infoBox: legacy.infoBox,
        },
      }),
    )
    assert.equal(loadWidgetRollingVwapSettings('panel-a').lineWidth, 1)
  })

  it('loads legacy settings without center-line presentation fields', () => {
    const legacy = createDefaultRollingVwapSettings()
    memory.set(
      WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          fixedTimePeriod: legacy.fixedTimePeriod,
          minBars: legacy.minBars,
          multipliers: legacy.multipliers,
          bandColors: legacy.bandColors,
          infoBox: legacy.infoBox,
          lineWidth: 2,
        },
      }),
    )
    const loaded = loadWidgetRollingVwapSettings('panel-a')
    assert.equal(loaded.lineWidth, 2)
    assert.equal(loaded.lineColor, '#9e9e9e')
    assert.equal(loaded.lineOpacity, 100)
    assert.equal(loaded.lineStyle, 'solid')
  })
})
