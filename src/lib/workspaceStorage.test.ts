import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CURRENT_GRID_VERSION,
  WORKSPACE_STORAGE_KEY,
  createWorkspace,
  createWorkspaceStorage,
  needsLegacyColMigration,
  updateWorkspaceState,
  type PanelGrid,
  type WorkspaceStore,
} from './workspaceStorage.ts'
import { WORKSPACE_STORAGE_VERSION } from './workspaceModel.ts'

/**
 * Storage-level regression tests for the workspace persistence core (#198 follow-up).
 *
 * The core takes an injected `localStorage`-shaped storage and a panel-grid lookup, so every
 * migration and data-preservation rule can be exercised without a DOM and without the widget
 * catalog. `layoutStorage.ts` wires the real browser storage and `resolvePanelInstance` in.
 */

const PANEL_GRIDS: Record<string, PanelGrid> = {
  'kpi-card-e2e': { x: 0, y: 0, w: 9, h: 12, minW: 9, minH: 8 },
  'notes-e2e': { x: 0, y: 0, w: 12, h: 12, minW: 6, minH: 6 },
  'chart-e2e': { x: 12, y: 0, w: 24, h: 24, minW: 12, minH: 12 },
}

function lookupPanelGrid(instanceId: string): PanelGrid | undefined {
  return PANEL_GRIDS[instanceId]
}

type StorageStub = {
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }
  /** Every payload successfully written, in order. */
  writes: string[]
  read(): string | null
  parsed(): unknown
}

function createStorageStub(
  initial: string | null,
  options: { failWrites?: boolean } = {},
): StorageStub {
  let raw = initial
  const writes: string[] = []

  return {
    storage: {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        if (options.failWrites) throw new Error('QuotaExceededError')
        raw = value
        writes.push(value)
      },
    },
    writes,
    read: () => raw,
    parsed: () => JSON.parse(raw ?? 'null'),
  }
}

function createCore(stub: StorageStub, defaultPanelIds: string[] = ['kpi-card-e2e']) {
  return createWorkspaceStorage({
    storage: stub.storage,
    lookupPanelGrid,
    defaultPanelIds,
  })
}

function legacyLayoutPayload(): string {
  return JSON.stringify({
    activePanels: ['kpi-card-e2e'],
    layout: [{ i: 'kpi-card-e2e', x: 0, y: 0, w: 12, h: 8, minW: 3, minH: 4 }],
    gridVersion: undefined,
  })
}

function legacyLayoutsLgPayload(): string {
  return JSON.stringify({
    activePanels: ['notes-e2e'],
    layouts: {
      lg: [{ i: 'notes-e2e', x: 3, y: 2, w: 6, h: 4 }],
      md: [{ i: 'notes-e2e', x: 0, y: 0, w: 12, h: 8 }],
    },
  })
}

function envelope(
  workspaces: Array<{
    id: string
    activePanels: string[]
    layout: unknown[]
    gridVersion?: number
  }>,
  activeWorkspaceId = workspaces[0]?.id ?? '',
): string {
  return JSON.stringify({
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId,
    workspaces,
  })
}

function activeEntry(store: WorkspaceStore) {
  const entry = store.workspaces.find((workspace) => workspace.id === store.activeWorkspaceId)
  assert.ok(entry)
  return entry
}

