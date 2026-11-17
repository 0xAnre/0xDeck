import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_CANDLE_WINDOW,
  candleWindowEqual,
  candleWindowOf,
} from './candleWindow.ts'

describe('candleWindowOf', () => {
  it('is empty for no candles', () => {
    assert.deepEqual(candleWindowOf([]), EMPTY_CANDLE_WINDOW)
  })

  it('returns the oldest and newest open time', () => {
    assert.deepEqual(
      candleWindowOf([{ time: 300 }, { time: 100 }, { time: 200 }]),
      { oldest: 100, newest: 300 },
    )
  })

  it('ignores interior changes but follows a prepended page', () => {
    const base = candleWindowOf([{ time: 100 }, { time: 200 }, { time: 300 }])
    const liveTick = candleWindowOf([{ time: 100 }, { time: 200 }, { time: 300 }])
    const olderPage = candleWindowOf([{ time: 0 }, { time: 100 }, { time: 200 }, { time: 300 }])
    const nextCandle = candleWindowOf([{ time: 100 }, { time: 200 }, { time: 300 }, { time: 400 }])

    assert.equal(candleWindowEqual(base, liveTick), true)
    assert.equal(candleWindowEqual(base, olderPage), false)
    assert.equal(candleWindowEqual(base, nextCandle), false)
  })
})
