import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Opt-in paired performance evidence for the consolidated Rolling VWAP band
 * primitive (#262). It is skipped by the normal `npm run test:e2e` run:
 *
 *   OXDECK_RVWAP_PERF=1 npx playwright test e2e/rolling-vwap-band-perf.spec.ts
 *
 * Both variants are driven from the same harness: identical candles, points,
 * viewport and cadence. `base` is the pre-#262 seven-native-series shape, the
 * `consolidated` cell is the production bundle. Each tick also updates the
 * candle series, 200 attached markers and five EMA lines so the measurement is
 * a full panel, not the band-only fixture the research prototype used.
 *
 * No wall-clock budget is asserted. The evidence is the native update count
 * (7 vs 1 per instance per tick), the paired handler samples and the raw JSON
 * written under `perf/evidence/`; timings are machine-specific.
 */

const RUN = process.env.OXDECK_RVWAP_PERF === '1'
const TICK_REPS = Number(process.env.OXDECK_RVWAP_TICK_REPS ?? 3)
const PAGE_REPS = Number(process.env.OXDECK_RVWAP_PAGE_REPS ?? 2)
const TICKS = Number(process.env.OXDECK_RVWAP_TICKS ?? 10)
const CADENCE_MS = Number(process.env.OXDECK_RVWAP_CADENCE_MS ?? 1_000)

type TickCell = {
  variant: 'base' | 'consolidated'
  rep: number
  handlerMs: number[]
  arrivalMs: number[]
  nativeUpdates: number
  setDataCalls: number
  visitedPoints: number
  rebuilds: number
  invalidations: number
  rafFrames: number
}

type PageCell = {
  variant: 'base' | 'consolidated'
  rep: number
  perPageMs: number[]
  finalCandles: number
  nativeUpdates: number
  setDataCalls: number
  visitedPoints: number
}

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function gitHead(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown'
  }
}

