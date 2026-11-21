/**
 * Lighter read-only account model.
 *
 * Everything here talks to Lighter's *public* mainnet API and never signs,
 * requests an API key or sends an `Authorization` header. Addresses are the
 * same EVM addresses Hyperliquid uses; a Lighter *account index* is resolved
 * from the wallet's L1 address because trades are keyed by account index.
 *
 * Verified live on 2026-11-21 (see the PR evidence): `market_id` 1 is the BTC
 * perpetual, `/account?by=l1_address` returns every account owned by a wallet,
 * `/trades?account_index=…&market_id=1` returns real BTC trades with a cursor,
 * and one account exposes at most ~3000 recent trades.
 */

export const LIGHTER_MAINNET_API_BASE = 'https://mainnet.zklighter.elliot.ai/api/v1'

/** Verified `market_id`/symbol of the BTC perpetual in `orderBookDetails`. */
export const LIGHTER_BTC_PERP_MARKET_ID = 1
export const LIGHTER_BTC_PERP_SYMBOL = 'BTC'

/** Server maximum for one `/trades` page (`limit=101` is rejected). */
export const LIGHTER_TRADES_PAGE_LIMIT = 100

/** Observed public per-account trade history cap before the cursor runs out. */
export const LIGHTER_TRADE_HISTORY_CAP = 3000

export const LIGHTER_HISTORY_LIMIT_NOTICE = `Lighter publishes only the ${LIGHTER_TRADE_HISTORY_CAP} most recent trades per account; older Entry/Close history is unavailable`

export const LIGHTER_ACCOUNT_TYPE_MASTER = 0

/** One account owned by an L1 address (master account or sub-account). */
export type LighterAccountSummary = {
  index: number
  accountType: number
  l1Address: string
}

/** BTC perpetual position as Lighter reports it (`sign` 1 long / -1 short). */
export type LighterBtcPosition = {
  symbol: string
  sign: number
  size: number
  avgEntryPrice: number | null
  positionValue: number | null
  unrealizedPnl: number | null
  liquidationPrice: number | null
}

/** One public BTC trade, normalized from Lighter's string-heavy payload. */
export type LighterTrade = {
  tradeId: string
  marketId: number
  price: number
  size: number
  /** Execution time in milliseconds, like Hyperliquid fills. */
  timestamp: number
  type: string
  askAccountId: number
  bidAccountId: number
  /** `true` when the ask side was the maker of this match. */
  isMakerAsk: boolean
  txHash: string | null
  makerPositionSizeBefore: number | null
  takerPositionSizeBefore: number | null
}

export type LighterTradesPage = {
  trades: LighterTrade[]
  nextCursor: string | null
}

export type LighterAccountPosition = {
  accountIndex: number
  btcPosition: LighterBtcPosition | null
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readInt(value: unknown): number | null {
  const number = readFiniteNumber(value)
  return number === null ? null : Math.trunc(number)
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Account discovery reply shape: `{ accounts: [...] }` (HTTP 200 only). */
export function parseLighterAccountsResponse(payload: unknown): LighterAccountSummary[] | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (readInt(record.code) !== 200) return null
  if (!Array.isArray(record.accounts)) return null
  const accounts: LighterAccountSummary[] = []
  for (const raw of record.accounts) {
    if (!raw || typeof raw !== 'object') continue
    const account = raw as Record<string, unknown>
    const index = readInt(account.index)
    if (index === null || index < 0) continue
    accounts.push({
      index,
      accountType: readInt(account.account_type) ?? LIGHTER_ACCOUNT_TYPE_MASTER,
      l1Address: readOptionalString(account.l1_address) ?? '',
    })
  }
  return accounts.sort((left, right) => left.index - right.index)
}

/**
 * BTC position of one account. An account with no BTC position is a legitimate
 * empty state: the result is `null`, not an error.
 */
export function parseLighterAccountResponse(payload: unknown): LighterAccountPosition | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (readInt(record.code) !== 200) return null
  const first = Array.isArray(record.accounts) ? record.accounts[0] : null
  if (!first || typeof first !== 'object') {
    return { accountIndex: -1, btcPosition: null }
  }
  const account = first as Record<string, unknown>
  const accountIndex = readInt(account.index) ?? readInt(account.account_index) ?? -1
  const positions = Array.isArray(account.positions) ? account.positions : []
  for (const raw of positions) {
    if (!raw || typeof raw !== 'object') continue
    const position = raw as Record<string, unknown>
    const symbol = readOptionalString(position.symbol)
    if (symbol === null || symbol.toUpperCase() !== LIGHTER_BTC_PERP_SYMBOL) continue
    const size = readFiniteNumber(position.position)
    if (size === null || size === 0) continue
    return {
      accountIndex,
      btcPosition: {
        symbol: LIGHTER_BTC_PERP_SYMBOL,
        sign: readInt(position.sign) ?? Math.sign(size),
        size: Math.abs(size),
        avgEntryPrice: readFiniteNumber(position.avg_entry_price),
        positionValue: readFiniteNumber(position.position_value),
        unrealizedPnl: readFiniteNumber(position.unrealized_pnl),
        liquidationPrice: readFiniteNumber(position.liquidation_price),
      },
    }
  }
  return { accountIndex, btcPosition: null }
}

