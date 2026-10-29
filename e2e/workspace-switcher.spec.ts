import { expect, test, type Page } from '@playwright/test'

/**
 * Minimal browser regression for multi-workspace support (#198) and the follow-up fixes:
 *
 * - a legacy single-workspace payload (12-column layout, no `gridVersion`) migrates into
 *   Workspace 1, is scaled to the 36-column grid exactly once and stays usable;
 * - `+` creates and activates an empty workspace;
 * - switching shows only the active workspace's widgets, and a reload restores the last active
 *   workspace;
 * - a drag in one workspace never rewrites another workspace's stored layout;
 * - Notes content and Data Table columns stay per workspace (the legacy singletons stay with
 *   Workspace 1).
 *
 * Everything here is browser-only behaviour: the grid geometry, the header switcher and the
 * localStorage round-trip cannot be reached from `node:test`. Local-only: this spec is
 * intentionally **not** wired into `.github/workflows/pr-checks.yml`.
 *
 * No backend is required. The Notes/Data Table spec mocks `/api` with `page.route`; the other
 * specs only use widgets that need no data (`notes`, `market-times`).
 */

const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const NOTES_STORAGE_KEY = '0xdeck-notes'
const DATA_CONFIG_STORAGE_KEY = '0xdeck-data-config'

type StoredWorkspace = {
  id: string
  activePanels: string[]
  layout: Array<{ i: string; x: number; y: number; w: number; h: number }>
  gridVersion?: number
}

type StoredPayload = {
  version?: number
  activeWorkspaceId?: string
  workspaces?: StoredWorkspace[]
  activePanels?: string[]
  layout?: StoredWorkspace['layout']
  gridVersion?: number
}

/** The pre-multi-workspace payload: one workspace, 12-column layout, no `gridVersion`. */
function legacyPayload(panelId: string): string {
  return JSON.stringify({
    activePanels: [panelId],
    layout: [{ i: panelId, x: 0, y: 0, w: 12, h: 8 }],
  })
}

/** Current envelope: Workspace 1 with a Notes panel, Workspace 2 with a Market Times panel. */
function twoWorkspacePayload(activeWorkspaceId: string): string {
  return JSON.stringify({
    version: 2,
    activeWorkspaceId,
    workspaces: [
      {
        id: 'ws-1',
        activePanels: ['notes-e2e'],
        layout: [{ i: 'notes-e2e', x: 0, y: 0, w: 18, h: 12 }],
        gridVersion: 3,
      },
      {
        id: 'ws-2',
        activePanels: ['market-times-e2e'],
        layout: [{ i: 'market-times-e2e', x: 18, y: 0, w: 12, h: 12 }],
        gridVersion: 3,
      },
    ],
  })
}

/**
 * Seeding the bundled notes must never reach another workspace: the seed load `await`s the note
 * fetches and the user can switch workspaces inside that window.
 */
function twoNotesWorkspacePayload(activeWorkspaceId: string): string {
  return JSON.stringify({
    version: 2,
    activeWorkspaceId,
    workspaces: [
      {
        id: 'ws-1',
        activePanels: ['notes-e2e'],
        layout: [{ i: 'notes-e2e', x: 0, y: 0, w: 18, h: 12 }],
        gridVersion: 3,
      },
      {
        id: 'ws-2',
        activePanels: ['notes-e2e'],
        layout: [{ i: 'notes-e2e', x: 0, y: 0, w: 18, h: 12 }],
        gridVersion: 3,
      },
    ],
  })
}

/**
 * Seeds the initial payload once per browser context. `addInitScript` runs on every navigation, so
 * an existing key is left untouched: a reload must observe what the app itself persisted.
 */
async function seedLocalStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
    }
  }, entries)
}

async function readWorkspacePayload(page: Page): Promise<StoredPayload> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw === null ? {} : (JSON.parse(raw) as StoredPayload)
  }, WORKSPACE_STORAGE_KEY)
}

function workspaceButton(page: Page, index: number) {
  return page.getByRole('button', { name: `Workspace ${index}`, exact: true })
}

function addWorkspaceButton(page: Page) {
  return page.getByRole('button', { name: 'Yeni çalışma alanı ekle' })
}

function emptyWorkspaceHint(page: Page) {
  return page.getByText('Widget eklemek için üstteki Widgets menüsünü kullan')
}

function panelCloseButton(page: Page, title: string) {
  return page.getByRole('button', { name: `${title} panelini kapat` })
}

function notesTextarea(page: Page) {
  return page.locator('.panel-body textarea')
}

