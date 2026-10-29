import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  NOTES_STORAGE_KEY,
  loadNotesWorkspace,
  notesStorageKey,
  saveNotesWorkspace,
  type NotesWorkspace,
} from '../notesStorage.ts'
import {
  WORKSPACE_DATA_CONFIG_STORAGE_KEY,
  loadWorkspaceDataConfig,
  saveWorkspaceDataConfig,
  workspaceDataConfigKey,
} from '../datasetStorage.ts'
import {
  WORKSPACE_STORAGE_KEY,
  parseActiveWorkspaceId,
  readScopedValue,
  resetActiveWorkspaceCache,
  resolveActiveWorkspaceId,
  workspaceScopedKey,
} from './workspaceScope.ts'
import { WORKSPACE_STORAGE_VERSION } from './workspaceModel.ts'

/**
 * Workspace scoping of the two singletons that used to be global (#198 follow-up):
 * `0xdeck-notes` and `0xdeck-data-config`. They are now stored per workspace, while the legacy
 * singleton keeps belonging to Workspace 1 so an existing user keeps their notes and Data Table
 * columns after the upgrade.
 */

type LocalStorageStub = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly data: Map<string, string>
}

let storage: LocalStorageStub

function createLocalStorageStub(initial: Record<string, string> = {}): LocalStorageStub {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    data,
  }
}

function storedWorkspacePayload(activeWorkspaceId: string): string {
  const workspace = (id: string) => ({ id, activePanels: [], layout: [], gridVersion: 3 })
  return JSON.stringify({
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId,
    workspaces: [workspace('ws-1'), workspace('ws-2')],
  })
}

/** Switches the stored active workspace the way the app does, then drops the accessor cache. */
function activateWorkspace(workspaceId: string) {
  storage.setItem(WORKSPACE_STORAGE_KEY, storedWorkspacePayload(workspaceId))
  resetActiveWorkspaceCache()
}

function notesWorkspace(marker: string): NotesWorkspace {
  return {
    files: [{ id: 'note-1', name: `${marker}.md`, source: 'local' }],
    contents: { 'note-1': `# ${marker}` },
    activeId: 'note-1',
    openIds: ['note-1'],
  }
}

/** Runs `body` with a stubbed `fetch` (always OK, fixed note text), then restores the real one. */
async function withSeedFetch<T>(text: string, body: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', {
    value: async () => ({ ok: true, text: async () => text }),
    configurable: true,
    writable: true,
  })
  try {
    return await body()
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true,
    })
  }
}

beforeEach(() => {
  storage = createLocalStorageStub()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: { dispatchEvent: () => true },
    configurable: true,
    writable: true,
  })
  resetActiveWorkspaceCache()
})

afterEach(() => {
  resetActiveWorkspaceCache()
})

describe('active workspace accessor', () => {
  it('falls back to Workspace 1 when nothing is stored or the payload is unusable', () => {
    assert.equal(resolveActiveWorkspaceId(), 'ws-1')
    storage.setItem(WORKSPACE_STORAGE_KEY, 'not json')
    resetActiveWorkspaceCache()
    assert.equal(resolveActiveWorkspaceId(), 'ws-1')
    assert.equal(parseActiveWorkspaceId(null), 'ws-1')
  })

  it('scopes keys per workspace', () => {
    assert.equal(workspaceScopedKey(NOTES_STORAGE_KEY, 'ws-7'), '0xdeck-notes:ws-7')

    activateWorkspace('ws-2')
    assert.equal(resolveActiveWorkspaceId(), 'ws-2')
    assert.equal(notesStorageKey(), '0xdeck-notes:ws-2')
    assert.equal(workspaceDataConfigKey(), '0xdeck-data-config:ws-2')
  })
})

