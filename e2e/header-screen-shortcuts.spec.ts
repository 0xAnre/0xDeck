import { expect, test, type Page } from '@playwright/test'

const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const SCREEN_COUNT = 9

function notesWorkspacePayload(): string {
  return JSON.stringify({
    version: 2,
    activeWorkspaceId: 'ws-1',
    workspaces: [
      {
        id: 'ws-1',
        activePanels: ['notes-header-shortcuts'],
        layout: [{ i: 'notes-header-shortcuts', x: 0, y: 0, w: 18, h: 12 }],
        gridVersion: 3,
      },
    ],
  })
}

async function openWorkspace(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: WORKSPACE_STORAGE_KEY, value: notesWorkspacePayload() },
  )
  await page.goto('/')
  await expect(page.locator('main.workspace-scroller')).toBeVisible()
  await expect
    .poll(() =>
      page.locator('main.workspace-scroller').evaluate((element, screenCount) => {
        const scroller = element as HTMLElement
        return scroller.scrollHeight >= scroller.clientHeight * screenCount
      }, SCREEN_COUNT),
    )
    .toBe(true)
}

async function currentScreenIndex(page: Page): Promise<number> {
  return page.locator('main.workspace-scroller').evaluate((element) => {
    const scroller = element as HTMLElement
    return Math.round(scroller.scrollTop / scroller.clientHeight)
  })
}

async function expectTooltip(page: Page, expected: string): Promise<void> {
  await expect(page.getByRole('tooltip', { name: expected, exact: true })).toBeVisible()
}

test('compact header controls expose names, tooltips, active state, and retained triggers', async ({
  page,
}) => {
  await openWorkspace(page)

  const screenGroup = page.getByRole('group', { name: 'Screen navigation' })
  await expect(screenGroup).toBeVisible()

  for (let screenNumber = 1; screenNumber <= 5; screenNumber += 1) {
    const button = page.getByRole('button', { name: `Go to Screen ${screenNumber}` })
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('aria-pressed', screenNumber === 1 ? 'true' : 'false')
    await button.focus()
    await expectTooltip(page, `Go to Screen ${screenNumber}`)
    await button.evaluate((element) => element.blur())
    await page.mouse.move(0, 0)
    await button.hover()
    await expectTooltip(page, `Go to Screen ${screenNumber}`)
    await page.mouse.move(0, 0)
  }
  await expect(page.getByRole('button', { name: 'Go to Screen 1' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  const iconControls = [
    {
      button: page.getByRole('button', { name: /Screen Lock off/ }),
      tooltip: 'Screen Lock off — lock workspace scrolling to the active screen',
    },
    { button: page.getByRole('button', { name: 'Tema seç' }), tooltip: 'Choose theme' },
    { button: page.getByRole('button', { name: 'Widget ekle' }), tooltip: 'Add widget (1 open)' },
    {
      button: page.getByRole('button', { name: 'Data source' }),
      tooltip: 'Configure data source',
    },
  ]

  for (const { button, tooltip } of iconControls) {
    await expect(button.locator('svg')).toHaveCount(1)
    await expect(button).toHaveText('')
    await button.focus()
    await expectTooltip(page, tooltip)
    await button.evaluate((element) => element.blur())
    await page.mouse.move(0, 0)
    await button.hover()
    await expectTooltip(page, tooltip)
    await page.mouse.move(0, 0)
  }

  const themeButton = page.getByRole('button', { name: 'Tema seç' })
  await themeButton.click()
  await expect(page.getByRole('menuitemradio').first()).toBeVisible()
  await page.keyboard.press('Escape')

  const widgetButton = page.getByRole('button', { name: 'Widget ekle' })
  await widgetButton.click()
  await expect(page.getByRole('menuitem').first()).toBeVisible()
  await page.keyboard.press('Escape')

  const dataSourceButton = page.getByRole('button', { name: 'Data source' })
  await dataSourceButton.click()
  await expect(page.getByRole('dialog', { name: 'Data source' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('Screen 1–5 clicks reuse smooth and locked screen navigation behavior', async ({ page }) => {
  await openWorkspace(page)

  const screenFive = page.getByRole('button', { name: 'Go to Screen 5' })
  await screenFive.click()
  await expect.poll(() => currentScreenIndex(page)).toBe(4)
  await expect(screenFive).toHaveAttribute('aria-pressed', 'true')
  await expect(screenFive).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Go to Screen 1' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem('0xdeck-workspace-screen')))
    .toBe('4')

  const lockButton = page.getByRole('button', { name: /Screen Lock off/ })
  await lockButton.click()
  const lockedButton = page.getByRole('button', { name: /Screen Lock on/ })
  await expect(lockedButton).toHaveAttribute('aria-pressed', 'true')

  const screenTwo = page.getByRole('button', { name: 'Go to Screen 2' })
  await screenTwo.click()
  await expect.poll(() => currentScreenIndex(page)).toBe(1)
  await expect(screenTwo).toHaveAttribute('aria-current', 'page')

  const exactLockedOffset = await page.locator('main.workspace-scroller').evaluate((element) => {
    const scroller = element as HTMLElement
    return scroller.scrollTop === scroller.clientHeight
  })
  expect(exactLockedOffset).toBe(true)

  await page.locator('main.workspace-scroller').evaluate((element) => {
    const scroller = element as HTMLElement
    scroller.scrollTop += 200
  })
  await expect.poll(() => currentScreenIndex(page)).toBe(1)
})
