import { expect, test, type Page } from '@playwright/test'

/**
 * Browser regression for the warm light `cream` theme (#248).
 *
 * Cream is the first light palette: `applyTheme` must drop shadcn's `.dark` class and set
 * `color-scheme: light` for it, then restore both when a dark theme is selected again. Only a
 * browser can prove the cascade of `[data-theme='cream']`, the painted shell/panel colors, the
 * WCAG contrast of the semantic tokens and the persisted theme across reload/workspace switches.
 *
 * No backend is required: the workspace is seeded with Notes/Market Times panels, which render
 * from localStorage and local clock data only. Local-only: like the other specs in this folder,
 * it is intentionally not wired into `.github/workflows/pr-checks.yml`.
 */

const THEME_STORAGE_KEY = '0xdeck-theme'
const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'

/** Two workspaces (Notes + Market Times) so a workspace switch can render and keep the theme. */
const twoWorkspacePayload = JSON.stringify({
  version: 2,
  activeWorkspaceId: 'ws-cream-1',
  workspaces: [
    {
      id: 'ws-cream-1',
      activePanels: ['notes-cream'],
      layout: [{ i: 'notes-cream', x: 0, y: 0, w: 18, h: 12 }],
      gridVersion: 3,
    },
    {
      id: 'ws-cream-2',
      activePanels: ['market-times-cream'],
      layout: [{ i: 'market-times-cream', x: 18, y: 0, w: 12, h: 12 }],
      gridVersion: 3,
    },
  ],
})

async function seedLocalStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
    }
  }, entries)
}

/** Raw value of a CSS custom property as the cascade resolved it. */
async function themeToken(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
    name,
  )
}

type Resolved = { r: number; g: number; b: number; a: number }

/**
 * Resolves one or more CSS colors in page order on a 1×1 canvas, so alpha tokens are
 * composited over their real surface. Canvas keeps this independent of how Chromium
 * serializes `oklch(...)` in computed styles.
 */
async function paint(page: Page, layers: string[]): Promise<Resolved> {
  return page.evaluate((colors) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d canvas unavailable')
    context.fillStyle = '#000000'
    context.fillRect(0, 0, 1, 1)
    for (const color of colors) {
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
    }
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return { r, g, b, a }
  }, layers)
}

type Rgb = [number, number, number]

function rgb(color: Resolved): Rgb {
  return [color.r, color.g, color.b]
}

function channelLuminance(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(color: Resolved): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  )
}

function contrast(a: Resolved, b: Resolved): number {
  const high = Math.max(luminance(a), luminance(b))
  const low = Math.min(luminance(a), luminance(b))
  return (high + 0.05) / (low + 0.05)
}

async function bodyBackground(page: Page): Promise<Resolved> {
  return paint(page, [
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ])
}

async function cardBackground(page: Page): Promise<Resolved> {
  return paint(page, [
    await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-slot="card"]')!).backgroundColor,
    ),
  ])
}

/**
 * Theme-independent header geometry. A theme is color-only (#248), so switching palettes must not
 * change the header box, padding/gap/font metrics or any child/button box.
 */
async function headerLayout(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header')
    if (!header) throw new Error('header missing')
    const style = getComputedStyle(header)
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return [rect.x, rect.y, rect.width, rect.height].map(
        (value) => Math.round(value * 100) / 100,
      )
    }
    return {
      header: box(header),
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      gap: [style.rowGap, style.columnGap],
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      children: [...header.children].map(box),
      buttons: [...header.querySelectorAll('button')].map(box),
    }
  })
}