describe('notes per workspace', () => {
  it('keeps the legacy singleton for Workspace 1', async () => {
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesWorkspace('legacy')))
    activateWorkspace('ws-1')

    const loaded = await loadNotesWorkspace()

    assert.deepEqual(loaded.contents, { 'note-1': '# legacy' })
    assert.equal(loaded.files[0].name, 'legacy.md')
  })

  it('does not leak the legacy singleton into another workspace', () => {
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesWorkspace('legacy')))
    activateWorkspace('ws-2')

    assert.equal(readScopedValue(NOTES_STORAGE_KEY), null)
    assert.equal(storage.getItem(notesStorageKey()), null)
  })

  it('prefers the workspace-scoped notes over the legacy singleton', async () => {
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesWorkspace('legacy')))
    storage.setItem(notesStorageKey('ws-1'), JSON.stringify(notesWorkspace('scoped')))
    activateWorkspace('ws-1')

    const loaded = await loadNotesWorkspace()

    assert.deepEqual(loaded.contents, { 'note-1': '# scoped' })
  })

  it('keeps note content isolated per workspace', async () => {
    activateWorkspace('ws-1')
    saveNotesWorkspace(notesWorkspace('first'))
    activateWorkspace('ws-2')
    saveNotesWorkspace(notesWorkspace('second'))

    // Navigating back shows the first workspace's own content again.
    activateWorkspace('ws-1')
    assert.deepEqual((await loadNotesWorkspace()).contents, { 'note-1': '# first' })

    activateWorkspace('ws-2')
    assert.deepEqual((await loadNotesWorkspace()).contents, { 'note-1': '# second' })
    assert.equal(storage.getItem(NOTES_STORAGE_KEY), null)
  })

  it('seeds a workspace that has neither scoped nor legacy notes', async () => {
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesWorkspace('legacy')))
    activateWorkspace('ws-2')

    const originalFetch = globalThis.fetch
    Object.defineProperty(globalThis, 'fetch', {
      value: async () => ({ ok: true, text: async () => '# seeded' }),
      configurable: true,
      writable: true,
    })
    try {
      const loaded = await loadNotesWorkspace()
      assert.equal(loaded.contents['daily'], '# seeded')
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        value: originalFetch,
        configurable: true,
        writable: true,
      })
    }

    // The seed belongs to Workspace 2 only.
    assert.ok(storage.getItem('0xdeck-notes:ws-2'))
    assert.equal(
      storage.getItem(NOTES_STORAGE_KEY),
      JSON.stringify(notesWorkspace('legacy')),
    )
  })

  it('never seeds the workspace that is activated while the seed loads', async () => {
    // Workspace 1 has no notes and therefore seeds; Workspace 2 holds a user's own note.
    activateWorkspace('ws-1')
    const workspace2Notes = JSON.stringify(notesWorkspace('workspace 2 user note'))
    storage.setItem(notesStorageKey('ws-2'), workspace2Notes)

    const loaded = await withSeedFetch('# seeded', async () => {
      // The user switches workspaces while the bundled notes are still in flight.
      const load = loadNotesWorkspace()
      activateWorkspace('ws-2')
      return load
    })

    // The seed is written to the workspace the load started on (captured once at entry) …
    assert.equal(loaded.contents['daily'], '# seeded')
    assert.ok(storage.getItem(notesStorageKey('ws-1')))
    // … never into the workspace that became active during the await.
    assert.equal(storage.getItem(notesStorageKey('ws-2')), workspace2Notes)
  })

  it('never overwrites notes written while the seed loads', async () => {
    activateWorkspace('ws-1')
    const typed = notesWorkspace('typed while loading')

    const loaded = await withSeedFetch('# seeded', async () => {
      const load = loadNotesWorkspace()
      // Notes saved for this very workspace while the fetches are still in flight win over the seed.
      saveNotesWorkspace(typed, 'ws-1')
      return load
    })

    assert.deepEqual(loaded.contents, typed.contents)
    assert.equal(storage.getItem(notesStorageKey('ws-1')), JSON.stringify(typed))
  })
})

describe('data table config per workspace', () => {
  it('keeps the legacy singleton for Workspace 1', () => {
    storage.setItem(
      WORKSPACE_DATA_CONFIG_STORAGE_KEY,
      JSON.stringify({ datasetName: 'trades', columns: ['price', 'size'] }),
    )
    activateWorkspace('ws-1')

    assert.deepEqual(loadWorkspaceDataConfig(), {
      datasetName: 'trades',
      columns: ['price', 'size'],
    })
  })

  it('starts another workspace from the default config', () => {
    storage.setItem(
      WORKSPACE_DATA_CONFIG_STORAGE_KEY,
      JSON.stringify({ datasetName: 'trades', columns: ['price'] }),
    )
    activateWorkspace('ws-2')

    assert.deepEqual(loadWorkspaceDataConfig(), { datasetName: null, columns: [] })
  })

  it('writes only the active workspace config', () => {
    const legacy = JSON.stringify({ datasetName: 'trades', columns: ['price'] })
    storage.setItem(WORKSPACE_DATA_CONFIG_STORAGE_KEY, legacy)
    activateWorkspace('ws-2')

    saveWorkspaceDataConfig({ datasetName: 'orders', columns: ['id'] })

    assert.equal(
      storage.getItem(workspaceDataConfigKey('ws-2')),
      JSON.stringify({ datasetName: 'orders', columns: ['id'] }),
    )
    assert.equal(storage.getItem(WORKSPACE_DATA_CONFIG_STORAGE_KEY), legacy)
    assert.equal(storage.getItem(workspaceDataConfigKey('ws-1')), null)

    // Workspace 1 still sees the legacy value it was written with.
    activateWorkspace('ws-1')
    assert.deepEqual(loadWorkspaceDataConfig(), { datasetName: 'trades', columns: ['price'] })

    activateWorkspace('ws-2')
    assert.deepEqual(loadWorkspaceDataConfig(), { datasetName: 'orders', columns: ['id'] })
  })

  it('prefers the workspace-scoped config over the legacy singleton', () => {
    storage.setItem(
      WORKSPACE_DATA_CONFIG_STORAGE_KEY,
      JSON.stringify({ datasetName: 'trades', columns: ['price'] }),
    )
    storage.setItem(
      workspaceDataConfigKey('ws-1'),
      JSON.stringify({ datasetName: 'trades', columns: ['size'] }),
    )
    activateWorkspace('ws-1')

    assert.deepEqual(loadWorkspaceDataConfig(), { datasetName: 'trades', columns: ['size'] })
  })
})

