/**
 * Standalone experiment page: live Hyperliquid BTC open-position liquidation
 * levels from the public, keyless MarketLens L4 stream.
 *
 * Deliberately not part of the 0xDeck workspace app: no registry entry, no
 * panel, no backend route. Built by `vite.liquidations.config.ts` into its own
 * artifact (see docs/MARKETLENS-LIQUIDATIONS-DEMO.md).
 *
 * These are the liquidation *prices* of positions that are still open, sized by
 * the position — not executed liquidation events.
 */
import { createStreamClient, type StreamStatus } from './client.ts'
import { decodeLiquidationsFile } from './decode.ts'
import {
  formatAge,
  formatClock,
  formatCount,
  formatNotional,
  formatPrice,
  formatQuantity,
  formatSize,
  shortAddress,
} from './format.ts'
import { buildProfile, positionsAtRow, rowPriceBand, type Profile } from './model.ts'
import { applyFile, LIQUIDATIONS_URL, totals, type Book } from './protocol.ts'
import { computeLayout, renderChart } from './render.ts'
import {
  fitView,
  panView,
  priceMassProfile,
  spanOf,
  yToPrice,
  zoomView,
  type View,
} from './view.ts'

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`missing #${id} in the page`)
  return element as T
}

const canvas = required<HTMLCanvasElement>('canvas')
const plot = required<HTMLDivElement>('plot')
const tooltip = required<HTMLDivElement>('tooltip')
const overlay = required<HTMLDivElement>('overlay')
const banner = required<HTMLDivElement>('banner')
const statusPill = required<HTMLDivElement>('status')
const footer = required<HTMLDivElement>('footer')
const recentreButton = required<HTMLButtonElement>('recentre')

let book: Book | null = null
let view: View | null = null
let profile: Profile | null = null
let hoverRow: number | null = null
let streamStatus: StreamStatus = {
  phase: 'idle',
  attempt: 0,
  reason: null,
  retryInMs: null,
  lastDataAt: null,
  lastFrameAt: null,
}
let resyncingReason: string | null = null
let lastError: string | null = null
let userAdjustedView = false
let filesApplied = 0
let lastDecodeMs = 0
let lastFileClock = 0
let rafId = 0

// ---------------------------------------------------------------- data intake

/**
 * Messages are applied strictly in order: a delta's `seq` only means something
 * relative to the file before it, so decoding cannot be parallelised per file.
 */
const pending: ArrayBuffer[] = []
let draining = false
const MAX_QUEUED = 120

function enqueue(buffer: ArrayBuffer): void {
  pending.push(buffer)
  if (pending.length > MAX_QUEUED) {
    // Falling this far behind a live stream is itself a lost-delta risk.
    pending.length = 0
    requestResync('local decoder fell behind the stream')
    return
  }
  void drain()
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (pending.length > 0) {
      const buffer = pending.shift()
      if (!buffer) break
      await applyOne(buffer)
    }
  } finally {
    draining = false
    requestRender()
  }
}

async function applyOne(buffer: ArrayBuffer): Promise<void> {
  let decoded
  try {
    decoded = await decodeLiquidationsFile(buffer)
  } catch (error) {
    lastError = `Could not decode a stream message: ${describe(error)}`
    requestRender()
    return
  }
  lastDecodeMs = decoded.decodeMs
  lastFileClock = decoded.head.ts
  lastError = null

  const outcome = applyFile(book, decoded.head, decoded.rows)
  if (outcome.status === 'reset') {
    requestResync(outcome.detail)
    return
  }
  if (outcome.status === 'duplicate') return

  book = outcome.book
  filesApplied += 1
  resyncingReason = null

  if (view === null) {
    view = fitBook()
    userAdjustedView = false
  } else if (!userAdjustedView) {
    // Keep the framing honest while the book drifts: if the current window no
    // longer holds any liquidity, re-frame instead of showing an empty ladder.
    const current = view
    let visible = 0
    for (const position of book.positions.values()) {
      if (position.price >= current.min && position.price <= current.max) {
        visible += 1
        if (visible > 0) break
      }
    }
    if (visible === 0) view = fitBook()
  }
  requestRender()
}

