import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fixedRangeVolumeProfileAvailabilityNotice,
  fixedRangeVolumeProfileAvailabilityNotices,
  formatAvailabilityTimestamp,
} from './frvpHistoryAvailability.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'

function emptyProfile(candleCount = 0) {
  return {
    fromTime: 100,
    toTime: 199,
    candleCount,
    profileLow: 0,
    profileHigh: 0,
    rowHeight: 0,
    rows: [],
    totalVolume: 0,
    pocRowIndex: null,
    pocPrice: null,
    pocVolume: null,
    vah: null,
    val: null,
    valueAreaVolume: 0,
    valueAreaPercentAchieved: 0,
  }
}

function readyState(
  id: string,
  options: { candleCount?: number; historyUnavailable: boolean; availableFrom: number | null },
) {
  const profile = emptyProfile(options.candleCount ?? 0)
  return {
    status: 'ready' as const,
    instanceId: id,
    identityKey: id,
    requestStartTime: 100,
    requestEndTime: 200,
    sourceInterval: '1m' as const,
    profile,
    historyUnavailable: options.historyUnavailable,
    availableFrom: options.availableFrom,
    pipeline: {
      instanceId: id,
      requestStartTime: 100,
      requestEndTime: 200,
      sourceInterval: '1m' as const,
      profile,
      historyUnavailable: options.historyUnavailable,
      availableFrom: options.availableFrom,
    },
  }
}

describe('frvpHistoryAvailability', () => {
  it('formats availability timestamps in UTC deterministically', () => {
    assert.equal(formatAvailabilityTimestamp(1_700_000_000), '2023-11-14 22:13 UTC')
  })

  it('returns no notice for fully available profiles', () => {
    assert.equal(
      fixedRangeVolumeProfileAvailabilityNotice({
        exchange: 'hyperliquid',
        historyUnavailable: false,
        availableFrom: null,
        candleCount: 12,
      }),
      null,
    )
    // Binance never reports a horizon, so it can never produce this notice.
    assert.equal(
      fixedRangeVolumeProfileAvailabilityNotice({
        exchange: 'binance',
        historyUnavailable: false,
        availableFrom: null,
        candleCount: 0,
      }),
      null,
    )
  })

  it('explains an entirely unavailable Hyperliquid profile', () => {
    const notice = fixedRangeVolumeProfileAvailabilityNotice({
      exchange: 'hyperliquid',
      historyUnavailable: true,
      availableFrom: 1_700_000_000,
      candleCount: 0,
    })
    assert.equal(
      notice,
      'Hyperliquid volume profile history is unavailable; data starts 2023-11-14 22:13 UTC',
    )
  })

  it('marks a clamped profile as partial', () => {
    const notice = fixedRangeVolumeProfileAvailabilityNotice({
      exchange: 'hyperliquid',
      historyUnavailable: true,
      availableFrom: 1_700_000_000,
      candleCount: 40,
    })
    assert.equal(
      notice,
      'Hyperliquid volume profile is partial; history starts 2023-11-14 22:13 UTC',
    )
  })

  it('ignores unavailable metadata without a usable timestamp', () => {
    assert.equal(
      fixedRangeVolumeProfileAvailabilityNotice({
        exchange: 'hyperliquid',
        historyUnavailable: true,
        availableFrom: null,
        candleCount: 0,
      }),
      null,
    )
    assert.equal(
      fixedRangeVolumeProfileAvailabilityNotice({
        exchange: 'hyperliquid',
        historyUnavailable: true,
        availableFrom: Number.NaN,
        candleCount: 0,
      }),
      null,
    )
  })

  it('collects deduplicated notices from ready runtime states only', () => {
    const runtime = {
      'frvp-1': readyState('frvp-1', {
        historyUnavailable: true,
        availableFrom: 1_700_000_000,
      }),
      'frvp-2': readyState('frvp-2', {
        historyUnavailable: true,
        availableFrom: 1_700_000_000,
      }),
      'frvp-3': readyState('frvp-3', { historyUnavailable: false, availableFrom: null }),
      'frvp-4': {
        status: 'loading' as const,
        instanceId: 'frvp-4',
        identityKey: 'frvp-4',
      },
    } satisfies FixedRangeVolumeProfileRuntimeSnapshot

    assert.deepEqual(fixedRangeVolumeProfileAvailabilityNotices(runtime, 'hyperliquid'), [
      'Hyperliquid volume profile history is unavailable; data starts 2023-11-14 22:13 UTC',
    ])
  })

  it('keeps partial and unavailable states distinct in one snapshot', () => {
    const runtime = {
      empty: readyState('empty', { historyUnavailable: true, availableFrom: 1_700_000_000 }),
      partial: readyState('partial', {
        candleCount: 12,
        historyUnavailable: true,
        availableFrom: 1_700_000_000,
      }),
    } satisfies FixedRangeVolumeProfileRuntimeSnapshot

    assert.deepEqual(fixedRangeVolumeProfileAvailabilityNotices(runtime, 'hyperliquid'), [
      'Hyperliquid volume profile history is unavailable; data starts 2023-11-14 22:13 UTC',
      'Hyperliquid volume profile is partial; history starts 2023-11-14 22:13 UTC',
    ])
  })
})