/** Height of one header button: a header taller than this has wrapped onto a second row. */
async function rowHeight(page: Page): Promise<number> {
  const box = await workspaceButton(page, 1).boundingBox()
  expect(box).not.toBeNull()
  return box!.height
}

async function addWidget(page: Page, title: string) {
  await page.getByRole('button', { name: 'Widget ekle' }).click()
  await page.getByRole('menuitem', { name: title }).click()
}

async function expectActiveWorkspace(page: Page, workspaceId: string) {
  await expect
    .poll(async () => (await readWorkspacePayload(page)).activeWorkspaceId)
    .toBe(workspaceId)
}

/** The `+` button creates a workspace with a generated id; assert it is the new active one. */
async function expectActiveWorkspaceIsNew(page: Page) {
  await expect
    .poll(async () => {
      const payload = await readWorkspacePayload(page)
      const workspaces = payload.workspaces ?? []
      return workspaces.length === 2 && payload.activeWorkspaceId === workspaces[1]?.id
    })
    .toBe(true)
}

/** Position/size only: catalog constraints are re-derived on every load. */
function geometry(workspace: StoredWorkspace | undefined) {
  return workspace?.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
}

test('legacy workspace payload migrates into Workspace 1 and is scaled once', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: legacyPayload('notes-e2e') })
  await page.goto('/')

  await expect(workspaceButton(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await expect(panelCloseButton(page, 'Notes')).toBeVisible()

  await expect.poll(async () => (await readWorkspacePayload(page)).workspaces?.[0]?.gridVersion).toBe(3)

  const payload = await readWorkspacePayload(page)
  expect(payload.version).toBe(2)
  expect(payload.activeWorkspaceId).toBe('ws-1')
  expect(payload.workspaces).toHaveLength(1)
  const [workspace] = payload.workspaces!
  expect(workspace.id).toBe('ws-1')
  expect(workspace.activePanels).toEqual(['notes-e2e'])
  // 12-column layout scaled 12→36 (w 12→36, h 8→24) and stamped with the current version.
  expect(workspace.layout[0]).toMatchObject({ i: 'notes-e2e', w: 36, h: 24 })
  expect(workspace.gridVersion).toBe(3)

  // A second load must not scale again.
  await page.reload()
  await expect(panelCloseButton(page, 'Notes')).toBeVisible()
  const reloaded = await readWorkspacePayload(page)
  expect(reloaded.workspaces?.[0]?.layout[0]).toMatchObject({ w: 36, h: 24 })
})

test('+ creates and activates an empty workspace that survives a reload', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: legacyPayload('notes-e2e') })
  await page.goto('/')
  await expect(panelCloseButton(page, 'Notes')).toBeVisible()

  await addWorkspaceButton(page).click()

  await expect(workspaceButton(page, 2)).toHaveAttribute('aria-pressed', 'true')
  await expect(emptyWorkspaceHint(page)).toBeVisible()
  await expect(panelCloseButton(page, 'Notes')).toHaveCount(0)
  await expectActiveWorkspaceIsNew(page)

  // Reload restores the last active (empty) workspace and keeps Workspace 1 intact.
  await page.reload()
  await expect(workspaceButton(page, 2)).toHaveAttribute('aria-pressed', 'true')
  await expect(emptyWorkspaceHint(page)).toBeVisible()
  await expect(panelCloseButton(page, 'Notes')).toHaveCount(0)

  await workspaceButton(page, 1).click()
  await expect(panelCloseButton(page, 'Notes')).toBeVisible()
})

test('switching between two workspaces shows only that workspace widgets', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: twoWorkspacePayload('ws-1') })
  await page.goto('/')

  await expect(panelCloseButton(page, 'Notes')).toBeVisible()
  await expect(panelCloseButton(page, 'Market Times')).toHaveCount(0)

  await workspaceButton(page, 2).click()
  await expect(panelCloseButton(page, 'Market Times')).toBeVisible()
  await expect(panelCloseButton(page, 'Notes')).toHaveCount(0)
  await expectActiveWorkspace(page, 'ws-2')

  // Reload restores the last active workspace and its widgets.
  await page.reload()
  await expect(workspaceButton(page, 2)).toHaveAttribute('aria-pressed', 'true')
  await expect(panelCloseButton(page, 'Market Times')).toBeVisible()
  await expect(panelCloseButton(page, 'Notes')).toHaveCount(0)

  await workspaceButton(page, 1).click()
  await expect(panelCloseButton(page, 'Notes')).toBeVisible()
  await expect(panelCloseButton(page, 'Market Times')).toHaveCount(0)
})

