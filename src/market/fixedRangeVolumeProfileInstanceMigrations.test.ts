import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  loadWidgetFixedRangeVolumeProfileInstances,
  saveWidgetFixedRangeVolumeProfileInstances,
  WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY,
} from '../fixedRangeVolumeProfileInstancesStorage.ts'
import {
  createFixedRangeVolumeProfileInstance,
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  type FixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'
import {
  LEGACY_FIXED_RANGE_VP_ROW_COUNT,
  migrateLegacyFixedRangeVolumeProfileRowCount,
} from './fixedRangeVolumeProfileInstanceMigrations.ts'

const panelId = 'panel-migration'

function instance(
  overrides: Partial<FixedRangeVolumeProfileInstance> = {},
): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-legacy',
    fromTime: 1_700_000_000,
    toTime: 1_700_003_600,
    selectionInterval: '1m',
    rowCount: LEGACY_FIXED_RANGE_VP_ROW_COUNT,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
    extendRight: false,
    pocStrokeColor: '#112233',
    pocLineStyle: 'solid',
    valueAreaMode: 'step',
    pocMode: 'both',
    histogramUpColor: '#010203',
    ...overrides,
  }
}

function withLocalStorage<T>(run: (memory: Map<string, string>) => T): T {
  const memory = new Map<string, string>()
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
  try {
    return run(memory)
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
  }
}

function seedStoredInstance(memory: Map<string, string>, stored: unknown): void {
  memory.set(
    WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY,
    JSON.stringify({ [panelId]: [stored] }),
  )
}

describe('fixedRangeVolumeProfile instance migrations', () => {
  it('rewrites the old 68-row default to the new 20-row default', () => {
    assert.equal(DEFAULT_FIXED_RANGE_VP_ROW_COUNT, 20)
    assert.equal(LEGACY_FIXED_RANGE_VP_ROW_COUNT, 68)

    const before = instance()
    const migrated = migrateLegacyFixedRangeVolumeProfileRowCount([before])
    assert.equal(migrated.length, 1)
    assert.equal(migrated[0].rowCount, 20)
    // The input is not mutated.
    assert.equal(before.rowCount, 68)
    // Only rowCount changes; every other field is preserved byte for byte.
    assert.deepEqual(
      { ...migrated[0], rowCount: before.rowCount },
      before,
    )
    assert.deepEqual(
      Object.keys(migrated[0]).sort(),
      Object.keys(before).sort(),
    )
    // No field is resurrected: absent optional fields stay absent.
    assert.equal('developingUpdateBars' in migrated[0], false)
    assert.equal('locked' in migrated[0], false)
  })

  it('leaves every other stored row count untouched', () => {
    for (const rowCount of [10, 20, 21, 40, 500]) {
      const migrated = migrateLegacyFixedRangeVolumeProfileRowCount([
        instance({ rowCount }),
      ])
      assert.equal(migrated[0].rowCount, rowCount, `rowCount ${rowCount}`)
    }
    // A user-chosen 68 is indistinguishable from the old default and migrates
    // too (documented trade-off).
    assert.equal(
      migrateLegacyFixedRangeVolumeProfileRowCount([instance({ rowCount: 68 })])[0].rowCount,
      20,
    )
  })

  it('is idempotent', () => {
    const once = migrateLegacyFixedRangeVolumeProfileRowCount([instance()])
    const twice = migrateLegacyFixedRangeVolumeProfileRowCount(once)
    assert.deepEqual(twice, once)
    assert.equal(twice[0].rowCount, 20)
  })

  it('migrates the stored 68-row default at load', () => {
    withLocalStorage((memory) => {
      const stored = instance()
      seedStoredInstance(memory, stored)
      const loaded = loadWidgetFixedRangeVolumeProfileInstances(panelId, {
        selectionIntervalFallback: '1m',
      })
      assert.equal(loaded.length, 1)
      assert.equal(loaded[0].rowCount, 20)
      // Other fields, including the render modes and level styles, are intact.
      assert.deepEqual(
        { ...loaded[0], rowCount: stored.rowCount },
        stored,
      )
      assert.equal('developingUpdateBars' in loaded[0], false)
    })
  })

  it('keeps a stored non-default row count at load', () => {
    withLocalStorage((memory) => {
      seedStoredInstance(memory, instance({ rowCount: 10 }))
      assert.equal(
        loadWidgetFixedRangeVolumeProfileInstances(panelId, {
          selectionIntervalFallback: '1m',
        })[0].rowCount,
        10,
      )
    })
  })

  it('is idempotent across loads', () => {
    withLocalStorage((memory) => {
      seedStoredInstance(memory, instance())
      const first = loadWidgetFixedRangeVolumeProfileInstances(panelId, {
        selectionIntervalFallback: '1m',
      })
      const second = loadWidgetFixedRangeVolumeProfileInstances(panelId, {
        selectionIntervalFallback: '1m',
      })
      assert.equal(first[0].rowCount, 20)
      assert.deepEqual(second, first)
    })
  })

  it('creates fresh profiles with the new 20-row default', () => {
    const fresh = createFixedRangeVolumeProfileInstance({
      fromTime: 10,
      toTime: 20,
      selectionInterval: '1m',
    })
    assert.ok(fresh)
    assert.equal(fresh.rowCount, 20)
  })

  it('migrates on load only, so an explicitly chosen 68 survives the session', () => {
    withLocalStorage((memory) => {
      // The user picked 68 in the dialog: the save path must not rewrite it.
      saveWidgetFixedRangeVolumeProfileInstances(panelId, [instance({ rowCount: 68 })])
      const raw = JSON.parse(memory.get(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY)!)
      assert.equal(raw[panelId][0].rowCount, 68)

      // The next load applies the one-time default migration.
      assert.equal(
        loadWidgetFixedRangeVolumeProfileInstances(panelId, {
          selectionIntervalFallback: '1m',
        })[0].rowCount,
        20,
      )
    })
  })
})
