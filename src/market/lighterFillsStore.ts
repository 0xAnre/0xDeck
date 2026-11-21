/**
 * One shared Lighter fill session for every mounted BTC Perp panel.
 *
 * The global wallet selection is resolved once (accounts → account index),
 * history is paged once and the newest page is polled once. Panels subscribe to
 * this snapshot instead of each opening their own requests, so ten panels add
 * no extra Lighter traffic. Switching the wallet stops the old session, aborts
 * in-flight requests, clears the fills and never leaks the previous account's
 * markers into the new one.
 *
 * Lighter has no unauthenticated push channel for trades (`account_tx` requires
 * an auth token), so "live" is a short REST poll of the newest trade page and
 * the account's public position. Inaccessible history is reported, never
 * presented as complete.
 */
import {
  LIGHTER_HISTORY_LIMIT_NOTICE,
  LIGHTER_TRADE_HISTORY_CAP,
  LIGHTER_TRADES_PAGE_LIMIT,
  resolveLighterAccountSelection,
  type LighterAccountSummary,
  type LighterTradesPage,
} from './lighterAccount.ts'
import {
  fetchLighterAccounts,
  fetchLighterBtcPosition,
  fetchLighterTradesPage,
  LighterRequestError,
} from './lighterAccountApi.ts'
import { lighterTradesToAccountFills } from './lighterFills.ts'
import { mergeAccountFills, type AccountFill } from './hyperliquidFills.ts'
import { positionWalletSelectionKey, type PositionWalletSelection } from './positionWallet.ts'

export type LighterPositionMarkersStatus = 'idle' | 'loading' | 'ready' | 'error'

export type LighterPositionMarkersSnapshot = {
  selectionKey: string
  status: LighterPositionMarkersStatus
  fills: AccountFill[]
  accounts: LighterAccountSummary[]
  accountIndex: number | null
  hasBtcPosition: boolean | null
  notice: string | null
  error: string | null
}

const EMPTY_SNAPSHOT: LighterPositionMarkersSnapshot = {
  selectionKey: '',
  status: 'idle',
  fills: [],
  accounts: [],
  accountIndex: null,
  hasBtcPosition: null,
  notice: null,
  error: null,
}

const NEWEST_POLL_INTERVAL_MS = 12_000
const HISTORY_PAGE_INTERVAL_MS = 350
const MAX_HISTORY_PAGES = Math.ceil(LIGHTER_TRADE_HISTORY_CAP / LIGHTER_TRADES_PAGE_LIMIT)

type LighterSession = {
  key: string
  selection: PositionWalletSelection
  abort: AbortController
  timer: ReturnType<typeof setTimeout> | null
  stopped: boolean
  status: LighterPositionMarkersStatus
  fills: AccountFill[]
  accounts: LighterAccountSummary[]
  accountIndex: number | null
  hasBtcPosition: boolean | null
  nextCursor: string | null
  pagesLoaded: number
  notice: string | null
  error: string | null
}

let snapshot: LighterPositionMarkersSnapshot = EMPTY_SNAPSHOT
let session: LighterSession | null = null
const listeners = new Set<() => void>()

function emitSnapshot(): void {
  const active = session
  snapshot = {
    selectionKey: active?.key ?? '',
    status: active?.status ?? 'idle',
    fills: active?.fills ?? [],
    accounts: active?.accounts ?? [],
    accountIndex: active?.accountIndex ?? null,
    hasBtcPosition: active?.hasBtcPosition ?? null,
    notice: active?.notice ?? null,
    error: active?.error ?? null,
  }
  for (const listener of [...listeners]) listener()
}

function lighterErrorMessage(error: unknown): string {
  if (error instanceof LighterRequestError) return error.message
  if (error instanceof Error && error.message !== '') return error.message
  return 'Could not load Lighter account data'
}

function stopSession(): void {
  const active = session
  session = null
  if (active !== null) {
    active.stopped = true
    active.abort.abort()
    if (active.timer !== null) clearTimeout(active.timer)
    active.timer = null
  }
  if (snapshot !== EMPTY_SNAPSHOT) emitSnapshot()
}

function scheduleTick(active: LighterSession, delayMs: number): void {
  if (active.stopped) return
  active.timer = setTimeout(() => {
    active.timer = null
    void runTick(active)
  }, delayMs)
}

/**
 * Append one page: newest-first pages are deduped by trade identity, and the
 * deeper-history cursor only ever moves backwards.
 */
