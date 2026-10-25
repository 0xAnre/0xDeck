/**
 * Permanent read-only Hyperliquid account used by the BTC Perp widget.
 *
 * The address is built in, not user-configurable: no wallet connection,
 * signing, API key, or trading permission is involved. Casing is preserved in
 * this constant; API/validation paths normalize to lower-case.
 */
export const DEFAULT_HYPERLIQUID_ACCOUNT_ADDRESS =
  '0x01567bEFc20Aa7D5D1a8EB2107efae633fF090f5'

export const HYPERLIQUID_ACCOUNT_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export type HyperliquidAccountFillSide = 'B' | 'A'

/** Backend-normalized BTC position (`btc_position` in the position response). */
export type HyperliquidBtcPosition = {
  coin: string
  signed_size: number
  size: number
  side: 'long' | 'short'
  entry_price: number | null
  position_value: number | null
  unrealized_pnl: number | null
  liquidation_price: number | null
  leverage: number | null
}

export type HyperliquidAccountPositionResponse = {
  address: string
  positions: HyperliquidBtcPosition[]
  btc_position: HyperliquidBtcPosition | null
}

export type HyperliquidAccountFillsResponse = {
  address: string
  fills: HyperliquidAccountFillPayload[]
  count: number
  /** True when the provider response cap prevented a complete window. */
  truncated: boolean
  complete: boolean
  response_cap?: number
  pages?: number
  requested_start_time?: number | null
  requested_end_time?: number | null
}

/** Fill shape returned by our backend (snake_case, numeric). */
export type HyperliquidAccountFillPayload = {
  coin: string
  price: number | string
  size: number | string
  side: HyperliquidAccountFillSide | string
  time: number
  start_position?: number | string | null
  direction?: string | null
  closed_pnl?: number | string | null
  fee?: number | string | null
  hash?: string | null
  oid?: number | null
  tid?: number | null
}

export function isValidHyperliquidAccountAddress(value: unknown): value is string {
  return typeof value === 'string' && HYPERLIQUID_ACCOUNT_ADDRESS_PATTERN.test(value.trim())
}

/** Lower-case a valid address; `null` when the input is not a valid address. */
export function normalizeHyperliquidAccountAddress(value: unknown): string | null {
  if (!isValidHyperliquidAccountAddress(value)) return null
  return value.trim().toLowerCase()
}

/**
 * Use a supplied address when valid, otherwise the built-in default. The BTC
 * Perp widget calls this with no argument, so the fixed account is always used.
 */
export function resolveHyperliquidAccountAddress(value?: unknown): string {
  const supplied = normalizeHyperliquidAccountAddress(value)
  if (supplied !== null) return supplied
  // The constant is validated by `hyperliquidAccount.test.ts`.
  return normalizeHyperliquidAccountAddress(
    DEFAULT_HYPERLIQUID_ACCOUNT_ADDRESS,
  ) as string
}

export const HYPERLIQUID_ACCOUNT_API_PATH = '/market/hyperliquid/account'

export function hyperliquidAccountPositionPath(address: string): string {
  return `${HYPERLIQUID_ACCOUNT_API_PATH}/${encodeURIComponent(address)}/position`
}

export function hyperliquidAccountFillsPath(address: string): string {
  return `${HYPERLIQUID_ACCOUNT_API_PATH}/${encodeURIComponent(address)}/fills`
}

export function hyperliquidAccountFillsByTimePath(address: string): string {
  return `${HYPERLIQUID_ACCOUNT_API_PATH}/${encodeURIComponent(address)}/fills/by-time`
}

export function hyperliquidUserFillsChannel(address: string): string {
  return `hyperliquid.account.${address.toLowerCase()}.userfills`
}
