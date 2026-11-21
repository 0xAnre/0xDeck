/**
 * Global Position Markers wallet selection.
 *
 * One wallet (exchange + address) is chosen in the app header and shared by
 * every BTC Perp widget in every workspace. It is deliberately independent of
 * the candle exchange: a Lighter wallet renders on Hyperliquid or Binance
 * candles, because this feature only adds marker data — never Lighter candles.
 *
 * The built-in Hyperliquid address stays the default so an existing install
 * keeps rendering exactly what it rendered before this store existed.
 */
import {
  DEFAULT_HYPERLIQUID_ACCOUNT_ADDRESS,
  normalizeHyperliquidAccountAddress,
} from './hyperliquidAccount.ts'

export const POSITION_WALLET_STORAGE_KEY = '0xdeck-position-wallet'

export type PositionWalletExchange = 'hyperliquid' | 'lighter'

export type PositionWalletSelection = {
  exchange: PositionWalletExchange
  /** Lower-cased account/L1 address. Hyperliquid and Lighter share EVM addresses. */
  address: string
  /**
   * Explicit Lighter account index. `null` means "resolve automatically"; it is
   * required when one wallet owns several accounts, because markers from two
   * accounts must never be mixed silently.
   */
  lighterAccountIndex: number | null
}

export const POSITION_WALLET_EXCHANGES: readonly PositionWalletExchange[] = [
  'hyperliquid',
  'lighter',
]

export const POSITION_WALLET_EXCHANGE_LABELS: Record<PositionWalletExchange, string> = {
  hyperliquid: 'Hyperliquid',
  lighter: 'Lighter',
}

const POSITION_WALLET_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export const POSITION_WALLET_ADDRESS_MISSING_ERROR = 'Enter a wallet address'
export const POSITION_WALLET_ADDRESS_FORMAT_ERROR =
  'Wallet address must be 0x followed by 40 hexadecimal characters'

/** Understandable validation message for a wallet address, or `null` when valid. */
export function positionWalletAddressError(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return POSITION_WALLET_ADDRESS_MISSING_ERROR
  }
  if (!POSITION_WALLET_ADDRESS_PATTERN.test(value.trim())) {
    return POSITION_WALLET_ADDRESS_FORMAT_ERROR
  }
  return null
}

export function isPositionWalletExchange(value: unknown): value is PositionWalletExchange {
  return value === 'hyperliquid' || value === 'lighter'
}

const DEFAULT_POSITION_WALLET_ADDRESS = normalizeHyperliquidAccountAddress(
  DEFAULT_HYPERLIQUID_ACCOUNT_ADDRESS,
) as string

export const DEFAULT_POSITION_WALLET: PositionWalletSelection = {
  exchange: 'hyperliquid',
  address: DEFAULT_POSITION_WALLET_ADDRESS,
  lighterAccountIndex: null,
}

function sanitizeLighterAccountIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null
  return value
}

/**
 * Defensive read of the persisted record. An unreadable record, a bad address
 * or an unknown exchange falls back to the built-in Hyperliquid wallet instead
 * of failing the whole selection.
 */
export function sanitizePositionWalletSelection(value: unknown): PositionWalletSelection {
  if (!value || typeof value !== 'object') return { ...DEFAULT_POSITION_WALLET }
  const record = value as Record<string, unknown>
  // An invalid address cannot identify a wallet, so the whole record falls back
  // to the documented default: never "Lighter" paired with the built-in
  // Hyperliquid address, and never a Lighter account index for it.
  if (positionWalletAddressError(record.address) !== null) {
    return { ...DEFAULT_POSITION_WALLET }
  }
  const exchange = isPositionWalletExchange(record.exchange)
    ? record.exchange
    : DEFAULT_POSITION_WALLET.exchange
  const address = String(record.address).trim().toLowerCase()
  return {
    exchange,
    address,
    lighterAccountIndex:
      exchange === 'lighter' ? sanitizeLighterAccountIndex(record.lighterAccountIndex) : null,
  }
}

/** Stable identity for "the selected wallet changed" (data reset + abort). */
export function positionWalletSelectionKey(selection: PositionWalletSelection): string {
  return `${selection.exchange}:${selection.address}:${selection.lighterAccountIndex ?? ''}`
}

/** Human label, e.g. `Lighter · 0x1234…abcd`, used by the header control. */
export function positionWalletShortLabel(selection: PositionWalletSelection): string {
  const { address } = selection
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  const index =
    selection.lighterAccountIndex === null ? '' : ` · #${selection.lighterAccountIndex}`
  return `${POSITION_WALLET_EXCHANGE_LABELS[selection.exchange]} · ${short}${index}`
}

function walletStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadPositionWallet(): PositionWalletSelection {
  const storage = walletStorage()
  const raw = storage?.getItem(POSITION_WALLET_STORAGE_KEY) ?? null
  if (raw === null) return { ...DEFAULT_POSITION_WALLET }
  try {
    return sanitizePositionWalletSelection(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_POSITION_WALLET }
  }
}

export function savePositionWallet(selection: PositionWalletSelection): void {
  try {
    walletStorage()?.setItem(POSITION_WALLET_STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory selection stays usable.
  }
}

type PositionWalletListener = () => void

const walletListeners = new Set<PositionWalletListener>()
let currentWallet: PositionWalletSelection | null = null
let storageSyncBound = false

function notifyWalletListeners(): void {
  for (const listener of [...walletListeners]) listener()
}

/**
 * Keep two tabs on one selection: another tab's write is adopted, this tab's
 * mounted widgets re-read it through the same listener path.
 */
function bindWalletStorageSync(): void {
  if (storageSyncBound) return
  storageSyncBound = true
  try {
    globalThis.addEventListener?.('storage', (event) => {
      if (event.key !== POSITION_WALLET_STORAGE_KEY) return
      currentWallet = loadPositionWallet()
      notifyWalletListeners()
    })
  } catch {
    // A non-browser host (unit tests) has no storage events.
  }
}

export function getPositionWallet(): PositionWalletSelection {
  if (currentWallet === null) currentWallet = loadPositionWallet()
  return currentWallet
}

/** Persist and broadcast a new selection. Returns the sanitized value. */
export function setPositionWallet(next: PositionWalletSelection): PositionWalletSelection {
  const sanitized = sanitizePositionWalletSelection(next)
  currentWallet = sanitized
  savePositionWallet(sanitized)
  notifyWalletListeners()
  return sanitized
}

export function resetPositionWallet(): PositionWalletSelection {
  return setPositionWallet(DEFAULT_POSITION_WALLET)
}

export function subscribePositionWallet(listener: PositionWalletListener): () => void {
  bindWalletStorageSync()
  walletListeners.add(listener)
  return () => {
    walletListeners.delete(listener)
  }
}