test('a drag in one workspace does not rewrite the other workspace layout', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: twoWorkspacePayload('ws-1') })
  await page.goto('/')
  await expect(panelCloseButton(page, 'Notes')).toBeVisible()

  const before = await readWorkspacePayload(page)
  const otherBefore = before.workspaces?.find((workspace) => workspace.id === 'ws-2')
  const draggedBefore = before.workspaces?.find((workspace) => workspace.id === 'ws-1')
  expect(otherBefore?.layout[0]).toMatchObject({ i: 'market-times-e2e', x: 18, y: 0 })
  expect(draggedBefore?.layout[0]).toMatchObject({ i: 'notes-e2e', x: 0, y: 0 })

  const handle = page.locator('.panel-drag-handle').first()
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 260, startY + 180, { steps: 12 })
  await page.mouse.up()

  await expect
    .poll(async () => {
      const payload = await readWorkspacePayload(page)
      const item = payload.workspaces?.find((workspace) => workspace.id === 'ws-1')?.layout[0]
      return item === undefined ? 'missing' : `${item.x},${item.y}`
    })
    .not.toBe('0,0')

  const after = await readWorkspacePayload(page)
  const otherAfter = after.workspaces?.find((workspace) => workspace.id === 'ws-2')
  // The other workspace keeps its panels and geometry untouched.
  expect(geometry(otherAfter)).toEqual(geometry(otherBefore))
  expect(otherAfter?.activePanels).toEqual(['market-times-e2e'])

  // Switching workspaces keeps the moved layout of Workspace 1.
  await workspaceButton(page, 2).click()
  await expect(panelCloseButton(page, 'Market Times')).toBeVisible()
  await workspaceButton(page, 1).click()
  await expect(panelCloseButton(page, 'Notes')).toBeVisible()
  const afterSwitch = await readWorkspacePayload(page)
  expect(geometry(afterSwitch.workspaces?.find((workspace) => workspace.id === 'ws-1'))).toEqual(
    geometry(after.workspaces?.find((workspace) => workspace.id === 'ws-1')),
  )
  expect(geometry(afterSwitch.workspaces?.find((workspace) => workspace.id === 'ws-2'))).toEqual(
    geometry(otherBefore),
  )
})

