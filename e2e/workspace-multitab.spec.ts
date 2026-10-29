import { expect, test, type Page } from '@playwright/test'

/**
 * Two-tab regressions for multi-workspace support (#198 follow-up). Both tabs share one
 * `localStorage`, so this is exactly the situation the storage layer has to survive:
 *
 * - Tab A keeps rendering Workspace 1 while tab B activates Workspace 2. A Notes edit or a Data
 *   Table column change in tab A must land in Workspace 1's scoped key, never in Workspace 2's —
 *   the widget takes the workspace it renders from `WorkspaceScopeContext` instead of re-reading
 *   `0xdeck-workspace` at save time.
 * - A workspace created in tab B survives a layout save in tab A: a save merges with the stored
 *   envelope instead of writing a stale list back.
 *
 * Assertions read `localStorage` (the actual write target), not just the UI. Local-only: this spec
 * is intentionally **not** wired into `.github/workflows/pr-checks.yml`. The envelope merge policy
 * itself is pinned by `src/lib/workspaceStorage.test.ts`; these specs cover the browser wiring.
 *
 * No backend is required: the Notes specs use no data, the Data Table spec mocks `/api`.
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
}

/** Two workspaces, both showing a Notes panel, so each tab can render its own workspace. */
function twoNotesWorkspacePayload(activeWorkspaceId: string): string {
  const workspace = (id: string) => ({
    id,
    activePanels: ['notes-e2e'],
    layout: [{ i: 'notes-e2e', x: 0, y: 0, w: 18, h: 12 }],
    gridVersion: 3,
  })
  return JSON.stringify({
    version: 2,
    activeWorkspaceId,
    workspaces: [workspace('ws-1'), workspace('ws-2')],
  })
}

/** Two workspaces, both showing a Data Table panel. */
function twoDataTableWorkspacePayload(activeWorkspaceId: string): string {
  const workspace = (id: string) => ({
    id,
    activePanels: ['data-table-e2e'],
    layout: [{ i: 'data-table-e2e', x: 0, y: 0, w: 36, h: 16 }],
    gridVersion: 3,
  })
  return JSON.stringify({
    version: 2,
    activeWorkspaceId,
    workspaces: [workspace('ws-1'), workspace('ws-2')],
  })
}

/** One workspace with a Notes panel (the stale-tab envelope spec starts from a single workspace). */
function singleWorkspacePayload(activeWorkspaceId: string): string {
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
    ],
  })
}

function storedNotes(id: string, marker: string): string {
  return JSON.stringify({
    files: [{ id, name: `${id}.md`, source: 'local' }],
    contents: { [id]: marker },
    activeId: id,
    openIds: [id],
  })
}

/**
 * Seeds keys once per page. `addInitScript` runs on every navigation, so an existing key is left
 * alone: a reload must observe what the app itself persisted.
 */
async function seedLocalStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
    }
  }, entries)
}

async function storedItem(page: Page, key: string): Promise<string | null> {
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)
}

async function readWorkspacePayload(page: Page): Promise<StoredPayload> {
  const raw = await storedItem(page, WORKSPACE_STORAGE_KEY)
  return raw === null ? {} : (JSON.parse(raw) as StoredPayload)
}

function workspaceButton(page: Page, index: number) {
  return page.getByRole('button', { name: `Workspace ${index}`, exact: true })
}

function addWorkspaceButton(page: Page) {
  return page.getByRole('button', { name: 'Yeni çalışma alanı ekle' })
}

function notesTextarea(page: Page) {
  return page.locator('.panel-body textarea')
}

async function expectActiveWorkspace(page: Page, workspaceId: string) {
  await expect
    .poll(async () => (await readWorkspacePayload(page)).activeWorkspaceId)
    .toBe(workspaceId)
}

