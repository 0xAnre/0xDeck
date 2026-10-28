import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MIGRATED_WORKSPACE_ID,
  WORKSPACE_STORAGE_VERSION,
  activateWorkspace,
  addWorkspace,
  createEmptyWorkspace,
  createWorkspaceCollection,
  createWorkspaceId,
  getActiveWorkspace,
  parseWorkspaceCollection,
  serializeWorkspaceCollection,
  updateWorkspace,
  type WorkspaceCollection,
  type WorkspaceSnapshot,
} from './workspaceModel.ts'

const LEGACY_LAYOUT_ITEM = { i: 'kpi-card', x: 0, y: 0, w: 6, h: 8, minW: 3, minH: 4 }

type Entry = { id: string; state: string }

function collection(): WorkspaceCollection<Entry> {
  return createWorkspaceCollection(
    [
      { id: 'ws-1', state: 'first' },
      { id: 'ws-2', state: 'second' },
    ],
    'ws-1',
  )
}

function workspace(id: string, activePanels: string[] = []): WorkspaceSnapshot {
  return { id, activePanels, layout: [], gridVersion: 3 }
}

describe('parseWorkspaceCollection — legacy migration', () => {
  it('migrates the legacy `layout` payload into Workspace 1', () => {
    const parsed = parseWorkspaceCollection(
      JSON.stringify({
        activePanels: ['kpi-card', 'notes'],
        layout: [LEGACY_LAYOUT_ITEM],
        gridVersion: 3,
      }),
    )

    assert.ok(parsed)
    assert.equal(parsed.migrated, true)
    assert.equal(parsed.collection.version, WORKSPACE_STORAGE_VERSION)
    assert.equal(parsed.collection.activeWorkspaceId, MIGRATED_WORKSPACE_ID)
    assert.equal(parsed.collection.workspaces.length, 1)

    const [migrated] = parsed.collection.workspaces
    assert.equal(migrated.id, MIGRATED_WORKSPACE_ID)
    assert.deepEqual(migrated.activePanels, ['kpi-card', 'notes'])
    assert.deepEqual(migrated.layout, [LEGACY_LAYOUT_ITEM])
    assert.equal(migrated.gridVersion, 3)
  })

  it('migrates the newer `layouts.lg` payload and keeps an absent gridVersion absent', () => {
    const parsed = parseWorkspaceCollection(
      JSON.stringify({
        activePanels: ['chart'],
        layouts: { lg: [LEGACY_LAYOUT_ITEM], md: [{ i: 'chart', x: 0, y: 0, w: 24, h: 6 }] },
      }),
    )

    assert.ok(parsed)
    assert.equal(parsed.migrated, true)
    assert.equal(parsed.collection.activeWorkspaceId, MIGRATED_WORKSPACE_ID)
    assert.deepEqual(parsed.collection.workspaces[0].activePanels, ['chart'])
    assert.deepEqual(parsed.collection.workspaces[0].layout, [LEGACY_LAYOUT_ITEM])
    // The grid-version migration in layoutStorage must still see "no version yet".
    assert.equal(parsed.collection.workspaces[0].gridVersion, undefined)
  })

  it('migrates a legacy empty workspace without inventing panels', () => {
    const parsed = parseWorkspaceCollection(
      JSON.stringify({ activePanels: [], layout: [], gridVersion: 3 }),
    )

    assert.ok(parsed)
    assert.equal(parsed.migrated, true)
    assert.deepEqual(parsed.collection.workspaces[0].activePanels, [])
    assert.deepEqual(parsed.collection.workspaces[0].layout, [])
  })

  it('rejects payloads without any layout information', () => {
    assert.equal(parseWorkspaceCollection(null), null)
    assert.equal(parseWorkspaceCollection(''), null)
    assert.equal(parseWorkspaceCollection('not json'), null)
    assert.equal(parseWorkspaceCollection('null'), null)
    assert.equal(parseWorkspaceCollection('[]'), null)
    assert.equal(parseWorkspaceCollection(JSON.stringify({ layout: [] })), null)
    assert.equal(parseWorkspaceCollection(JSON.stringify({ activePanels: ['note'] })), null)
  })
})