test('Notes content stays per workspace and the legacy singleton keeps Workspace 1', async ({
  page,
}) => {
  const legacyNotes = JSON.stringify({
    files: [{ id: 'daily', name: 'daily.md', source: 'local' }],
    contents: { daily: '# MIGRATED LEGACY NOTE\n\nkept for workspace 1' },
    activeId: 'daily',
    openIds: ['daily'],
  })
  await seedLocalStorage(page, {
    [WORKSPACE_STORAGE_KEY]: legacyPayload('notes-e2e'),
    [NOTES_STORAGE_KEY]: legacyNotes,
  })
  await page.goto('/')

  await expect(notesTextarea(page)).toHaveValue(/# MIGRATED LEGACY NOTE/)

  // A new workspace does not inherit Workspace 1's notes; it seeds from the bundled notes.
  await addWorkspaceButton(page).click()
  await expect(emptyWorkspaceHint(page)).toBeVisible()
  await addWidget(page, 'Notes')
  await expect(notesTextarea(page)).toHaveValue(/# Daily log/)
  await expect(notesTextarea(page)).not.toHaveValue(/# MIGRATED LEGACY NOTE/)

  // Switching back shows Workspace 1's own note content again.
  await workspaceButton(page, 1).click()
  await expect(notesTextarea(page)).toHaveValue(/# MIGRATED LEGACY NOTE/)
})

test('a switch during the Notes seed load never overwrites the other workspace', async ({
  page,
}) => {
  const workspace2Notes = JSON.stringify({
    files: [{ id: 'note-2', name: 'mine.md', source: 'local' }],
    contents: { 'note-2': '# WORKSPACE 2 USER NOTE' },
    activeId: 'note-2',
    openIds: ['note-2'],
  })

  // Workspace 1 has no notes yet and therefore seeds from the bundled notes; Workspace 2 already
  // holds the user's own note.
  await seedLocalStorage(page, {
    [WORKSPACE_STORAGE_KEY]: twoNotesWorkspacePayload('ws-1'),
    [`${NOTES_STORAGE_KEY}:ws-2`]: workspace2Notes,
  })

  // Hold the bundled notes back so the switch below lands while Workspace 1 is still loading them.
  await page.route('**/notes/*.md', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.fulfill({ body: '# bundled seed' })
  })

  await page.goto('/')

  await workspaceButton(page, 2).click()
  await expect(notesTextarea(page)).toHaveValue(/# WORKSPACE 2 USER NOTE/)

  // Wait for the in-flight seed write to land in either workspace (a regression lands it in
  // Workspace 2), so the assertions below see the final state instead of racing it.
  const notesKeys = [`${NOTES_STORAGE_KEY}:ws-1`, `${NOTES_STORAGE_KEY}:ws-2`]
  const readStoredNotes = () =>
    page.evaluate(
      ({ keys, seedMarker }) => {
        const [workspace1, workspace2] = keys.map(
          (key) => window.localStorage.getItem(key) ?? '',
        )
        return { workspace1Seeded: workspace1.includes(seedMarker), workspace2 }
      },
      { keys: notesKeys, seedMarker: '# bundled seed' },
    )

  await expect
    .poll(async () => {
      const stored = await readStoredNotes()
      return stored.workspace1Seeded || stored.workspace2 !== workspace2Notes
    })
    .toBe(true)

  const stored = await readStoredNotes()
  expect(stored.workspace1Seeded).toBe(true)
  expect(stored.workspace2).toBe(workspace2Notes)
})

test('Data Table columns stay per workspace', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', parquet_folder: '/tmp/e2e-parquet' } }),
  )
  await page.route('**/api/datasets', (route) =>
    route.fulfill({
      json: { datasets: [{ name: 'trades', kind: 'file', file_count: 1, row_count: 3 }] },
    }),
  )
  await page.route('**/api/datasets/*/preview*', (route) =>
    route.fulfill({
      json: {
        name: 'trades',
        columns: ['time', 'price', 'size'],
        rows: [[1, 100.5, 2], [2, 101.5, 3]],
      },
    }),
  )
  // The Parquet widget loader also requests a series; without a backend it must be mocked too.
  await page.route('**/api/datasets/*/series*', (route) =>
    route.fulfill({
      json: {
        name: 'trades',
        x_column: 'time',
        y_column: 'price',
        points: [
          { x: 1, y: 100.5 },
          { x: 2, y: 101.5 },
        ],
      },
    }),
  )

  await seedLocalStorage(page, {
    [WORKSPACE_STORAGE_KEY]: legacyPayload('data-table-e2e'),
    // The pre-multi-workspace Data Table default: a single selected column.
    [DATA_CONFIG_STORAGE_KEY]: JSON.stringify({ datasetName: 'trades', columns: ['price'] }),
  })
  await page.goto('/')

  // Workspace 1 keeps its legacy column selection.
  await expect(page.locator('table tfoot td')).toContainText('· columns: price')

  // A new workspace starts from the default (all preview columns).
  await addWorkspaceButton(page).click()
  await expect(emptyWorkspaceHint(page)).toBeVisible()
  await addWidget(page, 'Data Table')
  await expect(page.locator('table tfoot td')).toContainText('· columns: time, price, size')

  // Switching back does not leak Workspace 2's columns into Workspace 1.
  await workspaceButton(page, 1).click()
  await expect(page.locator('table tfoot td')).toContainText('· columns: price')
})

test('many workspaces keep the right-side header controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  const workspaces = Array.from({ length: 16 }, (_, index) => ({
    id: `ws-many-${index + 1}`,
    activePanels: [],
    layout: [],
    gridVersion: 3,
  }))
  await seedLocalStorage(page, {
    [WORKSPACE_STORAGE_KEY]: JSON.stringify({
      version: 2,
      activeWorkspaceId: 'ws-many-1',
      workspaces,
    }),
  })
  await page.goto('/')

  await expect(workspaceButton(page, 1)).toHaveAttribute('aria-pressed', 'true')

  // The header must stay a single row. Without the fix the right-side controls wrap instead of
  // being pushed out, so every control still exists and is visible — only the header grows a row.
  // One row is the button height plus the header's vertical padding, so a second wrapped row lands
  // near two button heights.
  const singleRowHeight = await rowHeight(page)
  const headerHeight = await page
    .locator('header')
    .evaluate((element) => element.getBoundingClientRect().height)
  expect(headerHeight).toBeLessThan(singleRowHeight * 2)

  // `+` and the right-side controls stay inside the viewport instead of being pushed out.
  await expect(addWorkspaceButton(page)).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Widget ekle' })).toBeInViewport()
  await expect(page.getByRole('button', { name: /Screen Lock/ })).toBeInViewport()

  // The icon strip scrolls inside its bounded width; the last workspace stays reachable.
  const strip = page.locator('[data-slot="workspace-strip"]')
  const { scrollWidth, clientWidth } = await strip.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(scrollWidth).toBeGreaterThan(clientWidth)
  await strip.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(workspaceButton(page, 16)).toBeInViewport()
})
