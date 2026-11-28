/**
 * Decode one MarketLens L4 Parquet message (snapshot or delta) in the browser.
 *
 * The stream sends Snappy-compressed Parquet with a single row group; hyparquet
 * decompresses SNAPPY itself, so no extra codec bundle is required. Only the
 * four columns this view needs are read, and rows stay row-shaped so the
 * decimal scaling hyparquet already applied is used as-is.
 */
import { parquetMetadata, parquetRead } from 'hyparquet'

import {
  parseHead,
  rowFromDecoded,
  type Head,
  type RawRow,
} from './protocol.ts'

/** Column order requested from the file; `rowFromDecoded` reads it positionally. */
const COLUMNS = ['user', 'price', 'size', 'ts'] as const

export interface DecodedFile {
  head: Head
  rows: RawRow[]
  /** Wall-clock decode duration of this file, for the footer readout. */
  decodeMs: number
}

export async function decodeLiquidationsFile(
  buffer: ArrayBuffer,
): Promise<DecodedFile> {
  const startedAt = performance.now()
  const metadata = parquetMetadata(buffer)
  const head = parseHead(metadata.key_value_metadata)
  if (!head) {
    throw new Error('message has no L4 head metadata (not a MarketLens L4 file)')
  }

  let matrix: unknown[][] | null = null
  await parquetRead({
    file: buffer,
    metadata,
    columns: [...COLUMNS],
    onComplete: (rows: unknown[][]) => {
      matrix = rows
    },
  })
  if (!matrix) throw new Error('parquet decode produced no rows')

  const rows = (matrix as unknown[][]).map((row) => rowFromDecoded(row))
  return { head, rows, decodeMs: performance.now() - startedAt }
}