function packageVersion(name: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(process.cwd(), 'node_modules', name, 'package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

test.describe('Rolling VWAP band primitive performance evidence', () => {
  test.skip(!RUN, 'opt-in: set OXDECK_RVWAP_PERF=1')
  test('matched full-panel tick and natural paging cells', async ({ page }) => {
    test.setTimeout(30 * 60_000)
    await page.setViewportSize({ width: 1800, height: 700 })
    await page.goto('/e2e/fixtures/rolling-vwap-band-primitive.html')
    await expect
      .poll(() => page.evaluate(() => typeof window.__rvwapHarness))
      .toBe('object')

    const tickCells: TickCell[] = []
    for (let rep = 0; rep < TICK_REPS; rep += 1) {
      for (const variant of ['base', 'consolidated'] as const) {
        await page.evaluate(async (input) => {
          await window.__rvwapHarness.create(input)
        }, {
          n: 20_000,
          visible: 39,
          instanceCount: 3,
          fullPanel: true,
          markers: 200,
          multipliers: [1, 2, 3],
        })
        const cell = (await page.evaluate(async (options) => {
          const result = await window.__rvwapHarness.stepTickCadence(options)
          const stats = result.stats as {
            base: { updates: number; setData: number } | null
            consolidated: { updates: number; setData: number } | null
            primitive: Array<{ visitedPoints: number; rebuilds: number; invalidations: number }>
            rafFrames: number
          }
          const side = options.variant === 'base' ? stats.base : stats.consolidated
          const primitive = stats.primitive[0]
          return {
            handlerMs: result.handlerMs,
            arrivalMs: result.arrivalMs,
            nativeUpdates: side?.updates ?? 0,
            setDataCalls: side?.setData ?? 0,
            visitedPoints: primitive?.visitedPoints ?? 0,
            rebuilds: primitive?.rebuilds ?? 0,
            invalidations: primitive?.invalidations ?? 0,
            rafFrames: stats.rafFrames,
          }
        }, { variant, ticks: TICKS, cadenceMs: CADENCE_MS })) as Omit<TickCell, 'variant' | 'rep'>
        tickCells.push({ variant, rep, ...cell })
      }
    }

    const pageCells: PageCell[] = []
    for (let rep = 0; rep < PAGE_REPS; rep += 1) {
      for (const variant of ['base', 'consolidated'] as const) {
        await page.evaluate(async (input) => {
          await window.__rvwapHarness.create(input)
        }, {
          n: 750,
          visible: 39,
          instanceCount: 3,
          fullPanel: true,
          markers: 200,
          multipliers: [1, 2, 3],
        })
        const cell = (await page.evaluate(async (options) => {
          const result = await window.__rvwapHarness.stepPages(options)
          const stats = result.stats as {
            base: { updates: number; setData: number } | null
            consolidated: { updates: number; setData: number } | null
            primitive: Array<{ visitedPoints: number }>
            candles: number
          }
          const side = options.variant === 'base' ? stats.base : stats.consolidated
          return {
            perPageMs: result.perPageMs,
            finalCandles: stats.candles,
            nativeUpdates: side?.updates ?? 0,
            setDataCalls: side?.setData ?? 0,
            visitedPoints: stats.primitive[0]?.visitedPoints ?? 0,
          }
        }, { variant, pages: 40, pageRows: 500 })) as Omit<PageCell, 'variant' | 'rep'>
        pageCells.push({ variant, rep, ...cell })
      }
    }

    const summarize = (cells: TickCell[]) => {
      const byVariant = (variant: TickCell['variant']) => cells.filter((cell) => cell.variant === variant)
      const perRep = (variant: TickCell['variant']) =>
        byVariant(variant).map((cell) => median(cell.handlerMs))
      const baseReps = perRep('base')
      const consolidatedReps = perRep('consolidated')
      return {
        baseHandlerMedianMs: median(baseReps),
        consolidatedHandlerMedianMs: median(consolidatedReps),
        pairedRatios: baseReps.map((base, index) =>
          consolidatedReps[index] === undefined ? null : base / consolidatedReps[index],
        ),
        nativeUpdatesPerTick: {
          base: byVariant('base').map((cell) => cell.nativeUpdates / TICKS),
          consolidated: byVariant('consolidated').map((cell) => cell.nativeUpdates / TICKS),
        },
        visitedPoints: consolidatedReps.length > 0
          ? Math.max(...byVariant('consolidated').map((cell) => cell.visitedPoints))
          : 0,
        rebuildsPerTick: byVariant('consolidated').map((cell) => cell.rebuilds / TICKS),
        invalidationsPerCell: byVariant('consolidated').map((cell) => cell.invalidations),
        rafFramesPerCell: byVariant('consolidated').map((cell) => cell.rafFrames),
      }
    }

    const pageSummary = (cells: PageCell[]) => ({
      basePerPageMedianMs: median(cells.filter((cell) => cell.variant === 'base').map((cell) => median(cell.perPageMs))),
      consolidatedPerPageMedianMs: median(cells.filter((cell) => cell.variant === 'consolidated').map((cell) => median(cell.perPageMs))),
      finalCandles: cells.map((cell) => cell.finalCandles),
      nativeUpdates: cells.map((cell) => ({ variant: cell.variant, updates: cell.nativeUpdates })),
      visitedPoints: Math.max(...cells.map((cell) => cell.visitedPoints)),
    })

    const evidence = {
      schema: 1,
      issue: 262,
      generatedAt: new Date().toISOString(),
      gitHead: gitHead(),
      library: {
        lightweightCharts: packageVersion('lightweight-charts'),
        playwright: packageVersion('@playwright/test'),
      },
      host: {
        platform: process.platform,
        release: os.release(),
        cpu: os.cpus()[0]?.model ?? 'unknown',
        cpuCount: os.cpus().length,
        totalMemBytes: os.totalmem(),
      },
      runtime: {
        node: process.version,
        devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
        viewport: await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
      },
      config: {
        ticks: TICKS,
        cadenceMs: CADENCE_MS,
        tickReps: TICK_REPS,
        pageReps: PAGE_REPS,
        pageRows: 500,
        pages: 40,
        history: 20_000,
        visibleBars: 39,
        instances: 3,
        fullPanel: 'candles + 200 attached markers + 5 EMA lines + 3 Rolling VWAP instances',
        frvp: 'not included: no FRVP control in this cell',
      },
      tickCells,
      pageCells,
      summary: { ticks: summarize(tickCells), pages: pageSummary(pageCells) },
    }

    const outDir = path.join(process.cwd(), 'perf/evidence')
    mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outPath = path.join(outDir, `rolling-vwap-band-${stamp}-${evidence.gitHead.slice(0, 12)}.json`)
    writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`)
    test.info().annotations.push({ type: 'evidence', description: outPath })
    console.log(`evidence: ${outPath}`)
    console.log(JSON.stringify(evidence.summary, null, 2))

    // Counter gates only: no machine-specific millisecond threshold.
    for (const cell of tickCells) {
      const expected = cell.variant === 'base' ? 21 : 3
      expect(cell.nativeUpdates / TICKS, `${cell.variant} native updates/tick`).toBe(expected)
      expect(cell.setDataCalls).toBe(0)
    }
    for (const cell of pageCells) {
      expect(cell.finalCandles).toBeGreaterThanOrEqual(20_000)
      expect(cell.visitedPoints).toBeLessThanOrEqual(41)
    }
  })
})