async function selectTheme(page: Page, label: string) {
  await page.getByRole('button', { name: 'Tema seç' }).click()
  await page.getByRole('menuitemradio', { name: label }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', label.toLowerCase())
}

test('cream is a warm light palette with dark readable text and visible edges', async ({
  page,
}) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: twoWorkspacePayload })
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.getByRole('button', { name: 'Notes panelini kapat' })).toBeVisible()

  // Existing themes stay in the menu, and Cream is a radio item of the same menu.
  await page.getByRole('button', { name: 'Tema seç' }).click()
  const themeItems = page.getByRole('menuitemradio')
  await expect(themeItems).toHaveCount(7)
  await expect(themeItems).toHaveText([
    'Neutral',
    'Stone',
    'Mauve',
    'Taupe',
    'Olive',
    'Black',
    'Cream',
  ])
  await page.getByRole('menuitemradio', { name: 'Cream' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
  ).toBe('light')
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe('cream')

  // Painted surfaces: warm cream page + a lightly lighter panel.
  const backgroundToken = await themeToken(page, '--background')
  const cardToken = await themeToken(page, '--card')
  const popoverToken = await themeToken(page, '--popover')
  const background = await paint(page, [backgroundToken])
  const card = await paint(page, [cardToken])
  const popover = await paint(page, [popoverToken])
  const secondary = await paint(page, [await themeToken(page, '--secondary')])
  const muted = await paint(page, [await themeToken(page, '--muted')])
  const accent = await paint(page, [await themeToken(page, '--accent')])

  // Exact reference base sampled from the supplied image: dominant canvas RGB #FDF6E4.
  expect(backgroundToken.toLowerCase()).toBe('#fdf6e4')
  expect(rgb(background)).toEqual([253, 246, 228])
  expect(rgb(await bodyBackground(page))).toEqual([253, 246, 228])
  expect(rgb(card)).toEqual(rgb(await cardBackground(page)))
  expect(background.r).toBeGreaterThan(background.g)
  expect(background.g).toBeGreaterThan(background.b)
  expect(luminance(background)).toBeGreaterThan(0.8)
  // Panel/popover/secondary/muted/hover stay subtly differentiated from the canvas.
  for (const surface of [card, popover, secondary, muted, accent]) {
    expect(contrast(surface, background)).toBeGreaterThan(1.02)
    expect(contrast(surface, background)).toBeLessThan(1.5)
  }

  // Text tokens: dark primary text, readable muted text on every light surface.
  const foreground = await paint(page, [await themeToken(page, '--foreground')])
  const mutedForeground = await paint(page, [await themeToken(page, '--muted-foreground')])
  expect(contrast(foreground, background)).toBeGreaterThanOrEqual(10)
  expect(contrast(foreground, card)).toBeGreaterThanOrEqual(10)
  expect(contrast(mutedForeground, background)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(mutedForeground, card)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(mutedForeground, muted)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(mutedForeground, accent)).toBeGreaterThanOrEqual(4.5)

  // The panel title paints the dark card foreground, not a leftover light color.
  const cardTitleColor = await paint(page, [
    await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-slot="card-title"]')!).color,
    ),
  ])
  expect(contrast(cardTitleColor, card)).toBeGreaterThanOrEqual(10)

  // Edges and focus: the dark-theme translucent white hairlines must not survive on cream.
  const border = await paint(page, [cardToken, await themeToken(page, '--border')])
  const input = await paint(page, [cardToken, await themeToken(page, '--input')])
  const ring = await paint(page, [await themeToken(page, '--ring')])
  expect(contrast(border, card)).toBeGreaterThanOrEqual(1.5)
  expect(contrast(input, card)).toBeGreaterThanOrEqual(1.7)
  expect(contrast(ring, background)).toBeGreaterThanOrEqual(3)

  // Market tokens stay distinguishable and readable on the light canvas.
  const up = await paint(page, [await themeToken(page, '--up')])
  const down = await paint(page, [await themeToken(page, '--down')])
  const bid = await paint(page, [await themeToken(page, '--bid')])
  const ask = await paint(page, [await themeToken(page, '--ask')])
  const long = await paint(page, [await themeToken(page, '--long')])
  const short = await paint(page, [await themeToken(page, '--short')])
  for (const color of [up, bid, long, down, ask, short]) {
    expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5)
  }
  expect(rgb(up)).not.toEqual(rgb(down))
  expect(rgb(bid)).not.toEqual(rgb(ask))

  // Chart tokens stay legible as data lines on the light panel.
  for (const index of [1, 2, 3, 4, 5]) {
    const chartColor = await paint(page, [await themeToken(page, `--chart-${index}`)])
    expect(contrast(chartColor, card)).toBeGreaterThanOrEqual(3)
  }

  // Menus (popover) are a light surface with dark text, not a dark fragment.
  await page.getByRole('button', { name: 'Tema seç' }).click()
  const menuSurface = await paint(page, [
    await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-slot="dropdown-menu-content"]')!).backgroundColor,
    ),
  ])
  expect(rgb(menuSurface)).toEqual(rgb(popover))
  const menuItemColor = await paint(page, [
    await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-slot="dropdown-menu-radio-item"]')!).color,
    ),
  ])
  expect(contrast(menuItemColor, menuSurface)).toBeGreaterThanOrEqual(7)
  await page.keyboard.press('Escape')
})

