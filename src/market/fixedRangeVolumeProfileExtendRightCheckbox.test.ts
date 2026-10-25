import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  loadWidgetFixedRangeVolumeProfileInstances,
  saveWidgetFixedRangeVolumeProfileInstances,
  WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY,
} from '../fixedRangeVolumeProfileInstancesStorage.ts'
import {
  createFixedRangeVolumeProfileInstance,
  sanitizeFixedRangeVolumeProfileInstances,
  setFixedRangeVolumeProfileInstanceExtendRight,
  updateFixedRangeVolumeProfileInstancesById,
  type FixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = path.resolve(HERE, '..')

function installMemoryLocalStorage(memory: Map<string, string>): () => void {
  const original = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    },
  })
  return () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
  }
}

describe('FRVP Extend right checkbox data path', () => {
  const panelId = 'panel-extend-right'

  // Mirrors persistFixedRangeVolumeProfileInstances in BtcPerpetualChartPanel.tsx:
  // sanitize -> save to localStorage.
  function persistLikePanel(instances: FixedRangeVolumeProfileInstance[]) {
    const sanitized = sanitizeFixedRangeVolumeProfileInstances(instances)
    saveWidgetFixedRangeVolumeProfileInstances(panelId, sanitized)
    return sanitized
  }

  // Mirrors handleFixedRangeVolumeProfileExtendRightChange in BtcPerpetualChartPanel.tsx.
  function toggleLikePanel(
    instances: readonly FixedRangeVolumeProfileInstance[],
    instanceId: string,
    extendRight: boolean,
  ) {
    return persistLikePanel(
      updateFixedRangeVolumeProfileInstancesById(instances, instanceId, (instance) =>
        setFixedRangeVolumeProfileInstanceExtendRight(instance, extendRight),
      ),
    )
  }

  it('new instances default Extend right on and the toggle round-trips', () => {
    const memory = new Map<string, string>()
    const restore = installMemoryLocalStorage(memory)
    try {
      const created = createFixedRangeVolumeProfileInstance({
        fromTime: 1_000,
        toTime: 2_000,
        selectionInterval: '1m',
      })
      assert.notEqual(created, null)

      // New-instance default is Extend Right ON; the checkbox reads it back.
      let current = persistLikePanel([created!])
      assert.equal(current[0].extendRight, true)

      current = toggleLikePanel(current, created!.id, false)
      assert.equal(current[0].extendRight, false)

      current = toggleLikePanel(current, created!.id, true)
      assert.equal(current[0].extendRight, true)

      // Re-parse the serialized payload exactly as the storage module would.
      const raw = memory.get(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY)
      assert.ok(raw)
      const parsed = JSON.parse(raw!) as Record<string, unknown>
      const stored = (parsed[panelId] as Array<Record<string, unknown>>)[0]
      assert.equal(stored.extendRight, true)

      const loaded = loadWidgetFixedRangeVolumeProfileInstances(panelId, {
        selectionIntervalFallback: '1m',
      })
      assert.equal(loaded.length, 1)
      assert.equal(loaded[0].extendRight, true)
      // Exactly the expression the dialog checkbox `checked` prop evaluates.
      assert.equal(loaded[0].extendRight === true, true)
      // Both original coordinates are preserved.
      assert.equal(loaded[0].fromTime, 1_000)
      assert.equal(loaded[0].toTime, 2_000)
    } finally {
      restore()
      memory.delete(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY)
    }
  })

  it('toggling Extend right back off round-trips through storage', () => {
    const memory = new Map<string, string>()
    const restore = installMemoryLocalStorage(memory)
    try {
      const created = createFixedRangeVolumeProfileInstance({
        fromTime: 1_000,
        toTime: 2_000,
        selectionInterval: '1m',
      })
      assert.notEqual(created, null)

      let current = toggleLikePanel([created!], created!.id, false)
      assert.equal(current[0].extendRight, false)

      current = toggleLikePanel(current, created!.id, true)
      assert.equal(current[0].extendRight, true)

      current = toggleLikePanel(current, created!.id, false)
      assert.equal(current[0].extendRight, false)

      const loaded = loadWidgetFixedRangeVolumeProfileInstances(panelId, {
        selectionIntervalFallback: '1m',
      })
      assert.equal(loaded.length, 1)
      assert.equal(loaded[0].extendRight, false)
      assert.equal(loaded[0].extendRight === true, false)
      assert.equal(loaded[0].fromTime, 1_000)
      assert.equal(loaded[0].toTime, 2_000)
    } finally {
      restore()
      memory.delete(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY)
    }
  })
})

// Source-read wiring guard. The repo has no DOM/React test harness, so this
// asserts the prop is actually forwarded from the panel header into
// HeaderToolsMenu (the regression that made the checkbox inert) and declared
// at each interface boundary.
describe('FRVP Extend right header wiring guard', () => {
  const panelHeaderSource = readFileSync(path.join(SRC_ROOT, 'PanelHeaderControls.tsx'), 'utf8')
  const typesSource = readFileSync(
    path.join(SRC_ROOT, 'widgetSettings', 'types.ts'),
    'utf8',
  )
  const headerToolsMenuSource = readFileSync(
    path.join(SRC_ROOT, 'widgetSettings', 'HeaderToolsMenu.tsx'),
    'utf8',
  )

  function extractHeaderToolsMenuOpenTag(source: string): string {
    const start = source.indexOf('<HeaderToolsMenu')
    assert.notEqual(start, -1, 'PanelHeaderControls must render <HeaderToolsMenu>')
    const end = source.indexOf('/>', start)
    assert.notEqual(end, -1, 'HeaderToolsMenu opening tag must self-close')
    return source.slice(start, end)
  }

  it('PanelHeaderControls forwards onFixedRangeVolumeProfileExtendRightChange to HeaderToolsMenu', () => {
    const openTag = extractHeaderToolsMenuOpenTag(panelHeaderSource)
    assert.match(openTag, /onFixedRangeVolumeProfileExtendRightChange=/)
    assert.match(openTag, /settings\.onFixedRangeVolumeProfileExtendRightChange/)
  })

  it('WidgetSettingsRegistration declares onFixedRangeVolumeProfileExtendRightChange', () => {
    assert.match(
      typesSource,
      /onFixedRangeVolumeProfileExtendRightChange\?:\s*\(/,
    )
  })

  it('HeaderToolsMenu declares onFixedRangeVolumeProfileExtendRightChange', () => {
    assert.match(
      headerToolsMenuSource,
      /onFixedRangeVolumeProfileExtendRightChange\?:\s*\(/,
    )
  })
})
