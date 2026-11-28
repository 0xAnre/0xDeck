/**
 * Decode one MarketLens L4 Parquet message (snapshot or delta) in the browser.
 *
 * The stream sends Snappy-compressed Parquet with a single row group; hyparquet
 * decompresses SNAPPY itself, so no extra codec bundle is required. Only the
 * four columns this profile needs are read, and rows stay row-shaped so the
 * decimal scaling hyparquet already applied is used as-is.
 *
 * Provenance: same transport decision as PR #279
 * (`experiments/liquidations-l4/src/decode.ts` at
 * 25b6b4dbe6f913a3f8b794e77770ea4035a5b8b6), reused as an application module.
 * `hyparquet` (MIT) is a runtime dependency in both PRs.
 */
import { parquetMetadata, parquetRead } from 'hyparquet'
import {
  liquidationLevelRowFromDecoded,
  parseLiquidationLevelsHead,
  type LiquidationLevelsHead,
  type LiquidationLevelsRawRow,
} from './liquidationLevelsProtocol.ts'

/** Column order requested from the file; the row decoder reads it positionally. */
const COLUMNS = ['user', 'price', 'size', 'ts'] as const

export interface DecodedLiquidationLevelsFile {
  head: LiquidationLevelsHead
  rows: LiquidationLevelsRawRow[]
}

export async function decodeLiquidationLevelsFile(
  buffer: ArrayBuffer,
): Promise<DecodedLiquidationLevelsFile> {
  const metadata = parquetMetadata(buffer)
  const head = parseLiquidationLevelsHead(metadata.key_value_metadata)
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

  const rows = (matrix as unknown[][]).map((row) => liquidationLevelRowFromDecoded(row))
  return { head, rows }
}
