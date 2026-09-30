import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fetchFixedRangeVolumeProfileKlines,
  FixedRangeVolumeProfileClientError,
  parseFixedRangeVolumeProfileKlinesResponse,
} from '../api/fixedRangeVolumeProfileClient.ts'

function validCandle(time: number, interval: string) {
  return {
    time,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 12,
    interval,
    closed: true,
  }
}

function validResponseBody(
  start: number,
  end: number,
  sourceInterval: string,
  candles: unknown[],
) {
  return {
    symbol: 'BTCUSDT',
    start_time: start,
    end_time: end,
    source_interval: sourceInterval,
    candles,
  }
}

describe('fixedRangeVolumeProfileClient parser', () => {
  const requested = { startTime: 100, endTime: 260 }

  it('accepts 3m, 15m, 1h, and 2h source intervals', () => {
    for (const sourceInterval of ['3m', '15m', '1h', '2h'] as const) {
      const parsed = parseFixedRangeVolumeProfileKlinesResponse(
        validResponseBody(requested.startTime, requested.endTime, sourceInterval, [
          validCandle(100, sourceInterval),
        ]),
        requested,
      )
      assert.equal(parsed.source_interval, sourceInterval)
      assert.equal(parsed.candles[0].interval, sourceInterval)
    }
  })

  it('deduplicates candles by timestamp and sorts ascending', () => {
    const parsed = parseFixedRangeVolumeProfileKlinesResponse(
      validResponseBody(requested.startTime, requested.endTime, '1m', [
        validCandle(200, '1m'),
        validCandle(100, '1m'),
        { ...validCandle(100, '1m'), close: 101 },
      ]),
      requested,
    )
    assert.deepEqual(parsed.candles.map((candle) => candle.time), [100, 200])
    assert.equal(parsed.candles[0].close, 101)
  })

  it('rejects candles outside request range', () => {
    assert.throws(() =>
      parseFixedRangeVolumeProfileKlinesResponse(
        validResponseBody(requested.startTime, requested.endTime, '1m', [
          validCandle(260, '1m'),
        ]),
        requested,
      ),
    )
  })

  it('rejects negative volume', () => {
    assert.throws(() =>
      parseFixedRangeVolumeProfileKlinesResponse(
        validResponseBody(requested.startTime, requested.endTime, '1m', [
          { ...validCandle(100, '1m'), volume: -1 },
        ]),
        requested,
      ),
    )
  })

  it('rejects invalid OHLC', () => {
    assert.throws(() =>
      parseFixedRangeVolumeProfileKlinesResponse(
        validResponseBody(requested.startTime, requested.endTime, '1m', [
          { ...validCandle(100, '1m'), high: 80 },
        ]),
        requested,
      ),
    )
  })

  it('rejects response bounds mismatch', () => {
    assert.throws(() =>
      parseFixedRangeVolumeProfileKlinesResponse(
        validResponseBody(101, requested.endTime, '1m', [validCandle(101, '1m')]),
        requested,
      ),
    )
  })

  it('throws on non-2xx fetch responses', async () => {
    await assert.rejects(
      fetchFixedRangeVolumeProfileKlines({
        startTime: 100,
        endTime: 200,
        fetchImpl: async () =>
          ({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: async () => ({ detail: 'upstream failed' }),
          }) as Response,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FixedRangeVolumeProfileClientError)
        assert.equal(error.status, 502)
        return true
      },
    )
  })

  it('forwards AbortSignal to fetch', async () => {
    let receivedSignal: AbortSignal | null | undefined
    const controller = new AbortController()
    await fetchFixedRangeVolumeProfileKlines({
      startTime: 100,
      endTime: 200,
      signal: controller.signal,
      fetchImpl: async (_url, init) => {
        receivedSignal = init?.signal
        return {
          ok: true,
          json: async () =>
            validResponseBody(100, 200, '1m', [validCandle(100, '1m')]),
        } as Response
      },
    })
    assert.ok(receivedSignal)
  })
})