function applyTradesPage(
  active: LighterSession,
  page: LighterTradesPage,
  options: { trackCursor: boolean },
): void {
  if (active.accountIndex === null) return
  const fills = lighterTradesToAccountFills(page.trades, active.accountIndex)
  if (fills.length > 0) active.fills = mergeAccountFills(active.fills, fills)
  if (!options.trackCursor) return
  active.pagesLoaded += 1
  active.nextCursor = page.nextCursor
  if (active.nextCursor !== null && active.pagesLoaded >= MAX_HISTORY_PAGES) {
    // The provider's public window is exhausted; say so instead of showing a
    // partial history as if it were complete.
    active.nextCursor = null
    active.notice = LIGHTER_HISTORY_LIMIT_NOTICE
  }
}

async function runTick(active: LighterSession): Promise<void> {
  if (active.stopped || active.accountIndex === null) return
  const signal = active.abort.signal
  try {
    if (active.nextCursor !== null) {
      const page = await fetchLighterTradesPage(active.accountIndex, active.nextCursor, signal)
      if (active.stopped) return
      applyTradesPage(active, page, { trackCursor: true })
      emitSnapshot()
      scheduleTick(active, active.nextCursor === null ? NEWEST_POLL_INTERVAL_MS : HISTORY_PAGE_INTERVAL_MS)
      return
    }
    const page = await fetchLighterTradesPage(active.accountIndex, null, signal)
    if (active.stopped) return
    applyTradesPage(active, page, { trackCursor: false })
    active.error = null
    emitSnapshot()
    scheduleTick(active, NEWEST_POLL_INTERVAL_MS)
  } catch (error) {
    if (active.stopped || signal.aborted) return
    active.error = lighterErrorMessage(error)
    emitSnapshot()
    scheduleTick(active, NEWEST_POLL_INTERVAL_MS)
  }
}

async function runSession(active: LighterSession): Promise<void> {
  const signal = active.abort.signal
  try {
    const accounts = await fetchLighterAccounts(active.selection.address, signal)
    if (active.stopped) return
    active.accounts = accounts
    const resolution = resolveLighterAccountSelection(
      accounts,
      active.selection.lighterAccountIndex,
    )
    if (resolution.kind === 'missing') {
      active.status = 'ready'
      active.notice = 'No Lighter account is associated with this wallet address'
      emitSnapshot()
      return
    }
    if (resolution.kind === 'ambiguous') {
      active.status = 'ready'
      active.notice = `This wallet owns ${accounts.length} Lighter accounts. Choose one in the Position Markers wallet menu.`
      emitSnapshot()
      return
    }

    active.accountIndex = resolution.index
    const btcPosition = await fetchLighterBtcPosition(resolution.index, signal)
    if (active.stopped) return
    active.hasBtcPosition = btcPosition !== null

    const page = await fetchLighterTradesPage(resolution.index, null, signal)
    if (active.stopped) return
    applyTradesPage(active, page, { trackCursor: true })
    active.status = 'ready'
    emitSnapshot()
    scheduleTick(
      active,
      active.nextCursor === null ? NEWEST_POLL_INTERVAL_MS : HISTORY_PAGE_INTERVAL_MS,
    )
  } catch (error) {
    if (active.stopped || signal.aborted) return
    active.status = 'error'
    active.error = lighterErrorMessage(error)
    emitSnapshot()
  }
}

function startSession(selection: PositionWalletSelection): void {
  const active: LighterSession = {
    key: positionWalletSelectionKey(selection),
    selection,
    abort: new AbortController(),
    timer: null,
    stopped: false,
    status: 'loading',
    fills: [],
    accounts: [],
    accountIndex: null,
    hasBtcPosition: null,
    nextCursor: null,
    pagesLoaded: 0,
    notice: null,
    error: null,
  }
  session = active
  emitSnapshot()
  void runSession(active)
}

/**
 * Subscribe one panel to the shared Lighter session. The first subscriber for
 * a wallet starts it; the last one to leave stops it. A different wallet stops
 * and replaces the previous session, so no request or timer survives a switch.
 */
export function subscribeLighterPositionMarkers(
  selection: PositionWalletSelection,
  listener: () => void,
): () => void {
  if (selection.exchange !== 'lighter') {
    if (session !== null) stopSession()
    return () => {}
  }
  const key = positionWalletSelectionKey(selection)
  if (session === null || session.key !== key) {
    stopSession()
    startSession(selection)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopSession()
  }
}

export function getLighterPositionMarkersSnapshot(): LighterPositionMarkersSnapshot {
  return snapshot
}
