/**
 * Browser → 0xDeck backend client for read-only Hyperliquid account data.
 * Same-origin `/api` only; no direct Hyperliquid calls from the browser.
 */
import { API_BASE } from '../api/apiBase.ts'
import {
  hyperliquidAccountFillsByTimePath,
  hyperliquidAccountPositionPath,
  type HyperliquidAccountFillsResponse,
  type HyperliquidAccountPositionResponse,
} from './hyperliquidAccount.ts'

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
  }

  return (await response.json()) as T
}

export function parseHyperliquidAccountPositionResponse(
  payload: unknown,
): HyperliquidAccountPositionResponse | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.address !== 'string') return null
  return {
    address: record.address,
    positions: Array.isArray(record.positions)
      ? (record.positions as HyperliquidAccountPositionResponse['positions'])
      : [],
    btc_position:
      (record.btc_position as HyperliquidAccountPositionResponse['btc_position']) ??
      null,
  }
}

export function parseHyperliquidAccountFillsResponse(
  payload: unknown,
): HyperliquidAccountFillsResponse | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.address !== 'string' || !Array.isArray(record.fills)) {
    return null
  }
  return {
    address: record.address,
    fills: record.fills as HyperliquidAccountFillsResponse['fills'],
    count: typeof record.count === 'number' ? record.count : record.fills.length,
    truncated: record.truncated === true,
    complete: record.complete !== false,
    response_cap:
      typeof record.response_cap === 'number' ? record.response_cap : undefined,
    pages: typeof record.pages === 'number' ? record.pages : undefined,
    requested_start_time:
      typeof record.requested_start_time === 'number'
        ? record.requested_start_time
        : null,
    requested_end_time:
      typeof record.requested_end_time === 'number'
        ? record.requested_end_time
        : null,
  }
}

export async function fetchHyperliquidAccountPosition(
  address: string,
  signal?: AbortSignal,
): Promise<HyperliquidAccountPositionResponse> {
  const payload = await request<unknown>(
    hyperliquidAccountPositionPath(address),
    signal,
  )
  const parsed = parseHyperliquidAccountPositionResponse(payload)
  if (!parsed) throw new Error('Invalid Hyperliquid account position response')
  return parsed
}

export async function fetchHyperliquidAccountFillsByTime(
  address: string,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<HyperliquidAccountFillsResponse> {
  const params = new URLSearchParams({
    start_time: String(Math.trunc(startTime)),
    end_time: String(Math.trunc(endTime)),
  })
  const payload = await request<unknown>(
    `${hyperliquidAccountFillsByTimePath(address)}?${params}`,
    signal,
  )
  const parsed = parseHyperliquidAccountFillsResponse(payload)
  if (!parsed) throw new Error('Invalid Hyperliquid account fills response')
  return parsed
}