test('a Notes edit in a stale tab lands in the workspace that tab renders', async ({
  page,
  context,
}) => {
  const workspace1Notes = storedNotes('note-1', '# WORKSPACE ONE NOTE')
  const workspace2Notes = storedNotes('note-2', '# WORKSPACE TWO USER NOTE')
  const seed = {
    [WORKSPACE_STORAGE_KEY]: twoNotesWorkspacePayload('ws-1'),
    [`${NOTES_STORAGE_KEY}:ws-1`]: workspace1Notes,
    [`${NOTES_STORAGE_KEY}:ws-2`]: workspace2Notes,
  }

  // Tab A renders Workspace 1.
  await seedLocalStorage(page, seed)
  await page.goto('/')
  await expect(notesTextarea(page)).toHaveValue(/# WORKSPACE ONE NOTE/)

  // Tab B activates Workspace 2, so the shared envelope now says `ws-2` is active.
  const tabB = await context.newPage()
  await seedLocalStorage(tabB, seed)
  await tabB.goto('/')
  await workspaceButton(tabB, 2).click()
  await expect(notesTextarea(tabB)).toHaveValue(/# WORKSPACE TWO USER NOTE/)
  await expectActiveWorkspace(tabB, 'ws-2')

  // Tab A still renders Workspace 1: a switch in another tab is not a switch here.
  await expect(workspaceButton(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await expect(notesTextarea(page)).toHaveValue(/# WORKSPACE ONE NOTE/)

  // The edit happens in tab A, after the other tab's switch.
  await notesTextarea(page).fill('# EDITED IN STALE TAB A')

  await expect
    .poll(() => storedItem(page, `${NOTES_STORAGE_KEY}:ws-1`))
    .toContain('EDITED IN STALE TAB A')

  // Workspace 2's notes are byte-for-byte untouched, and the legacy singleton is not involved.
  expect(await storedItem(tabB, `${NOTES_STORAGE_KEY}:ws-2`)).toBe(workspace2Notes)
  expect(await storedItem(tabB, NOTES_STORAGE_KEY)).toBeNull()
})

/** Minimal Parquet backend mock: one `trades` dataset with three preview columns. */
async function mockParquetApi(target: Page) {
  await target.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', parquet_folder: '/tmp/e2e-parquet' } }),
  )
  await target.route('**/api/datasets', (route) =>
    route.fulfill({
      json: { datasets: [{ name: 'trades', kind: 'file', file_count: 1, row_count: 3 }] },
    }),
  )
  await target.route('**/api/datasets/*/preview*', (route) =>
    route.fulfill({
      json: {
        name: 'trades',
        columns: ['time', 'price', 'size'],
        rows: [
          [1, 100.5, 2],
          [2, 101.5, 3],
        ],
      },
    }),
  )
  await target.route('**/api/datasets/*/series*', (route) =>
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
}

test('a Data Table column selection in a stale tab lands in the workspace that tab renders', async ({
  page,
  context,
}) => {
  const workspace1Config = JSON.stringify({ datasetName: 'trades', columns: ['price'] })
  const workspace2Config = JSON.stringify({ datasetName: 'trades', columns: ['size'] })
  const seed = {
    [WORKSPACE_STORAGE_KEY]: twoDataTableWorkspacePayload('ws-1'),
    [`${DATA_CONFIG_STORAGE_KEY}:ws-1`]: workspace1Config,
    [`${DATA_CONFIG_STORAGE_KEY}:ws-2`]: workspace2Config,
  }

  // Tab A renders Workspace 1 with its own column selection.
  await mockParquetApi(page)
  await seedLocalStorage(page, seed)
  await page.goto('/')
  await expect(page.locator('table tfoot td')).toContainText('· columns: price')

  // Tab B activates Workspace 2 (it needs the same mocked backend).
  const tabB = await context.newPage()
  await mockParquetApi(tabB)
  await seedLocalStorage(tabB, seed)
  await tabB.goto('/')
  await workspaceButton(tabB, 2).click()
  await expect(tabB.locator('table tfoot td')).toContainText('· columns: size')
  await expectActiveWorkspace(tabB, 'ws-2')

  // Tab A keeps rendering Workspace 1 and adds a column there.
  await expect(workspaceButton(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[aria-label="Columns"]').click()
  await page.getByRole('menuitemcheckbox', { name: 'time', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('table tfoot td')).toContainText('· columns: price, time')

  await expect
    .poll(() => storedItem(page, `${DATA_CONFIG_STORAGE_KEY}:ws-1`))
    .toBe(JSON.stringify({ datasetName: 'trades', columns: ['price', 'time'] }))

  // Workspace 2's Data Table defaults are unchanged by tab A's edit.
  expect(await storedItem(tabB, `${DATA_CONFIG_STORAGE_KEY}:ws-2`)).toBe(workspace2Config)
  expect(await storedItem(tabB, DATA_CONFIG_STORAGE_KEY)).toBeNull()
})

test('a workspace created in another tab survives a layout save in this tab', async ({
  page,
  context,
}) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: singleWorkspacePayload('ws-1') })
  await page.goto('/')
  await expect(page.locator('.panel-drag-handle').first()).toBeVisible()

  // Tab B creates (and activates) a second workspace.
  const tabB = await context.newPage()
  await seedLocalStorage(tabB, { [WORKSPACE_STORAGE_KEY]: singleWorkspacePayload('ws-1') })
  await tabB.goto('/')
  await addWorkspaceButton(tabB).click()
  await expect.poll(async () => (await readWorkspacePayload(tabB)).workspaces?.length).toBe(2)

  const createdByTabB = (await readWorkspacePayload(tabB)).workspaces?.[1]
  expect(createdByTabB?.id).toBeTruthy()
  expect(createdByTabB?.activePanels).toEqual([])
  await expectActiveWorkspace(tabB, createdByTabB!.id)

  // Tab A saves a layout change while it still renders Workspace 1.
  const handle = page.locator('.panel-drag-handle').first()
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 240, startY + 160, { steps: 12 })
  await page.mouse.up()

  await expect
    .poll(async () => {
      const payload = await readWorkspacePayload(page)
      const item = payload.workspaces?.find((workspace) => workspace.id === 'ws-1')?.layout[0]
      return item === undefined ? 'missing' : `${item.x},${item.y}`
    })
    .not.toBe('0,0')

  // The workspace tab B created is still there, empty as tab B left it.
  const payload = await readWorkspacePayload(page)
  const ids = (payload.workspaces ?? []).map((workspace) => workspace.id)
  expect(ids).toContain('ws-1')
  expect(ids).toContain(createdByTabB!.id)
  const survivor = payload.workspaces?.find((workspace) => workspace.id === createdByTabB!.id)
  expect(survivor?.activePanels).toEqual([])
  expect(survivor?.layout).toEqual([])
  expect(payload.workspaces).toHaveLength(2)
})
