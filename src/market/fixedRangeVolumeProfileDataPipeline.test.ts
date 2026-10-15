import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BINANCE_USDM_BTCUSDT_PERPETUAL_TICK_SIZE } from './binanceUsdmBtcusdtPerpetual.ts'
import { runFixedRangeVolumeProfileDataPipeline } from './fixedRangeVolumeProfileDataPipeline.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'

const instance: FixedRangeVolumeProfileInstance = {
  id: 'frvp-pipeline',
  fromTime: 1_700_000_000,
  toTime: 1_700_000_060,
  selectionInterval: '1m',
  rowCount: 12,
  valueAreaPercent: 68,
  enabled: true,
}

describe('fixedRangeVolumeProfileDataPipeline', () => {
  it('requests exclusive bounds and computes with end_time - 1', async () => {
    let requestedStart = 0
    let requestedEnd = 0
    let computeFrom = 0
    let computeTo = 0

    const result = await runFixedRangeVolumeProfileDataPipeline(instance, {
      fetchKlines: async (startTime, endTime) => {
        requestedStart = startTime
        requestedEnd = endTime
        computeFrom = startTime
        computeTo = endTime - 1
        return {
          symbol: 'BTCUSDT',
          start_time: startTime,
          end_time: endTime,
          source_interval: '1m',
          candles: [
            {
              time: 1_700_000_000,
              open: 100,
              high: 110,
              low: 99,
              close: 105,
              volume: 10,
              interval: '1m',
              closed: true,
            },
            {
              time: 1_700_000_060,
              open: 105,
              high: 115,
              low: 104,
              close: 110,
              volume: 8,
              interval: '1m',
              closed: true,
            },
          ],
        }
      },
    })

    assert.equal(requestedStart, 1_700_000_000)
    assert.equal(requestedEnd, 1_700_000_120)
    assert.equal(computeFrom, 1_700_000_000)
    assert.equal(computeTo, 1_700_000_119)
    assert.equal(result.instanceId, instance.id)
    assert.equal(result.sourceInterval, '1m')
    assert.equal(result.profile.rows.length, 12)
    assert.equal(result.profile.fromTime, computeFrom)
    assert.equal(result.profile.toTime, computeTo)
    assert.equal(BINANCE_USDM_BTCUSDT_PERPETUAL_TICK_SIZE, 0.1)
  })

  it('includes sub-timeframe candles returned by the API', async () => {
    const result = await runFixedRangeVolumeProfileDataPipeline(
      {
        ...instance,
        fromTime: 100,
        toTime: 160,
        selectionInterval: '1m',
      },
      {
        fetchKlines: async (startTime, endTime) => ({
          symbol: 'BTCUSDT',
          start_time: startTime,
          end_time: endTime,
          source_interval: '1m',
          candles: [
            {
              time: 100,
              open: 10,
              high: 12,
              low: 9,
              close: 11,
              volume: 3,
              interval: '1m',
              closed: true,
            },
            {
              time: 160,
              open: 11,
              high: 13,
              low: 10,
              close: 12,
              volume: 4,
              interval: '1m',
              closed: true,
            },
          ],
        }),
      },
    )

    assert.equal(result.profile.candleCount, 2)
    assert.ok(result.profile.totalVolume > 0)
  })

  it('Extend Right includes right-hand candles and recomputes POC/VAH/VAL', async () => {
    const base: FixedRangeVolumeProfileInstance = {
      ...instance,
      fromTime: 1_000,
      toTime: 1_060,
      extendRight: true,
    }
    const liveRightEdge = 1_300

    const generateCandles = (startTime: number, endTime: number) => {
      const candles = []
      for (let time = startTime; time < endTime; time += 60) {
        const late = time >= 1_100
        candles.push({
          time,
          open: late ? 205 : 105,
          high: late ? 210 : 110,
          low: late ? 200 : 100,
          close: late ? 205 : 105,
          volume: late ? 100 : 10,
          interval: '1m' as const,
          closed: true,
        })
      }
      return candles
    }

    const run = (item: FixedRangeVolumeProfileInstance, live: number) =>
      runFixedRangeVolumeProfileDataPipeline(item, {
        liveRightEdge: live,
        fetchKlines: async (startTime, endTime) => ({
          symbol: 'BTCUSDT',
          start_time: startTime,
          end_time: endTime,
          source_interval: '1m',
          candles: generateCandles(startTime, endTime),
        }),
      })

    const off = await run({ ...base, extendRight: false }, liveRightEdge)
    const on = await run(base, liveRightEdge)

    assert.equal(off.requestEndTime, 1_120)
    assert.equal(off.profile.candleCount, 2)
    assert.equal(on.requestEndTime, liveRightEdge + 60)
    assert.equal(on.profile.candleCount, 6)
    assert.ok(on.profile.totalVolume > off.profile.totalVolume)
    assert.notEqual(on.profile.pocPrice, off.profile.pocPrice)
    assert.ok((on.profile.pocPrice ?? 0) > 200)
    assert.ok((off.profile.pocPrice ?? 0) < 110)
    assert.notEqual(on.profile.vah, off.profile.vah)
    assert.notEqual(on.profile.val, off.profile.val)
  })

  it('Extend Right degrades gracefully when there is nothing right of toTime', async () => {
    const result = await runFixedRangeVolumeProfileDataPipeline(
      { ...instance, fromTime: 1_000, toTime: 2_000, extendRight: true },
      {
        liveRightEdge: 2_000,
        fetchKlines: async (startTime, endTime) => ({
          symbol: 'BTCUSDT',
          start_time: startTime,
          end_time: endTime,
          source_interval: '1m',
          candles: [],
        }),
      },
    )
    assert.equal(result.requestStartTime, 1_000)
    assert.equal(result.requestEndTime, 2_060)
    assert.equal(result.profile.candleCount, 0)
    assert.equal(result.profile.rows.length, 0)
  })
})