/**
 * Mounted widgets get the workspace they render from `WorkspaceScopeContext` (#198 follow-up) and
 * pass it explicitly. It must win over `0xdeck-workspace`, which another tab can activate at any
 * moment: a tab that still renders Workspace 1 writes Workspace 1 while storage says Workspace 2.
 */
describe('explicit workspace ids from the mounted widget', () => {
  it('writes notes to the rendered workspace while another one is active', () => {
    const workspace1Notes = JSON.stringify(notesWorkspace('workspace 1'))
    const workspace2Notes = JSON.stringify(notesWorkspace('workspace 2 user note'))
    storage.setItem(notesStorageKey('ws-1'), workspace1Notes)
    storage.setItem(notesStorageKey('ws-2'), workspace2Notes)
    // Another tab activated Workspace 2.
    activateWorkspace('ws-2')

    saveNotesWorkspace(notesWorkspace('edited in tab A'), 'ws-1')

    assert.equal(storage.getItem(notesStorageKey('ws-2')), workspace2Notes)
    assert.notEqual(storage.getItem(notesStorageKey('ws-1')), workspace1Notes)
    assert.match(storage.getItem(notesStorageKey('ws-1'))!, /edited in tab A/)
  })

  it('reads notes for the rendered workspace while another one is active', async () => {
    storage.setItem(notesStorageKey('ws-1'), JSON.stringify(notesWorkspace('workspace 1')))
    storage.setItem(notesStorageKey('ws-2'), JSON.stringify(notesWorkspace('workspace 2')))
    activateWorkspace('ws-2')

    assert.deepEqual((await loadNotesWorkspace('ws-1')).contents, { 'note-1': '# workspace 1' })
    assert.deepEqual((await loadNotesWorkspace('ws-2')).contents, { 'note-1': '# workspace 2' })
  })

  it('seeds the explicitly requested workspace while another one is active', async () => {
    activateWorkspace('ws-2')

    const seeded = await withSeedFetch('# seeded for ws-1', () => loadNotesWorkspace('ws-1'))

    assert.equal(seeded.contents['daily'], '# seeded for ws-1')
    assert.ok(storage.getItem(notesStorageKey('ws-1')))
    assert.equal(storage.getItem(notesStorageKey('ws-2')), null)
  })

  it('writes the Data Table config to the rendered workspace while another one is active', () => {
    const workspace2Config = JSON.stringify({ datasetName: 'trades', columns: ['price'] })
    storage.setItem(workspaceDataConfigKey('ws-2'), workspace2Config)
    activateWorkspace('ws-2')

    saveWorkspaceDataConfig({ datasetName: 'trades', columns: ['size'] }, 'ws-1')

    assert.equal(storage.getItem(workspaceDataConfigKey('ws-2')), workspace2Config)
    assert.equal(
      storage.getItem(workspaceDataConfigKey('ws-1')),
      JSON.stringify({ datasetName: 'trades', columns: ['size'] }),
    )
    // The rendered workspace's default is read back explicitly, regardless of the active id.
    assert.deepEqual(loadWorkspaceDataConfig('ws-2'), { datasetName: 'trades', columns: ['price'] })
    assert.deepEqual(loadWorkspaceDataConfig('ws-1'), { datasetName: 'trades', columns: ['size'] })
  })
})
