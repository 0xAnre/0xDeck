import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = '/Users/0xanrelins/Desktop/lead-coder/coder/screenshots'
const BASE = 'http://localhost:57341'
const PANEL = 'btc-perpetual-chart-e2e'
const VP_PATH = '/api/market/binance/usdm/btcusdt/klines/volume-profile'

async function setupWorkspace(page) {
  await page.evaluate((panelId) => {
    localStorage.setItem(
      '0xdeck-workspace',
      JSON.stringify({
        activePanels: [panelId],
        layout: [{ i: panelId, x: 0, y: 0, w: 18, h: 14, minW: 12, minH: 10 }],
        gridVersion: 3,
      }),
    )
    const k = '0xdeck-widget-fixed-range-vp-instances'
    const m = JSON.parse(localStorage.getItem(k) || '{}')
    m[panelId] = []
    localStorage.setItem(k, JSON.stringify(m))
  }, PANEL)
}

async function waitForTools(page) {
  const tools = page.locator(`#${PANEL}-tools`)
  await tools.waitFor({ state: 'attached', timeout: 120000 })
  for (let i = 0; i < 120; i++) {
    if (!(await tools.isDisabled())) return
    await page.waitForTimeout(1000)
  }
  throw new Error('Tools stayed disabled')
}

async function installPaneInstrumentation(page) {
  await page.evaluate(() => {
    window.__frvpAcceptance = {
      native: { pointerdown: 0, pointerup: 0, click: 0 },
      lcSubscribeClick: 0,
      trials: [],
    }
    const hookPane = () => {
      const pane = document.querySelector('div.tv-lightweight-charts')?.parentElement
      const target = pane ?? document.querySelector('canvas')?.parentElement
      if (!target || target.dataset.frvpHooked) return false
      target.dataset.frvpHooked = '1'
      for (const type of ['pointerdown', 'pointerup', 'click']) {
        target.addEventListener(
          type,
          () => {
            window.__frvpAcceptance.native[type] += 1
          },
          true,
        )
      }
      return true
    }
    hookPane()
    const observer = new MutationObserver(() => hookPane())
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

async function countInstances(page) {
  return page.evaluate((panelId) => {
    const k = '0xdeck-widget-fixed-range-vp-instances'
    const m = JSON.parse(localStorage.getItem(k) || '{}')
    return (m[panelId] || []).length
  }, PANEL)
}

async function armTool(page) {
  await page.locator(`#${PANEL}-tools`).click()
  await page.getByRole('menuitem', { name: /Fixed Range Volume Profile/i }).click()
  await page.waitForTimeout(300)
}

async function pointerClick(page, xRatio, yRatio) {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas missing')
  const x = box.x + box.width * xRatio
  const y = box.y + box.height * yRatio
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.up({ button: 'left' })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 960, height: 720 } })
page.setDefaultTimeout(120000)

const vpResponses = []
page.on('response', (response) => {
  if (response.url().includes(VP_PATH)) {
    vpResponses.push({ status: response.status(), url: response.url() })
  }
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await setupWorkspace(page)
await page.reload({ waitUntil: 'domcontentloaded' })
await waitForTools(page)
await installPaneInstrumentation(page)

const trials = []
for (let i = 0; i < 10; i++) {
  const before = await countInstances(page)
  const nativeBefore = await page.evaluate(() => ({ ...window.__frvpAcceptance.native }))
  await armTool(page)
  const x1 = 0.22 + (i % 5) * 0.05
  const x2 = 0.48 + (i % 5) * 0.05
  await pointerClick(page, x1, 0.58)
  await page.waitForTimeout(350)
  await pointerClick(page, x2, 0.58)
  await page.waitForTimeout(1500)
  const after = await countInstances(page)
  const nativeAfter = await page.evaluate(() => ({ ...window.__frvpAcceptance.native }))
  const trial = {
    trial: i + 1,
    before,
    after,
    ok: after === before + 1,
    nativeDelta: {
      pointerdown: nativeAfter.pointerdown - nativeBefore.pointerdown,
      pointerup: nativeAfter.pointerup - nativeBefore.pointerup,
      click: nativeAfter.click - nativeBefore.click,
    },
  }
  trials.push(trial)
  await page.evaluate((entry) => {
    window.__frvpAcceptance.trials.push(entry)
  }, trial)
}

const beforeDbl = await countInstances(page)
await armTool(page)
await pointerClick(page, 0.32, 0.62)
await page.waitForTimeout(100)
const box = await page.locator('canvas').first().boundingBox()
const cx = box.x + box.width * 0.52
const cy = box.y + box.height * 0.62
await page.mouse.move(cx, cy)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(40)
await page.mouse.click(cx, cy, { clickCount: 2, delay: 40 })
await page.waitForTimeout(1500)
const afterDbl = await countInstances(page)

const acceptance = await page.evaluate(() => window.__frvpAcceptance)
acceptance.doubleClick = { before: beforeDbl, after: afterDbl, ok: afterDbl === beforeDbl + 1 }
acceptance.volumeProfileResponses = vpResponses
acceptance.passCount = trials.filter((t) => t.ok).length

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  join(OUT_DIR, 'frvp-pointer-selection-events.json'),
  JSON.stringify(acceptance, null, 2),
)
await page.screenshot({
  path: join(OUT_DIR, 'frvp-pointer-selection-10-of-10.png'),
  fullPage: true,
})

console.log(JSON.stringify({ passCount: acceptance.passCount, trials, doubleClick: acceptance.doubleClick }))
await browser.close()

if (acceptance.passCount !== 10) {
  process.exit(1)
}
