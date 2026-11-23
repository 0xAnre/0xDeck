import { expect, test } from '@playwright/test'
import { mockApi, VIEWPORT } from '../perf/workload.mjs'
import { mockHistoryMarket, seedHistoryWorkspace } from '../perf/history-workload.mjs'

/**
 * Issue #264 regression guard for the riskiest behavior change: an indicator
 * that was switched on after history loaded must paint immediately from the
 * already-loaded candles.
 *
 * The panel only derives series that are planned (`chartIndicatorSeriesPlan`),
 * so switching 3 EMA on must hydrate it there and then — not after a later
 * history page. The assertions are counter/behavior based, never wall-clock:
 * - enabling 3 EMA changes the panel pixels,
 * - enabling it issues no `/klines/history` request (the loaded candles suffice),
 * - the page records no console/page errors.
 *
 * The spec does not pin a duration, so it cannot flake on a slow machine.
 */
test.use({ viewport: VIEWPORT })

test('enabling 3 EMA after history loads paints immediately without a history request', async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  const marketRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/market/')) marketRequests.push(url)
  })

  const requestLog = new Map()
  await seedHistoryWorkspace(page.context())
  await mockApi(page, requestLog)
  await mockHistoryMarket(page, requestLog)

  await page.goto('/')
  await page.waitForSelector('.react-grid-item canvas', { timeout: 30_000 })
  // The initial daily-context request is the chart's history contract; wait for
  // it to complete through the network listener (resource timing omits
  // route-fulfilled requests in headless Chromium).
  await expect
    .poll(() => marketRequests.some((url) => url.includes('/klines')), { timeout: 30_000 })
    .toBe(true)
  await page.waitForTimeout(1_000)

  expect(consoleErrors).toEqual([])

  const panel = page.locator('.react-grid-item').first()
  const before = await panel.screenshot()
  const historyRequestsBefore = marketRequests.filter((url) => url.includes('/klines/history')).length

  await page.locator('[aria-label="Indicators"]').click()
  const toggle = await page.evaluateHandle(() => {
    const menu = document.querySelector('[role="menu"]')
    if (!menu) return null
    const label = [...menu.querySelectorAll('span')].find(
      (span) => span.textContent?.trim() === '3 EMA',
    )
    const row = label?.closest('div')?.parentElement
    return row?.querySelector('[aria-label="Show object"]') ?? null
  })
  const element = toggle.asElement()
  expect(element).not.toBeNull()
  await element!.click()
  await page.waitForTimeout(500)

  const after = await panel.screenshot()
  expect(after.equals(before)).toBe(false)

  const historyRequestsAfter = marketRequests.filter((url) => url.includes('/klines/history')).length
  expect(historyRequestsAfter).toBe(historyRequestsBefore)
  expect(consoleErrors).toEqual([])
})