/** One trade record; `null` for a malformed row so it can never shift a marker. */
export function parseLighterTrade(payload: unknown): LighterTrade | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const marketId = readInt(record.market_id)
  const price = readFiniteNumber(record.price)
  const size = readFiniteNumber(record.size)
  const timestamp = readInt(record.timestamp)
  const askAccountId = readInt(record.ask_account_id)
  const bidAccountId = readInt(record.bid_account_id)
  const tradeId =
    readOptionalString(record.trade_id_str) ??
    readFiniteNumber(record.trade_id)?.toString() ??
    null
  if (
    marketId === null ||
    price === null ||
    price <= 0 ||
    size === null ||
    size <= 0 ||
    timestamp === null ||
    timestamp <= 0 ||
    askAccountId === null ||
    bidAccountId === null ||
    tradeId === null ||
    typeof record.is_maker_ask !== 'boolean'
  ) {
    return null
  }
  return {
    tradeId,
    marketId,
    price,
    size,
    timestamp,
    type: readOptionalString(record.type) ?? 'trade',
    askAccountId,
    bidAccountId,
    isMakerAsk: record.is_maker_ask,
    txHash: readOptionalString(record.tx_hash),
    makerPositionSizeBefore: readFiniteNumber(record.maker_position_size_before),
    takerPositionSizeBefore: readFiniteNumber(record.taker_position_size_before),
  }
}

export function parseLighterTradesResponse(payload: unknown): LighterTradesPage | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (readInt(record.code) !== 200) return null
  if (!Array.isArray(record.trades)) return null
  const trades: LighterTrade[] = []
  for (const raw of record.trades) {
    const trade = parseLighterTrade(raw)
    if (trade !== null) trades.push(trade)
  }
  return {
    trades,
    nextCursor: readOptionalString(record.next_cursor),
  }
}

/** Lighter account discovery for one wallet address. */
export function lighterAccountsPath(address: string): string {
  const params = new URLSearchParams({ by: 'l1_address', value: address })
  return `${LIGHTER_MAINNET_API_BASE}/account?${params}`
}

export function lighterAccountPositionPath(accountIndex: number): string {
  const params = new URLSearchParams({ by: 'index', value: String(accountIndex) })
  return `${LIGHTER_MAINNET_API_BASE}/account?${params}`
}

/** One BTC trade page, newest first, narrowed to the BTC perpetual market. */
export function lighterAccountTradesPath(accountIndex: number, cursor?: string | null): string {
  const params = new URLSearchParams({
    sort_by: 'timestamp',
    limit: String(LIGHTER_TRADES_PAGE_LIMIT),
    account_index: String(accountIndex),
    market_id: String(LIGHTER_BTC_PERP_MARKET_ID),
  })
  if (cursor) params.set('cursor', cursor)
  return `${LIGHTER_MAINNET_API_BASE}/trades?${params}`
}

/** Menu label for one discovered account, e.g. `Master account · #1483`. */
export function lighterAccountLabel(account: LighterAccountSummary): string {
  const kind =
    account.accountType === LIGHTER_ACCOUNT_TYPE_MASTER ? 'Master account' : 'Sub-account'
  return `${kind} · #${account.index}`
}

/**
 * Which account the wallet selection resolves to. Multiple accounts are never
 * mixed and an arbitrary one is never chosen: the caller must ask the user.
 */
export type LighterAccountResolution =
  | { kind: 'resolved'; index: number }
  | { kind: 'missing' }
  | { kind: 'ambiguous' }

export function resolveLighterAccountSelection(
  accounts: readonly LighterAccountSummary[],
  requestedIndex: number | null,
): LighterAccountResolution {
  if (accounts.length === 0) return { kind: 'missing' }
  if (requestedIndex !== null && accounts.some((account) => account.index === requestedIndex)) {
    return { kind: 'resolved', index: requestedIndex }
  }
  if (accounts.length === 1) {
    return { kind: 'resolved', index: accounts[0].index }
  }
  return { kind: 'ambiguous' }
}
