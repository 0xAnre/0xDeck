import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bucketHyperliquidFillEvents,
  classifyHyperliquidFills,
  dedupeHyperliquidFills,
  filterHyperliquidFillEventsToLoadedCandles,
  hyperliquidFillBucketSeconds,
  hyperliquidFillEventLabel,
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
  dir?: string
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
    dir: overrides.dir ?? 'Open Long',
    tid,
    hash: `0x${tid.toString(16).padStart(64, '0')}`,
    oid: tid,
  }
  if (overrides.startPosition !== null) {
    result.startPosition = overrides.startPosition ?? '0'
  }
  return result
}

function summary(events: ReturnType<typeof classifyHyperliquidFills>) {
  return events.map((event) => ({
    kind: event.kind,
    side: event.side,
    before: event.positionBefore,
    after: event.positionAfter,
    size: event.size,
    time: event.time,
  }))
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
})

describe('classifyHyperliquidFills', () => {
  it('classifies a long open and a long add as entries', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, size: '1', startPosition: '0' }),
      fill({ tid: 2, size: '0.5', startPosition: '1' }),
    ])
    assert.deepEqual(summary(events), [
      { kind: 'entry', side: 'long', before: 0, after: 1, size: 1, time: 1_792_000_000_000 },
      { kind: 'entry', side: 'long', before: 1, after: 1.5, size: 0.5, time: 1_792_000_000_000 },
    ])
  })

  it('classifies a short open and a short add as entries', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, side: 'A', size: '1', startPosition: '0', dir: 'Open Short' }),
      fill({ tid: 2, side: 'A', size: '0.5', startPosition: '-1', dir: 'Open Short' }),
    ])
    assert.deepEqual(
      events.map((event) => [event.kind, event.side, event.positionAfter]),
      [
        ['entry', 'short', -1],
        ['entry', 'short', -1.5],
      ],
    )
  })

  it('classifies a partial close as reduce, never close', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, side: 'A', size: '0.25', startPosition: '1', dir: 'Close Long' }),
    ])
    assert.deepEqual(summary(events), [
      {
        kind: 'reduce',
        side: 'long',
        before: 1,
        after: 0.75,
        size: 0.25,
        time: 1_792_000_000_000,
      },
    ])
    assert.equal(events[0].kind === 'close', false)
  })

  it('classifies an exact zero as close on both sides', () => {
    const longClose = classifyHyperliquidFills([
      fill({ tid: 1, side: 'A', size: '0.75', startPosition: '0.75', dir: 'Close Long' }),
    ])
    const shortClose = classifyHyperliquidFills([
      fill({ tid: 2, side: 'B', size: '0.4', startPosition: '-0.4', dir: 'Close Short' }),
    ])
    assert.deepEqual(summary(longClose), [
      { kind: 'close', side: 'long', before: 0.75, after: 0, size: 0.75, time: 1_792_000_000_000 },
    ])
    assert.deepEqual(summary(shortClose), [
      { kind: 'close', side: 'short', before: -0.4, after: 0, size: 0.4, time: 1_792_000_000_000 },
    ])
  })

  it('classifies a reversal as close + opposite entry at the same fill time', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, side: 'A', size: '1.5', startPosition: '1', dir: 'Long > Short' }),
    ])
    assert.deepEqual(summary(events), [
      { kind: 'close', side: 'long', before: 1, after: 0, size: 1.5, time: 1_792_000_000_000 },
      { kind: 'entry', side: 'short', before: 0, after: -0.5, size: 1.5, time: 1_792_000_000_000 },
    ])

    const other = classifyHyperliquidFills([
      fill({ tid: 2, side: 'B', size: '2', startPosition: '-1', dir: 'Short > Long' }),
    ])
    assert.deepEqual(
      other.map((event) => [event.kind, event.side]),
      [
        ['close', 'short'],
        ['entry', 'long'],
      ],
    )
  })

  it('derives position from startPosition, never from the average entry price', () => {
    // avg entry 99000 would imply a different side/size; only startPosition counts.
    const events = classifyHyperliquidFills([
      { ...fill({ tid: 1, size: '1' }), entryPx: '99000' },
    ])
    assert.deepEqual(summary(events), [
      { kind: 'entry', side: 'long', before: 0, after: 1, size: 1, time: 1_792_000_000_000 },
    ])
  })

  it('falls back to a chronological running position when startPosition is missing', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, size: '1', startPosition: null, time: 1000 }),
      fill({ tid: 2, side: 'A', size: '0.25', startPosition: null, time: 2000 }),
      fill({ tid: 3, side: 'A', size: '0.75', startPosition: null, time: 3000 }),
    ])
    assert.deepEqual(
      events.map((event) => [event.kind, event.side, event.positionBefore, event.positionAfter]),
      [
        ['entry', 'long', 0, 1],
        ['reduce', 'long', 1, 0.75],
        ['close', 'long', 0.75, 0],
      ],
    )
  })

  it('resyncs the running position from a later explicit startPosition', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, size: '1', startPosition: null, time: 1000 }),
      fill({ tid: 2, size: '1', startPosition: '5', time: 2000 }),
    ])
    assert.deepEqual(
      events.map((event) => [event.kind, event.positionAfter]),
      [
        ['entry', 1],
        ['entry', 6],
      ],
    )
  })

  it('ignores non-BTC fills and no-op fills', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, coin: 'ETH', size: '2', startPosition: '0' }),
      fill({ tid: 2, size: '0', startPosition: '1' }),
    ])
    assert.deepEqual(events, [])
  })

  it('is independent of input order and stable across repeated runs', () => {
    const a = fill({ tid: 1, size: '1', startPosition: '0', time: 1000 })
    const b = fill({ tid: 2, side: 'A', size: '0.4', startPosition: '1', time: 2000 })
    const forward = classifyHyperliquidFills([a, b])
    const reversed = classifyHyperliquidFills([b, a])
    assert.deepEqual(forward, reversed)
  })

  it('labels events for the compact hover readout', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, size: '1', startPosition: '0' }),
      fill({ tid: 2, side: 'A', size: '0.25', startPosition: '1' }),
      fill({ tid: 3, side: 'A', size: '0.75', startPosition: '0.75' }),
    ])
    assert.deepEqual(events.map(hyperliquidFillEventLabel), [
      'Long entry',
      'Long reduce',
      'Long close',
    ])
  })
})