describe('parseWorkspaceCollection — current envelope', () => {
  it('round-trips a serialized collection', () => {
    const original: WorkspaceCollection<WorkspaceSnapshot> = {
      version: WORKSPACE_STORAGE_VERSION,
      activeWorkspaceId: 'ws-b',
      workspaces: [
        workspace('ws-a', ['kpi-card']),
        { ...workspace('ws-b'), layout: [LEGACY_LAYOUT_ITEM] },
      ],
    }

    const parsed = parseWorkspaceCollection(serializeWorkspaceCollection(original))

    assert.ok(parsed)
    assert.equal(parsed.migrated, false)
    assert.deepEqual(parsed.collection, original)
  })

  it('falls back to the first workspace when the stored active id is unknown', () => {
    const parsed = parseWorkspaceCollection(
      JSON.stringify({
        version: WORKSPACE_STORAGE_VERSION,
        activeWorkspaceId: 'ws-missing',
        workspaces: [workspace('ws-a'), workspace('ws-b')],
      }),
    )

    assert.ok(parsed)
    assert.equal(parsed.collection.activeWorkspaceId, 'ws-a')
  })

  it('drops invalid and duplicate workspace entries', () => {
    const parsed = parseWorkspaceCollection(
      JSON.stringify({
        version: WORKSPACE_STORAGE_VERSION,
        activeWorkspaceId: 'ws-b',
        workspaces: [
          workspace('ws-a'),
          { id: '', activePanels: [] },
          { id: 'ws-c' },
          workspace('ws-a', ['duplicate']),
          workspace('ws-b', ['chart']),
        ],
      }),
    )

    assert.ok(parsed)
    assert.deepEqual(
      parsed.collection.workspaces.map((entry) => entry.id),
      ['ws-a', 'ws-b'],
    )
    assert.deepEqual(parsed.collection.workspaces[1].activePanels, ['chart'])
  })

  it('rejects an envelope without usable workspaces', () => {
    assert.equal(
      parseWorkspaceCollection(
        JSON.stringify({ version: WORKSPACE_STORAGE_VERSION, activeWorkspaceId: 'ws-a', workspaces: [] }),
      ),
      null,
    )
    assert.equal(
      parseWorkspaceCollection(JSON.stringify({ activeWorkspaceId: 'ws-a', workspaces: [{}] })),
      null,
    )
  })

  it('flags an older envelope version as migrated', () => {
    const parsed = parseWorkspaceCollection(
      JSON.stringify({ activeWorkspaceId: 'ws-a', workspaces: [workspace('ws-a')] }),
    )

    assert.ok(parsed)
    assert.equal(parsed.migrated, true)
    assert.equal(parsed.collection.workspaces.length, 1)
  })
})

describe('workspace list operations', () => {
  it('activates a workspace and returns the same collection for unknown ids', () => {
    const initial = collection()

    const activated = activateWorkspace(initial, 'ws-2')
    assert.equal(activated.activeWorkspaceId, 'ws-2')
    assert.equal(getActiveWorkspace(activated)?.state, 'second')
    // The source collection is untouched.
    assert.equal(initial.activeWorkspaceId, 'ws-1')

    // Re-activating the already active workspace is a no-op.
    assert.equal(activateWorkspace(activated, 'ws-2'), activated)
    assert.equal(activateWorkspace(initial, 'ws-unknown'), initial)
    assert.equal(activateWorkspace(initial, 'ws-1'), initial)
  })

  it('adds an empty workspace, activates it and keeps the previous ones', () => {
    const initial = collection()
    const added = addWorkspace(initial, { id: 'ws-3', state: 'third' })

    assert.equal(added.activeWorkspaceId, 'ws-3')
    assert.deepEqual(
      added.workspaces.map((entry) => entry.id),
      ['ws-1', 'ws-2', 'ws-3'],
    )
    assert.equal(initial.workspaces.length, 2)
    assert.equal(addWorkspace(initial, { id: 'ws-1', state: 'duplicate' }), initial)
  })

  it('creates an empty snapshot for a new workspace', () => {
    assert.deepEqual(createEmptyWorkspace('ws-new'), {
      id: 'ws-new',
      activePanels: [],
      layout: [],
      gridVersion: undefined,
    })
  })

  it('updates only the addressed workspace', () => {
    const initial = collection()
    const [firstBefore, secondBefore] = initial.workspaces

    const updated = updateWorkspace(initial, 'ws-2', (entry) => ({ ...entry, state: 'changed' }))

    assert.equal(updated.workspaces[1].state, 'changed')
    assert.equal(updated.workspaces[0], firstBefore)
    assert.equal(initial.workspaces[1], secondBefore)
    assert.equal(updated.activeWorkspaceId, 'ws-1')
  })

  it('keeps the collection identity when an update is a no-op or targets an unknown id', () => {
    const initial = collection()

    assert.equal(updateWorkspace(initial, 'ws-1', (entry) => entry), initial)
    assert.equal(updateWorkspace(initial, 'ws-unknown', (entry) => entry), initial)
  })

  it('never mutates another workspace when one workspace layout changes', () => {
    const initial: WorkspaceCollection<WorkspaceSnapshot> = {
      version: WORKSPACE_STORAGE_VERSION,
      activeWorkspaceId: 'ws-a',
      workspaces: [workspace('ws-a', ['kpi-card']), workspace('ws-b', ['chart'])],
    }
    const untouched = initial.workspaces[1]

    const next = updateWorkspace(initial, 'ws-a', (entry) => ({
      ...entry,
      layout: [LEGACY_LAYOUT_ITEM],
      activePanels: ['kpi-card', 'notes'],
    }))

    assert.deepEqual(next.workspaces[0].layout, [LEGACY_LAYOUT_ITEM])
    assert.equal(next.workspaces[1], untouched)
    assert.deepEqual(next.workspaces[1].activePanels, ['chart'])
    assert.deepEqual(initial.workspaces[0].layout, [])
  })
})

describe('createWorkspaceId', () => {
  it('builds a deterministic id from the provided suffix', () => {
    assert.equal(createWorkspaceId([], 'abcd1234'), 'ws-abcd1234')
  })

  it('avoids ids that are already taken', () => {
    const taken = ['ws-abcd1234', 'ws-abcd1234-1']
    assert.equal(createWorkspaceId(taken, 'abcd1234'), 'ws-abcd1234-2')
  })

  it('generates distinct ids for a fresh workspace', () => {
    const first = createWorkspaceId([])
    const second = createWorkspaceId([first])

    assert.match(first, /^ws-[a-z0-9]+$/)
    assert.notEqual(first, second)
  })
})
