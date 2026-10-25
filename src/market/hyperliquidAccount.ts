/**
 * Read-only Hyperliquid account address + account API contract.
 *
 * The address is workspace-level (one account for the whole app), never a
 * wallet connection: no signing, no API key, no trading permission.
 */

export const HYPERLIQUID_ACCOUNT_STORAGE_KEY = '0xdeck-hyperliquid-account'

/** Same-tab notification so every open BTC Perp panel shares one account. */
export const HYPERLIQUID_ACCOUNT_CHANGED_EVENT =
  '0xdeck-hyperliquid-account-changed'

function notifyHyperliquidAccountChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(HYPERLIQUID_ACCOUNT_CHANGED_EVENT))
}

export const HYPERLIQUID_ACCOUNT_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
export const HYPERLIQUID_ACCOUNT_INVALID_MESSAGE =
  "Enter a Hyperliquid address: '0x' followed by 40 hexadecimal characters"

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

export function loadHyperliquidAccountAddress(): string | null {
  try {
    const raw = localStorage.getItem(HYPERLIQUID_ACCOUNT_STORAGE_KEY)
    return normalizeHyperliquidAccountAddress(raw)
  } catch {
    return null
  }
}

/** Persist a valid address; returns the normalized value or `null` if invalid. */
export function saveHyperliquidAccountAddress(value: unknown): string | null {
  const normalized = normalizeHyperliquidAccountAddress(value)
  if (normalized === null) return null
  try {
    localStorage.setItem(HYPERLIQUID_ACCOUNT_STORAGE_KEY, normalized)
  } catch {
    // Storage can be unavailable (private mode / quota); the in-memory state
    // still works for the current session.
  }
  notifyHyperliquidAccountChanged()
  return normalized
}

export function clearHyperliquidAccountAddress(): void {
  try {
    localStorage.removeItem(HYPERLIQUID_ACCOUNT_STORAGE_KEY)
  } catch {
    // Ignore unavailable storage.
  }
  notifyHyperliquidAccountChanged()
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