test('cream survives a reload and a workspace switch', async ({ page }) => {
  await seedLocalStorage(page, {
    [THEME_STORAGE_KEY]: 'cream',
    [WORKSPACE_STORAGE_KEY]: twoWorkspacePayload,
  })
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
  ).toBe('light')

  const creamBackground = await paint(page, [await themeToken(page, '--background')])
  expect(rgb(creamBackground)).toEqual(rgb(await bodyBackground(page)))

  // The theme is global: switching workspaces neither changes nor reapplies a dark class.
  await page.getByRole('button', { name: 'Workspace 2' }).click()
  await expect(page.getByRole('button', { name: 'Workspace 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('[data-slot="card"]')).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  expect(rgb(await bodyBackground(page))).toEqual(rgb(creamBackground))

  await page.getByRole('button', { name: 'Workspace 1' }).click()
  await expect(page.getByRole('button', { name: 'Workspace 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

  // The persisted selection is what a fresh load reads.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
  ).toBe('light')
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe('cream')
  expect(rgb(await bodyBackground(page))).toEqual(rgb(creamBackground))
})

test('switching back to Black and Neutral restores the dark mode', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: twoWorkspacePayload })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral')

  const neutralBackgroundToken = await themeToken(page, '--background')
  const neutralCardToken = await themeToken(page, '--card')
  const neutralBackground = await paint(page, [neutralBackgroundToken])

  await selectTheme(page, 'Cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

  await selectTheme(page, 'Black')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
  ).toBe('dark')
  expect(rgb(await bodyBackground(page))).toEqual([0, 0, 0])

  await selectTheme(page, 'Neutral')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
  ).toBe('dark')
  expect(rgb(await bodyBackground(page))).toEqual(rgb(neutralBackground))
  expect(rgb(await cardBackground(page))).toEqual(rgb(await paint(page, [neutralCardToken])))

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
})

test('switching to Cream keeps the header geometry identical', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: twoWorkspacePayload })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral')

  // The reported regression was header spacing after selecting Cream. Compare the exact
  // header/child/button boxes and font/gap/padding metrics at a wide and a wrapped viewport.
  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('button', { name: 'Notes panelini kapat' })).toBeVisible()
    const neutral = await headerLayout(page)
    await selectTheme(page, 'Cream')
    expect(await headerLayout(page)).toEqual(neutral)
    await selectTheme(page, 'Neutral')
    expect(await headerLayout(page)).toEqual(neutral)
  }
})

test('cream is selectable with the keyboard', async ({ page }) => {
  await seedLocalStorage(page, { [WORKSPACE_STORAGE_KEY]: twoWorkspacePayload })
  await page.goto('/')

  const trigger = page.getByRole('button', { name: 'Tema seç' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()

  const focusedLabel = () =>
    page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
  for (let step = 0; step < 10 && (await focusedLabel()) !== 'Cream'; step += 1) {
    const before = await focusedLabel()
    await page.keyboard.press('ArrowDown')
    // Radix moves focus after the key event; wait for the move before pressing again.
    await expect.poll(focusedLabel).not.toBe(before)
  }
  expect(await focusedLabel()).toBe('Cream')
  await page.keyboard.press('Enter')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe('cream')
})
