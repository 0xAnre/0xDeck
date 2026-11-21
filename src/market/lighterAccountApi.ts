/**
 * Browser → Lighter public REST client (read-only, no credentials).
 *
 * Lighter's mainnet API is called directly from the browser: verified
 * `Access-Control-Allow-Origin: *` on 2026-11-21, so no backend proxy — and no
 * backend deployment — is required for this feature. No `Authorization`
 * header, API key or signature is ever sent.
 */
import {
  lighterAccountPositionPath,
  lighterAccountTradesPath,
  lighterAccountsPath,
  parseLighterAccountResponse,
  parseLighterAccountsResponse,
  parseLighterTradesResponse,
  type LighterAccountSummary,
  type LighterBtcPosition,
  type LighterTradesPage,
} from './lighterAccount.ts'

export class LighterRequestError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'LighterRequestError'
    this.status = status
  }
}

const LIGHTER_REQUEST_TIMEOUT_MS = 15_000

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(LIGHTER_REQUEST_TIMEOUT_MS)
  if (!signal) return timeout
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal
}

function providerMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  return typeof record.message === 'string' && record.message !== '' ? record.message : null
}

async function requestLighter<T>(
  url: string,
  parse: (payload: unknown) => T | null,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: requestSignal(signal),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new LighterRequestError('Could not reach Lighter; check your connection and try again')
  }

  if (response.status === 429) {
    throw new LighterRequestError('Lighter rate limit reached; try again in a moment', 429)
  }
  if (!response.ok) {
    throw new LighterRequestError(`Lighter request failed (HTTP ${response.status})`, response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new LighterRequestError('Lighter returned an invalid response')
  }

  const parsed = parse(payload)
  if (parsed === null) {
    throw new LighterRequestError(
      providerMessage(payload) ?? 'Lighter returned an unexpected response',
    )
  }
  return parsed
}

/** Every account owned by one L1 address (master plus sub-accounts). */
export function fetchLighterAccounts(
  address: string,
  signal?: AbortSignal,
): Promise<LighterAccountSummary[]> {
  return requestLighter(lighterAccountsPath(address), parseLighterAccountsResponse, signal)
}

/** BTC position of one account (`null` when the account holds no BTC position). */
export async function fetchLighterBtcPosition(
  accountIndex: number,
  signal?: AbortSignal,
): Promise<LighterBtcPosition | null> {
  const parsed = await requestLighter(
    lighterAccountPositionPath(accountIndex),
    parseLighterAccountResponse,
    signal,
  )
  return parsed.btcPosition
}

/** One newest-first page of the account's BTC perpetual trades. */
export function fetchLighterTradesPage(
  accountIndex: number,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<LighterTradesPage> {
  return requestLighter(
    lighterAccountTradesPath(accountIndex, cursor),
    parseLighterTradesResponse,
    signal,
  )
}
