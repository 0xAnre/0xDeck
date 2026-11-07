import { expect, test, type Page } from '@playwright/test'

/**
 * Browser regression for the `black` theme palette (#218).
 *
 * The page and panel surfaces of the `black` theme must be pure `#000000` while every other
 * token (borders, muted text, popover/menus, market/chart colors) keeps the Neutral-derived
 * value it had before, and the other themes must stay byte-identical. Only a browser can prove
 * this: it needs the real cascade of the `[data-theme='black']` block and the computed
 * `background-color` of the shell and of a panel.
 *
 * No backend is required: the workspace is seeded with a Notes panel, which renders from
 * localStorage only. Local-only: like the other specs in this folder, it is intentionally not
 * wired into `.github/workflows/pr-checks.yml`.
 */

const THEME_STORAGE_KEY = '0xdeck-theme'
const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'

/** Envelope with one Notes panel so a `Card` panel surface exists without any `/api` call. */
const notesWorkspacePayload = JSON.stringify({
  version: 2,
  activeWorkspaceId: 'ws-theme',
  workspaces: [
    {
      id: 'ws-theme',
      activePanels: ['notes-theme'],
      layout: [{ i: 'notes-theme', x: 0, y: 0, w: 18, h: 12 }],
      gridVersion: 3,
    },
  ],
})

/**
 * Seeds keys once per browser context. `addInitScript` runs on every navigation, so an existing
 * key is left untouched: a reload must observe what the app itself persisted.
 */
async function seedLocalStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
    }
  }, entries)
}

/** Raw value of a CSS custom property as the cascade resolved it (untrimmed → trimmed). */
async function themeToken(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
    name,
  )
}

/** The painted color of an element (`bg-background` on `body`, `bg-card` on a panel `Card`). */
async function backgroundColor(page: Page, selector: string): Promise<string> {
  return page.evaluate(
    (target) => getComputedStyle(document.querySelector(target)!).backgroundColor,
    selector,
  )
}

async function selectTheme(page: Page, label: 'Black' | 'Neutral') {
  await page.getByRole('button', { name: 'Tema seç' }).click()
  await page.getByRole('menuitemradio', { name: label }).click()
}

test('black theme paints the page and panel surfaces pure black', async ({ page }) => {
  await seedLocalStorage(page, {
    [THEME_STORAGE_KEY]: 'black',
    [WORKSPACE_STORAGE_KEY]: notesWorkspacePayload,
  })
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'black')
  await expect(page.getByRole('button', { name: 'Notes panelini kapat' })).toBeVisible()

  expect((await themeToken(page, '--background')).toLowerCase()).toBe('#000000')
  expect((await themeToken(page, '--card')).toLowerCase()).toBe('#000000')

  // The tokens are actually painted: the shell (header + grid gaps) and the panel surfaces.
  expect(await backgroundColor(page, 'body')).toBe('rgb(0, 0, 0)')
  expect(await backgroundColor(page, '[data-slot="card"]')).toBe('rgb(0, 0, 0)')
})

test('the black theme keeps every other token and the other themes untouched', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: notesWorkspacePayload })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral')

  const neutralTokens = {
    background: await themeToken(page, '--background'),
    card: await themeToken(page, '--card'),
    border: await themeToken(page, '--border'),
    input: await themeToken(page, '--input'),
    muted: await themeToken(page, '--muted'),
    mutedForeground: await themeToken(page, '--muted-foreground'),
    popover: await themeToken(page, '--popover'),
  }
  const neutralPageColor = await backgroundColor(page, 'body')
  expect(neutralPageColor).not.toBe('rgb(0, 0, 0)')

  await selectTheme(page, 'Black')

  await expect.poll(() => themeToken(page, '--background')).toBe('#000000')
  expect(await themeToken(page, '--card')).toBe('#000000')
  expect(await backgroundColor(page, 'body')).toBe('rgb(0, 0, 0)')
  expect(await backgroundColor(page, '[data-slot="card"]')).toBe('rgb(0, 0, 0)')

  // Separators, muted text and menus keep their values so they stay legible on pure black.
  expect(await themeToken(page, '--border')).toBe(neutralTokens.border)
  expect(await themeToken(page, '--input')).toBe(neutralTokens.input)
  expect(await themeToken(page, '--muted')).toBe(neutralTokens.muted)
  expect(await themeToken(page, '--muted-foreground')).toBe(neutralTokens.mutedForeground)
  expect(await themeToken(page, '--popover')).toBe(neutralTokens.popover)

  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe('black')

  // The choice survives a reload, and switching back restores the untouched Neutral palette.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'black')
  expect(await themeToken(page, '--background')).toBe('#000000')

  await selectTheme(page, 'Neutral')
  await expect.poll(() => themeToken(page, '--background')).toBe(neutralTokens.background)
  expect(await themeToken(page, '--card')).toBe(neutralTokens.card)
  expect(await backgroundColor(page, 'body')).toBe(neutralPageColor)
})
