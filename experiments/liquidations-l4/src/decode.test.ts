import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { decodeLiquidationsFile } from './decode.ts'

/**
 * `fixtures/delta-seq28358.parquet` is one real delta captured from the public
 * stream (wss://api.marketlens.app/data/hyperliquid/l4/liquidations/BTC) so the
 * decoder is exercised against the producer's actual bytes: Snappy-compressed
 * Parquet, one row group, a removal row followed by two upserts. Addresses in it
 * are public on-chain account addresses and nothing else is carried.
 */
const fixture = new URL('../fixtures/delta-seq28358.parquet', import.meta.url)

function fixtureBuffer(): ArrayBuffer {
  const buffer = readFileSync(fixture)
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
}

describe('decodeLiquidationsFile', () => {
  it('reads the head out of the Parquet key-value metadata', async () => {
    const decoded = await decodeLiquidationsFile(fixtureBuffer())
    assert.deepEqual(decoded.head, {
      snapshot: false,
      channel: 'liquidations',
      coin: 'BTC',
      epoch: '1795829765666',
      seq: 28358,
      ts: 1795844224510,
    })
  })

  it('decodes a real removal row and two sized positions', async () => {
    const decoded = await decodeLiquidationsFile(fixtureBuffer())
    assert.equal(decoded.rows.length, 3)
    assert.deepEqual(decoded.rows[0], {
      user: '0x8cc19cee19cd24de7b1d27caec812deb4aa280d6',
      price: null,
      size: null,
      ts: null,
    })
    assert.deepEqual(decoded.rows[1], {
      user: '0x9a91bf7141d678f80140a443d0ecdf5f71422f58',
      price: 59_020,
      size: 0.00329,
      ts: 1795844224510,
    })
    assert.deepEqual(decoded.rows[2], {
      user: '0xbb160cb61e694570f9d570f9fcde7c61dd2143ad',
      price: 40_380,
      size: 0.15662,
      ts: 1795844224510,
    })
  })

  it('keeps the sign of short positions and the venue decimals', async () => {
    const decoded = await decodeLiquidationsFile(fixtureBuffer())
    const sized = decoded.rows.filter((row) => row.size !== null)
    // BTC perp: 1 price decimal, 5 size decimals, negative size = short.
    for (const row of sized) {
      assert.ok(row.price !== null && row.price > 0)
      assert.equal(
        Math.round((row.size as number) * 100_000) / 100_000,
        row.size,
      )
    }
  })

  it('rejects a payload that is not an L4 Parquet message', async () => {
    await assert.rejects(
      () => decodeLiquidationsFile(new Uint8Array([1, 2, 3, 4]).buffer),
      /parquet|magic|buffer|metadata/i,
    )
  })
})