describe('legacy payload migration into Workspace 1', () => {
  it('migrates the legacy `layout` variant and writes the migrated payload back', () => {
    const stub = createStorageStub(legacyLayoutPayload())
    const core = createCore(stub)

    const store = core.load()

    assert.equal(store.activeWorkspaceId, 'ws-1')
    assert.equal(store.workspaces.length, 1)
    const [workspace] = store.workspaces
    assert.equal(workspace.id, 'ws-1')
    assert.deepEqual(workspace.state.activePanels, ['kpi-card-e2e'])
    // A pre-version (12-column) layout is scaled to 36 columns exactly once.
    const [lgItem] = workspace.state.layouts.lg ?? []
    assert.equal(lgItem.w, 36)
    assert.equal(lgItem.h, 24)
    // The widget catalog re-applies its own minimums after the column scaling.
    assert.equal(lgItem.minW, 9)
    assert.equal(lgItem.minH, 8)

    const parsed = stub.parsed() as {
      version: number
      activeWorkspaceId: string
      workspaces: Array<{ id: string; gridVersion?: number; layout: Array<{ w: number }> }>
    }
    assert.equal(parsed.version, WORKSPACE_STORAGE_VERSION)
    assert.equal(parsed.activeWorkspaceId, 'ws-1')
    assert.equal(parsed.workspaces[0].gridVersion, CURRENT_GRID_VERSION)
    assert.equal(parsed.workspaces[0].layout[0].w, 36)
  })

  it('migrates the newer `layouts.lg` variant (no gridVersion) and scales it once', () => {
    const stub = createStorageStub(legacyLayoutsLgPayload())
    const core = createCore(stub)

    const store = core.load()
    const entry = activeEntry(store)

    assert.equal(store.activeWorkspaceId, 'ws-1')
    assert.deepEqual(entry.state.activePanels, ['notes-e2e'])
    const [lgItem] = entry.state.layouts.lg ?? []
    assert.equal(lgItem.x, 9)
    assert.equal(lgItem.y, 6)
    assert.equal(lgItem.w, 18)
    assert.equal(lgItem.h, 12)

    // Second load must not scale again and must not write.
    const writesAfterFirstLoad = stub.writes.length
    const reloaded = createCore(stub).load()
    assert.equal(stub.writes.length, writesAfterFirstLoad)
    assert.deepEqual((reloaded.workspaces[0].state.layouts.lg ?? [])[0], lgItem)
  })

  it('falls back to the default workspace for an unreadable payload', () => {
    for (const raw of [null, '', 'not json', JSON.stringify({ activePanels: [] })]) {
      const core = createCore(createStorageStub(raw), ['kpi-card-e2e', 'notes-e2e'])
      const store = core.load()

      assert.equal(store.activeWorkspaceId, 'ws-1')
      assert.deepEqual(activeEntry(store).state.activePanels, ['kpi-card-e2e', 'notes-e2e'])
    }
  })
})

describe('gridVersion migration', () => {
  const wideLayout = [{ i: 'chart-e2e', x: 0, y: 0, w: 36, h: 24 }]

  it('scales a pre-version layout and stamps the current version (once)', () => {
    assert.equal(needsLegacyColMigration([{ i: 'a', x: 0, y: 0, w: 12, h: 6 }], undefined), true)

    const stub = createStorageStub(legacyLayoutPayload())
    createCore(stub).load()
    assert.equal(stub.writes.length, 1)

    createCore(stub).load()
    assert.equal(stub.writes.length, 1)
  })

  it('scales an older numeric version once and keeps behaving like `main` for old layouts', () => {
    const stub = createStorageStub(
      envelope([{ id: 'ws-1', activePanels: ['kpi-card-e2e'], layout: [{ i: 'kpi-card-e2e', x: 0, y: 0, w: 12, h: 8 }], gridVersion: 2 }]),
    )

    const store = createCore(stub).load()
    assert.equal((store.workspaces[0].state.layouts.lg ?? [])[0].w, 36)
    assert.equal(stub.writes.length, 1)

    createCore(stub).load()
    assert.equal(stub.writes.length, 1)
  })

  it('leaves a current-version layout untouched and writes nothing', () => {
    const seed = envelope([
      { id: 'ws-1', activePanels: ['chart-e2e'], layout: wideLayout, gridVersion: CURRENT_GRID_VERSION },
    ])
    const stub = createStorageStub(seed)

    const store = createCore(stub).load()

    assert.equal(stub.writes.length, 0)
    assert.equal(store.workspaces[0].state.layouts.lg?.[0].w, 36)
    assert.equal(stub.read(), seed)
  })

  it('stamps a pre-version payload that is already 36 columns wide without scaling it', () => {
    const stub = createStorageStub(
      JSON.stringify({ activePanels: ['chart-e2e'], layout: wideLayout }),
    )

    const store = createCore(stub).load()

    assert.equal(store.workspaces[0].state.layouts.lg?.[0].w, 36)
    assert.equal(stub.writes.length, 1)
    const parsed = stub.parsed() as { workspaces: Array<{ gridVersion?: number }> }
    assert.equal(parsed.workspaces[0].gridVersion, CURRENT_GRID_VERSION)

    createCore(stub).load()
    assert.equal(stub.writes.length, 1)
  })
})

