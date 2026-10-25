import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bucketHyperliquidFills,
  dedupeHyperliquidFills,
  filterHyperliquidFillsToLoadedCandles,
  groupHyperliquidFillMarkers,
  hyperliquidFillBucketSeconds,
  hyperliquidFillIdentityKey,
  mergeHyperliquidFills,
  parseHyperliquidFill,
} from './hyperliquidFills.ts'

type FillOverrides = {
  tid?: number
  time?: number
  side?: 'B' | 'A'
  size?: string
  startPosition?: string | null
  coin?: string
}

let nextTid = 1

function fill(overrides: FillOverrides = {}): Record<string, unknown> {
  const tid = overrides.tid ?? nextTid++
  const result: Record<string, unknown> = {
    coin: overrides.coin ?? 'BTC',
    px: '80000.0',
    sz: overrides.size ?? '1',
    side: overrides.side ?? 'B',
    time: overrides.time ?? 1_792_000_000_000,
    dir: 'Open Long',
    tid,
    hash: `0x${tid.toString(16).padStart(64, '0')}`,
    oid: tid,
  }
  if (overrides.startPosition !== null) {
    result.startPosition = overrides.startPosition ?? '0'
  }
  return result
}

function parsed(overrides: FillOverrides = {}) {
  const result = parseHyperliquidFill(fill(overrides))
  assert.ok(result)
  return result
}

describe('parseHyperliquidFill', () => {
  it('accepts backend snake_case and raw upstream camelCase shapes', () => {
    const backend = parseHyperliquidFill({
      coin: 'BTC',
      price: 80000,
      size: 0.5,
      side: 'B',
      time: 1_792_000_000_000,
      start_position: 1.5,
      direction: 'Close Long',
      tid: 7,
    })
    const upstream = parseHyperliquidFill({
      coin: 'BTC',
      px: '80000',
      sz: '0.5',
      side: 'B',
      time: 1_792_000_000_000,
      startPosition: '1.5',
      dir: 'Close Long',
      tid: 7,
    })
    assert.deepEqual(backend, upstream)
  })

  it('rejects non-BTC, malformed and non-positive fills', () => {
    assert.equal(parseHyperliquidFill(fill({ coin: 'ETH' })), null)
    assert.equal(parseHyperliquidFill({ ...fill(), sz: '0' }), null)
    assert.equal(parseHyperliquidFill({ ...fill(), side: 'X' }), null)
    assert.equal(parseHyperliquidFill({ ...fill(), time: 0 }), null)
    assert.equal(parseHyperliquidFill(null), null)
  })

  it('keeps buy and sell sides without deriving long/short direction', () => {
    assert.equal(parsed({ side: 'B', startPosition: '-1' }).side, 'B')
    assert.equal(parsed({ side: 'A', startPosition: '1' }).side, 'A')
  })
})

describe('fill identity, dedupe and merge', () => {
  it('dedupes by tid', () => {
    const a = parsed({ tid: 1 })
    assert.equal(dedupeHyperliquidFills([a, { ...a }]).length, 1)
  })

  it('uses hash + oid + time + coin when tid is missing', () => {
    const a = parsed({ tid: 1 })
    const b = { ...a, tid: null }
    assert.equal(hyperliquidFillIdentityKey(b), `${a.hash}|${a.oid}|${a.time}|BTC`)
    assert.equal(dedupeHyperliquidFills([b, { ...b }]).length, 1)
  })

  it('merges REST + WS overlap without duplicates', () => {
    const rest = [parsed({ tid: 1, time: 1000 }), parsed({ tid: 2, time: 2000 })]
    const ws = [parsed({ tid: 2, time: 2000 }), parsed({ tid: 3, time: 3000 })]
    assert.deepEqual(mergeHyperliquidFills(rest, ws).map((item) => item.tid), [1, 2, 3])
    assert.equal(mergeHyperliquidFills(rest, rest).length, 2)
  })
})

describe('interval bucketing, loaded-history filtering and marker grouping', () => {
  const timeMs = Date.UTC(2026, 9, 25, 14, 37, 12)

  it('maps fill time to the candle open time for every interval', () => {
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '1m') % 60, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '5m') % 300, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '15m') % 900, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '30m') % 1800, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '1h') % 3600, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '2h') % 7200, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '4h') % 14_400, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '1d') % 86_400, 0)
    assert.equal(hyperliquidFillBucketSeconds(timeMs, '1w') % 604_800, 0)
  })

  it('carries position before/after from startPosition when present', () => {
    const bucketed = bucketHyperliquidFills(
      [parsed({ side: 'B', size: '0.5', startPosition: '1' })],
      '1h',
    )
    assert.equal(bucketed[0].positionBefore, 1)
    assert.equal(bucketed[0].positionAfter, 1.5)
    const missing = bucketHyperliquidFills(
      [parsed({ side: 'B', startPosition: null })],
      '1h',
    )
    assert.equal(missing[0].positionBefore, null)
    assert.equal(missing[0].positionAfter, null)
  })

  it('keeps only fills whose bucket has a loaded candle and dedupes identities', () => {
    const raw = parsed({ tid: 1, time: timeMs })
    const bucketed = bucketHyperliquidFills([raw, raw], '1h')
    const bucket = bucketed[0].bucketTime
    assert.equal(
      filterHyperliquidFillsToLoadedCandles(bucketed, [bucket]).length,
      1,
    )
    assert.equal(
      filterHyperliquidFillsToLoadedCandles(bucketed, [bucket + 3600]).length,
      0,
    )
    assert.equal(filterHyperliquidFillsToLoadedCandles(bucketed, []).length, 0)
  })

  it('groups same-side fills in one candle into at most one buy and one sell marker', () => {
    const fills = bucketHyperliquidFills(
      [
        parsed({ tid: 1, time: timeMs, side: 'B' }),
        parsed({ tid: 2, time: timeMs + 1000, side: 'B' }),
        parsed({ tid: 3, time: timeMs + 2000, side: 'A' }),
        parsed({ tid: 4, time: timeMs + 3000, side: 'A' }),
        parsed({ tid: 5, time: timeMs + 4000, side: 'B' }),
      ],
      '1h',
    )
    const groups = groupHyperliquidFillMarkers(fills)
    assert.equal(groups.length, 2)
    assert.deepEqual(groups.map((group) => group.side), ['B', 'A'])
    assert.equal(groups[0].fills.length, 3)
    assert.equal(groups[1].fills.length, 2)
    assert.equal(new Set(groups.map((group) => group.bucketTime)).size, 1)
  })

  it('keeps every individual fill for hover details, including both sides', () => {
    const fills = bucketHyperliquidFills(
      [
        parsed({ tid: 1, time: timeMs, side: 'B' }),
        parsed({ tid: 2, time: timeMs + 1000, side: 'A' }),
      ],
      '15m',
    )
    const groups = groupHyperliquidFillMarkers(fills)
    assert.deepEqual(groups.flatMap((group) => group.fills.map((item) => item.tid)), [1, 2])
  })

  it('does not stack markers when many fills share a bucket', () => {
    const fills = bucketHyperliquidFills(
      Array.from({ length: 20 }, (_, index) =>
        parsed({
          tid: index + 1,
          time: timeMs + index,
          side: index % 2 === 0 ? 'B' : 'A',
        }),
      ),
      '1m',
    )
    const groups = groupHyperliquidFillMarkers(fills)
    assert.equal(groups.length, 2)
    assert.equal(groups.reduce((total, group) => total + group.fills.length, 0), 20)
  })
})
