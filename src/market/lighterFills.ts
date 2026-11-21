/**
 * Lighter trades → the shared account-fill pipeline.
 *
 * The marker pipeline (bucketing, one-marker-per-side-per-candle, fixed
 * buy/sell colors, hover readout) lives in `hyperliquidFills.ts`. Lighter is a
 * second *source* for the same fill shape, not a second marker implementation,
 * so both exchanges render identically.
 */
import { LIGHTER_BTC_PERP_MARKET_ID, type LighterTrade } from './lighterAccount.ts'
import type { AccountFill } from './hyperliquidFills.ts'

/**
 * Side of the selected account in one match: `ask_account_id` sells (`A`),
 * `bid_account_id` buys (`B`). A self-match (both ids are the account) has no
 * unambiguous side and is skipped rather than guessed.
 */
export function lighterTradeAccountSide(
  trade: LighterTrade,
  accountIndex: number,
): 'B' | 'A' | null {
  const isAsk = trade.askAccountId === accountIndex
  const isBid = trade.bidAccountId === accountIndex
  if (isAsk === isBid) return null
  return isAsk ? 'A' : 'B'
}

/**
 * Signed position of this account *before* the match. Lighter reports it per
 * role: the maker's row carries `maker_position_size_before`, the taker's row
 * carries `taker_position_size_before`.
 */
export function lighterTradePositionBefore(
  trade: LighterTrade,
  accountIndex: number,
): number | null {
  const side = lighterTradeAccountSide(trade, accountIndex)
  if (side === null) return null
  const accountIsMaker = side === 'A' ? trade.isMakerAsk : !trade.isMakerAsk
  return accountIsMaker ? trade.makerPositionSizeBefore : trade.takerPositionSizeBefore
}

/**
 * Normalize one Lighter BTC trade into an `AccountFill`.
 *
 * `hash` carries the provider trade id (not the transaction hash): it is the
 * identity the shared dedupe uses, and it stays unique across REST page overlap
 * and the live poll. `time` is milliseconds, like a Hyperliquid fill.
 */
export function lighterTradeToAccountFill(
  trade: LighterTrade,
  accountIndex: number,
): AccountFill | null {
  if (trade.marketId !== LIGHTER_BTC_PERP_MARKET_ID) return null
  const side = lighterTradeAccountSide(trade, accountIndex)
  if (side === null) return null
  return {
    coin: 'BTC',
    price: trade.price,
    size: trade.size,
    side,
    time: trade.timestamp,
    startPosition: lighterTradePositionBefore(trade, accountIndex),
    direction: null,
    closedPnl: null,
    fee: null,
    hash: `lighter:trade:${trade.tradeId}`,
    oid: null,
    tid: null,
  }
}

/**
 * Map one trade page; malformed rows and other markets are dropped.
 *
 * Dedupe/merge uses the shared `hyperliquidFillIdentityKey`: `hash` carries
 * `lighter:trade:<trade_id>` (stable per trade, unique across page overlap and
 * the live poll), so the identifier is provider-prefixed and never collides
 * with a Hyperliquid fill.
 */
export function lighterTradesToAccountFills(
  trades: readonly LighterTrade[],
  accountIndex: number,
): AccountFill[] {
  const fills: AccountFill[] = []
  for (const trade of trades) {
    const fill = lighterTradeToAccountFill(trade, accountIndex)
    if (fill !== null) fills.push(fill)
  }
  return fills
}