function requestResync(reason: string): void {
  resyncingReason = reason
  client.reconnect(reason)
  requestRender()
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// ------------------------------------------------------------------- viewport

function plotSize(): { width: number; height: number } {
  const rect = plot.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

function currentLayout() {
  const { width, height } = plotSize()
  return computeLayout(width, height)
}

function currentView(): View {
  if (view) return view
  return { min: 0, max: 1 }
}

function requestRender(): void {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    draw()
  })
}

function draw(): void {
  const layout = currentLayout()
  const activeView = currentView()
  profile = buildProfile(book ? book.positions.values() : [], {
    view: activeView,
    top: layout.plotTop,
    bottom: layout.plotBottom,
    rowHeight: 1,
  })
  renderChart(canvas, {
    layout,
    profile,
    hoverRow,
    dpr: Math.min(3, Math.max(1, window.devicePixelRatio || 1)),
    empty: book === null,
  })
  updateOverlay()
  updateFooter()
  updateAria()
}

/** Frame the ladder on where 60 % of the positions sit, with padding. */
function fitBook(): View | null {
  if (!book) return null
  return fitView(priceMassProfile(book.positions.values()), {
    lower: 0.2,
    upper: 0.8,
    pad: 0.1,
  })
}

function recentre(): void {
  if (!book) return
  view = fitBook()
  userAdjustedView = false
  hoverRow = null
  hideTooltip()
  requestRender()
}

function zoomAt(y: number, factor: number): void {
  const layout = currentLayout()
  if (layout.plotBottom <= layout.plotTop) return
  const anchor = yToPrice(currentView(), layout.plotTop, layout.plotBottom, y)
  view = zoomView(currentView(), anchor, factor)
  userAdjustedView = true
  requestRender()
}

function panByPixels(deltaY: number): void {
  const layout = currentLayout()
  const height = layout.plotBottom - layout.plotTop
  if (height <= 0) return
  const priceDelta = (deltaY / height) * spanOf(currentView())
  view = panView(currentView(), priceDelta)
  userAdjustedView = true
  requestRender()
}

// ---------------------------------------------------------------- interaction

plot.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    const rect = plot.getBoundingClientRect()
    const layout = currentLayout()
    const y = event.clientY - rect.top
    if (y < layout.plotTop || y > layout.plotBottom) return
    const factor = Math.exp(
      Math.max(-0.5, Math.min(0.5, event.deltaY * 0.0016)),
    )
    zoomAt(y, factor)
  },
  { passive: false },
)

interface DragState {
  pointerId: number
  startY: number
  lastY: number
}

let drag: DragState | null = null

plot.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  drag = { pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY }
  plot.setPointerCapture(event.pointerId)
  plot.classList.add('dragging')
  hideTooltip()
})

plot.addEventListener('pointermove', (event) => {
  if (drag && drag.pointerId === event.pointerId) {
    const delta = event.clientY - drag.lastY
    drag.lastY = event.clientY
    if (delta !== 0) panByPixels(delta)
    return
  }
  updateHover(event)
})

plot.addEventListener('pointerup', (event) => {
  if (drag && drag.pointerId === event.pointerId) {
    const wasTap = Math.abs(event.clientY - drag.startY) < 3
    drag = null
    plot.classList.remove('dragging')
    if (wasTap) updateHover(event)
  }
})

plot.addEventListener('pointercancel', () => {
  drag = null
  plot.classList.remove('dragging')
})

plot.addEventListener('pointerleave', () => {
  if (drag) return
  hoverRow = null
  hideTooltip()
  requestRender()
})

plot.addEventListener('dblclick', (event) => {
  event.preventDefault()
  recentre()
})

recentreButton.addEventListener('click', () => recentre())