describe('serialization round-trip', () => {
  it('stores and reloads every workspace with its layout and active id', () => {
    const seed = envelope(
      [
        { id: 'ws-1', activePanels: ['kpi-card-e2e'], layout: [{ i: 'kpi-card-e2e', x: 0, y: 0, w: 18, h: 12 }], gridVersion: 3 },
        { id: 'ws-2', activePanels: ['notes-e2e', 'chart-e2e'], layout: [{ i: 'notes-e2e', x: 0, y: 0, w: 12, h: 12 }, { i: 'chart-e2e', x: 12, y: 0, w: 24, h: 24 }], gridVersion: 3 },
      ],
      'ws-2',
    )
    const stub = createStorageStub(seed)
    const core = createCore(stub)

    const first = core.load()
    core.save(first)
    const second = createCore(stub).load()

    assert.equal(second.activeWorkspaceId, 'ws-2')
    assert.deepEqual(
      second.workspaces.map((workspace) => workspace.id),
      ['ws-1', 'ws-2'],
    )
    assert.deepEqual(second.workspaces[0].state.layouts, first.workspaces[0].state.layouts)
    assert.deepEqual(second.workspaces[1].state.activePanels, ['notes-e2e', 'chart-e2e'])
    assert.deepEqual(second.workspaces[1].state.layouts, first.workspaces[1].state.layouts)
  })
})

describe('write-back failure', () => {
  it('returns the restored workspaces when persisting the migration fails', () => {
    const stub = createStorageStub(legacyLayoutPayload(), { failWrites: true })
    const core = createCore(stub)

    const store = core.load()

    // Not the default workspace: the loaded, migrated payload survives.
    assert.equal(store.activeWorkspaceId, 'ws-1')
    assert.deepEqual(activeEntry(store).state.activePanels, ['kpi-card-e2e'])
    assert.equal(stub.writes.length, 0)
    // Nothing was persisted, so the raw payload is still the legacy one.
    assert.deepEqual(stub.parsed(), JSON.parse(legacyLayoutPayload()) as unknown)
  })

  it('falls back to the default workspace when the storage cannot be read', () => {
    const core = createWorkspaceStorage({
      storage: {
        getItem: () => {
          throw new Error('storage blocked')
        },
        setItem: () => {},
      },
      lookupPanelGrid,
      defaultPanelIds: ['notes-e2e'],
    })

    const store = core.load()

    assert.equal(store.activeWorkspaceId, 'ws-1')
    assert.deepEqual(activeEntry(store).state.activePanels, ['notes-e2e'])
  })
})

describe('unknown panels and orphan layout items', () => {
  const seed = envelope([
    {
      id: 'ws-1',
      activePanels: ['notes-e2e', 'retired-widget-abc'],
      layout: [
        { i: 'notes-e2e', x: 0, y: 0, w: 12, h: 12 },
        { i: 'retired-widget-abc', x: 12, y: 0, w: 12, h: 12 },
        { i: 'ghost-panel', x: 24, y: 0, w: 12, h: 12 },
      ],
      gridVersion: CURRENT_GRID_VERSION,
    },
  ])

  it('keeps unresolvable panel ids and orphaned layout items out of the render layout', () => {
    const store = createCore(createStorageStub(seed)).load()
    const state = activeEntry(store).state

    // Render layout only contains what the catalog can render.
    assert.deepEqual((state.layouts.lg ?? []).map((item) => item.i), ['notes-e2e'])
    // Stored ids are untouched.
    assert.deepEqual(state.activePanels, ['notes-e2e', 'retired-widget-abc'])
    assert.deepEqual(state.preservedLayout.map((item) => item.i), ['retired-widget-abc', 'ghost-panel'])
  })

  it('writes the preserved data back instead of deleting it', () => {
    const stub = createStorageStub(seed)
    const core = createCore(stub)
    const store = core.load()

    core.save(store)

    const parsed = stub.parsed() as {
      workspaces: Array<{ activePanels: string[]; layout: Array<{ i: string }> }>
    }
    assert.deepEqual(parsed.workspaces[0].activePanels, ['notes-e2e', 'retired-widget-abc'])
    assert.deepEqual(
      parsed.workspaces[0].layout.map((item) => item.i),
      ['notes-e2e', 'retired-widget-abc', 'ghost-panel'],
    )
  })

  it('keeps preserved items when the render layout is edited', () => {
    const stub = createStorageStub(seed)
    const core = createCore(stub)
    const store = core.load()

    const edited = updateWorkspaceState(store, 'ws-1', (state) => ({
      ...state,
      layouts: {
        ...state.layouts,
        lg: (state.layouts.lg ?? []).map((item) => (item.i === 'notes-e2e' ? { ...item, y: 6 } : item)),
      },
    }))
    core.save(edited)

    const reparsed = createCore(stub).load()
    const state = reparsed.workspaces[0].state
    assert.deepEqual(
      state.preservedLayout.map((item) => item.i),
      ['retired-widget-abc', 'ghost-panel'],
    )
    assert.equal((state.layouts.lg ?? [])[0].y, 6)
  })
})