describe('fill identity, dedupe and merge', () => {
  it('dedupes by tid', () => {
    const a = parseHyperliquidFill(fill({ tid: 1 }))
    assert.ok(a)
    assert.equal(dedupeHyperliquidFills([a, { ...a }]).length, 1)
  })

  it('uses hash + oid + time + coin when tid is missing', () => {
    const a = parseHyperliquidFill({ ...fill({ tid: 1 }), tid: undefined })
    const b = parseHyperliquidFill({ ...fill({ tid: 1 }), tid: undefined })
    assert.ok(a && b)
    assert.equal(dedupeHyperliquidFills([a, b]).length, 1)
  })

  it('merges REST + WS overlap without duplicates', () => {
    const rest = [fill({ tid: 1, time: 1000 }), fill({ tid: 2, time: 2000 })]
    const ws = [fill({ tid: 2, time: 2000 }), fill({ tid: 3, time: 3000 })]
    const merged = mergeHyperliquidFills(
      rest.map((item) => parseHyperliquidFill(item)!),
      ws.map((item) => parseHyperliquidFill(item)!),
    )
    assert.deepEqual(merged.map((fill) => fill.tid), [1, 2, 3])
  })

  it('reconnect snapshots never duplicate markers', () => {
    const snapshot = [fill({ tid: 1 }), fill({ tid: 2 })]
    const parsedSnapshot = snapshot.map((item) => parseHyperliquidFill(item)!)
    const first = mergeHyperliquidFills([], parsedSnapshot)
    const second = mergeHyperliquidFills(first, parsedSnapshot)
    assert.equal(second.length, 2)
  })
})

describe('interval bucketing and loaded-history filtering', () => {
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
    assert.ok(hyperliquidFillBucketSeconds(timeMs, '1h') <= Math.floor(timeMs / 1000))
  })

  it('keeps only events whose bucket has a loaded candle (no fake anchors)', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, time: timeMs, startPosition: '0' }),
    ])
    const bucketed = bucketHyperliquidFillEvents(events, '1h')
    const bucket = bucketed[0].bucketTime

    assert.equal(
      filterHyperliquidFillEventsToLoadedCandles(bucketed, [bucket]).length,
      1,
    )
    assert.equal(
      filterHyperliquidFillEventsToLoadedCandles(bucketed, [bucket + 3600]).length,
      0,
    )
    assert.equal(filterHyperliquidFillEventsToLoadedCandles(bucketed, []).length, 0)
  })

  it('dedupes events after a REST/WS merge', () => {
    const raw = fill({ tid: 1, time: timeMs, startPosition: '0' })
    const events = classifyHyperliquidFills([raw, raw])
    const bucketed = bucketHyperliquidFillEvents(events, '15m')
    const filtered = filterHyperliquidFillEventsToLoadedCandles(
      bucketed,
      [bucketed[0].bucketTime],
    )
    assert.equal(filtered.length, 1)
  })

  it('keeps same-bucket collisions instead of dropping events', () => {
    const events = classifyHyperliquidFills([
      fill({ tid: 1, time: timeMs, size: '1', startPosition: '0' }),
      fill({ tid: 2, time: timeMs, side: 'A', size: '0.2', startPosition: '1' }),
    ])
    const bucketed = bucketHyperliquidFillEvents(events, '1h')
    const filtered = filterHyperliquidFillEventsToLoadedCandles(bucketed, [
      bucketed[0].bucketTime,
    ])
    assert.equal(new Set(filtered.map((event) => event.bucketTime)).size, 1)
    assert.equal(filtered.length, 2)
    assert.deepEqual(
      filtered.map((event) => event.kind),
      ['entry', 'reduce'],
    )
  })
})