function updateHover(event: PointerEvent): void {
  if (!profile) return
  const rect = plot.getBoundingClientRect()
  const y = event.clientY - rect.top
  const layout = currentLayout()
  if (y < layout.plotTop || y > layout.plotBottom) {
    if (hoverRow !== null) {
      hoverRow = null
      hideTooltip()
      requestRender()
    }
    return
  }
  const row = Math.min(
    profile.rowCount - 1,
    Math.max(0, Math.floor(y - profile.top)),
  )
  if (row !== hoverRow) {
    hoverRow = row
    requestRender()
  }
  showTooltip(row, event.clientX - rect.left, event.clientY - rect.top)
}

function showTooltip(row: number, x: number, y: number): void {
  if (!book || !profile) return
  const band = rowPriceBand(profile, row)
  const inRow = positionsAtRow(
    book.positions.values(),
    profile,
    row,
    Number.MAX_SAFE_INTEGER,
  )
  if (inRow.length === 0) {
    hideTooltip()
    return
  }
  const shown = inRow.slice(0, 8)
  let totalLong = 0
  let totalShort = 0
  for (const position of inRow) {
    if (position.size > 0) totalLong += position.size
    else totalShort -= position.size
  }
  const rows = shown
    .map(
      (position) => `<li>
        <span class="tt-addr" title="${position.user}">${shortAddress(position.user)}</span>
        <span class="tt-size ${position.size > 0 ? 'long' : 'short'}">${formatSize(position.size)}</span>
        <span class="tt-notional">${formatNotional(position.price, position.size)}</span>
        <span class="tt-ts">${formatAge(Date.now() - position.ts)}</span>
      </li>`,
    )
    .join('')
  tooltip.innerHTML = `
    <div class="tt-head">
      <span class="tt-price">${formatPrice(band.min)} – ${formatPrice(band.max)}</span>
      <span class="tt-count">${inRow.length === 1 ? '1 position' : `${formatCount(inRow.length)} positions`}</span>
    </div>
    <div class="tt-totals">
      <span class="long">long ${formatQuantity(Math.abs(totalLong))}</span>
      <span class="short">short ${formatQuantity(Math.abs(totalShort))}</span>
    </div>
    <ul class="tt-list">${rows}</ul>
    ${inRow.length > shown.length ? `<div class="tt-more">largest ${shown.length} of ${formatCount(inRow.length)} in this row</div>` : ''}
  `
  tooltip.hidden = false
  const bounds = tooltip.getBoundingClientRect()
  const rect = plot.getBoundingClientRect()
  const left = Math.max(8, Math.min(x + 16, rect.width - bounds.width - 8))
  const top = Math.max(8, Math.min(y + 14, rect.height - bounds.height - 8))
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

function hideTooltip(): void {
  tooltip.hidden = true
}

// --------------------------------------------------------------- status / DOM

const PHASE_LABEL: Record<StreamStatus['phase'], string> = {
  idle: 'Starting',
  connecting: 'Connecting',
  live: 'Live',
  stale: 'Stale',
  reconnecting: 'Reconnecting',
  stopped: 'Stopped',
}

function updateStatus(status: StreamStatus): void {
  streamStatus = status
  statusPill.textContent = PHASE_LABEL[status.phase]
  statusPill.dataset.phase = status.phase
  statusPill.title = status.reason ?? ''
  updateFooter()
  updateOverlay()
}

function updateOverlay(): void {
  const message = overlayMessage()
  if (!message) {
    overlay.hidden = true
    overlay.textContent = ''
    plot.classList.remove('dimmed')
  } else {
    overlay.hidden = false
    overlay.textContent = message
    plot.classList.toggle('dimmed', Boolean(book))
  }
  updateBanner()
}

/**
 * A book that is on screen but no longer being fed must say so without hiding
 * the levels: the banner is the freshness warning, the centred overlay is for
 * states where nothing can be trusted at all.
 */
function updateBanner(): void {
  if (!book || resyncingReason || lastError) {
    banner.hidden = true
    banner.textContent = ''
    return
  }
  const age = streamStatus.lastDataAt
    ? Date.now() - streamStatus.lastDataAt
    : null
  const ageText = age === null ? 'an unknown time' : `${formatAge(age)} ago`
  if (streamStatus.phase === 'stale') {
    banner.hidden = false
    banner.textContent = `Stream stalled — levels are from ${ageText}, not live`
    return
  }
  if (
    streamStatus.phase === 'reconnecting' ||
    streamStatus.phase === 'connecting'
  ) {
    banner.hidden = false
    banner.textContent = `Reconnecting — levels on screen are from ${ageText}, not live`
    return
  }
  banner.hidden = true
  banner.textContent = ''
}

function overlayMessage(): string | null {
  if (lastError) return lastError
  if (resyncingReason) {
    return `Resynchronising: ${resyncingReason}. Waiting for a fresh snapshot — the levels on screen are not live.`
  }
  if (!book) {
    if (streamStatus.phase === 'reconnecting') {
      const retry =
        streamStatus.retryInMs !== null
          ? ` in ${Math.max(1, Math.round(streamStatus.retryInMs / 1000))}s`
          : ''
      return `Reconnecting${retry}${streamStatus.reason ? ` — ${streamStatus.reason}` : ''}`
    }
    if (streamStatus.phase === 'stopped') return 'Stream stopped.'
    return 'Connecting to the MarketLens L4 liquidations stream…'
  }
  if (profile && profile.visibleCount === 0) {
    return 'No liquidation levels in this price range — press Re-centre.'
  }
  return null
}

function updateFooter(): void {
  if (!book) {
    footer.innerHTML = [
      '<span>no data yet</span>',
      `<span>${LIQUIDATIONS_URL}</span>`,
      `<span>${streamStatus.phase === 'idle' ? 'starting' : PHASE_LABEL[streamStatus.phase].toLowerCase()}</span>`,
    ].join('<span class="sep">·</span>')
    return
  }
  const totalsNow = totals(book)
  const view = currentView()
  const age = streamStatus.lastDataAt
    ? Date.now() - streamStatus.lastDataAt
    : null
  const parts = [
    `${formatCount(totalsNow.count)} open positions`,
    `long ${formatQuantity(totalsNow.long)} BTC`,
    `short ${formatQuantity(totalsNow.short)} BTC`,
    `view ${formatPrice(view.min)}–${formatPrice(view.max)}`,
    `head ${formatClock(lastFileClock)}`,
    age !== null ? `last file ${formatAge(age)} ago` : 'no data yet',
    book ? `epoch ${book.epoch} · seq ${book.seq}` : 'epoch —',
    `${filesApplied} files · ${lastDecodeMs.toFixed(1)} ms decode`,
  ]
  footer.innerHTML = parts
    .map((part) => `<span>${part}</span>`)
    .join('<span class="sep">·</span>')
}

function updateAria(): void {
  const totalsNow = totals(book)
  const view = currentView()
  canvas.setAttribute(
    'aria-label',
    `Liquidation-price ladder for BTC perpetual positions. ${formatCount(totalsNow.count)} open positions, ${formatQuantity(totalsNow.long)} BTC long and ${formatQuantity(totalsNow.short)} BTC short. Showing liquidation prices ${formatPrice(view.min)} to ${formatPrice(view.max)}.`,
  )
}

// -------------------------------------------------------------- bootstrapping

const client = createStreamClient({
  url: LIQUIDATIONS_URL,
  onData: enqueue,
  onStatus: updateStatus,
})

new ResizeObserver(() => requestRender()).observe(plot)

setInterval(() => {
  updateFooter()
  updateOverlay()
}, 500)

client.start()
requestRender()

// Expose a tiny read-only snapshot for automated browser checks. No secrets:
// this is the same data already rendered on the page.
Object.defineProperty(window, '__liquidationsDebug', {
  value: () => ({
    status: streamStatus.phase,
    positions: book?.positions.size ?? 0,
    epoch: book?.epoch ?? null,
    seq: book?.seq ?? null,
    files: filesApplied,
    view: view ? { min: view.min, max: view.max } : null,
    visible: profile?.visibleCount ?? 0,
    hoverRow,
    rows: profile?.rowCount ?? 0,
    maxLong: profile?.maxLong ?? 0,
    maxShort: profile?.maxShort ?? 0,
  }),
  configurable: true,
})