describe('workspace isolation and active-workspace restoration', () => {
  function twoWorkspaceSeed(activeWorkspaceId = 'ws-1'): string {
    return envelope(
      [
        { id: 'ws-1', activePanels: ['kpi-card-e2e'], layout: [{ i: 'kpi-card-e2e', x: 0, y: 0, w: 18, h: 12 }], gridVersion: 3 },
        { id: 'ws-2', activePanels: ['notes-e2e'], layout: [{ i: 'notes-e2e', x: 0, y: 0, w: 12, h: 12 }], gridVersion: 3 },
      ],
      activeWorkspaceId,
    )
  }

  it('updating one workspace never touches another', () => {
    const stub = createStorageStub(twoWorkspaceSeed())
    const core = createCore(stub)
    const store = core.load()
    const untouched = store.workspaces[0]

    const updated = updateWorkspaceState(store, 'ws-2', (state) => ({
      ...state,
      activePanels: [...state.activePanels, 'chart-e2e'],
    }))
    core.save(updated)

    assert.equal(updated.workspaces[0], untouched)
    const reparsed = createCore(stub).load()
    assert.deepEqual(reparsed.workspaces[0].state.activePanels, ['kpi-card-e2e'])
    assert.deepEqual(reparsed.workspaces[1].state.activePanels, ['notes-e2e', 'chart-e2e'])
  })

  it('restores the last active workspace and survives a switch + reload', () => {
    const stub = createStorageStub(twoWorkspaceSeed('ws-2'))
    const core = createCore(stub)

    const restored = core.load()
    assert.equal(restored.activeWorkspaceId, 'ws-2')
    assert.deepEqual(activeEntry(restored).state.activePanels, ['notes-e2e'])

    // Activating another workspace persists the new active id only.
    const activated = { ...restored, activeWorkspaceId: 'ws-1' }
    core.save(activated)

    const reloaded = createCore(stub).load()
    assert.equal(reloaded.activeWorkspaceId, 'ws-1')
    assert.equal(reloaded.workspaces.length, 2)
  })

  it('creates an empty workspace and activates it', () => {
    const stub = createStorageStub(twoWorkspaceSeed())
    const core = createCore(stub)
    const store = core.load()

    const created = createWorkspace(store, core.emptyState, 'ws-new')
    core.save(created)

    assert.equal(created.activeWorkspaceId, 'ws-new')
    const reloaded = createCore(stub).load()
    const entry = activeEntry(reloaded)
    assert.equal(reloaded.activeWorkspaceId, 'ws-new')
    assert.deepEqual(entry.state.activePanels, [])
    assert.deepEqual(entry.state.layouts.lg, [])
    assert.deepEqual(entry.state.preservedLayout, [])
  })
})

describe('workspace storage key', () => {
  it('keeps using the shared `0xdeck-workspace` key', () => {
    assert.equal(WORKSPACE_STORAGE_KEY, '0xdeck-workspace')
  })
})
