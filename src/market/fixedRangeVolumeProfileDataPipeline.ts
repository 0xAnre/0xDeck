import {
  fetchFixedRangeVolumeProfileKlines,
  type FixedRangeVolumeProfileKlinesResponse,
  type FixedRangeVolumeProfileSourceInterval,
} from '../api/fixedRangeVolumeProfileClient.ts'
import { marketPriceTickSize } from './marketExchange.ts'
import {
  computeFixedRangeVolumeProfileWithDeveloping,
  type FixedRangeVolumeProfileDevelopingSample,
  type FixedRangeVolumeProfileResult,
} from './fixedRangeVolumeProfile.ts'
import {
  computeFixedRangeVolumeProfileComputationBounds,
  computeFixedRangeVolumeProfileRequestBounds,
} from './fixedRangeVolumeProfileRequestBounds.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { MarketExchange } from './types.ts'
export class FixedRangeVolumeProfilePipelineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FixedRangeVolumeProfilePipelineError'
  }
}

export type FixedRangeVolumeProfilePipelineResult = {
  instanceId: string
  requestStartTime: number
  requestEndTime: number
  sourceInterval: FixedRangeVolumeProfileSourceInterval
  profile: FixedRangeVolumeProfileResult
  /**
   * Cumulative (developing) POC/VAH/VAL samples, one per candle in the profile
   * range. Computed once per fetch from the same candles and row grid as
   * `profile` — the optional step render mode only maps these to geometry.
   */
  developing: FixedRangeVolumeProfileDevelopingSample[]
  /** True when the requested range predates the provider's history window. */
  historyUnavailable: boolean
  /** Earliest candle open (unix seconds) the provider can serve, when limited. */
  availableFrom: number | null
}

export type FetchFixedRangeVolumeProfileKlinesForPipeline = (
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
) => Promise<FixedRangeVolumeProfileKlinesResponse>

export async function runFixedRangeVolumeProfileDataPipeline(
  instance: FixedRangeVolumeProfileInstance,
  options: {
    signal?: AbortSignal
    fetchKlines?: FetchFixedRangeVolumeProfileKlinesForPipeline
    liveRightEdge?: number | null
    exchange?: MarketExchange
  } = {},
): Promise<FixedRangeVolumeProfilePipelineResult> {
  const liveRightEdge = options.liveRightEdge ?? null
  const exchange = options.exchange ?? 'binance'
  const requestBounds = computeFixedRangeVolumeProfileRequestBounds(instance, liveRightEdge)
  if (!requestBounds) {
    throw new FixedRangeVolumeProfilePipelineError('Invalid volume profile request bounds')
  }

  const computationBounds = computeFixedRangeVolumeProfileComputationBounds(requestBounds)
  if (!computationBounds) {
    throw new FixedRangeVolumeProfilePipelineError('Invalid volume profile computation bounds')
  }

  const fetchKlines =
    options.fetchKlines ??
    ((startTime, endTime, signal) =>
      fetchFixedRangeVolumeProfileKlines({
        startTime,
        endTime,
        exchange,
        signal,
      }))

  const response = await fetchKlines(
    requestBounds.requestStartTime,
    requestBounds.requestEndTime,
    options.signal,
  )

  const referencePrice =
    response.candles.length > 0
      ? response.candles[response.candles.length - 1].close
      : null
  const { profile, developing } = computeFixedRangeVolumeProfileWithDeveloping({
    candles: response.candles,
    fromTime: computationBounds.fromTime,
    toTime: computationBounds.toTime,
    rowCount: instance.rowCount,
    valueAreaPercent: instance.valueAreaPercent,
    tickSize: marketPriceTickSize(exchange, referencePrice),
  })

  return {
    instanceId: instance.id,
    requestStartTime: requestBounds.requestStartTime,
    requestEndTime: requestBounds.requestEndTime,
    sourceInterval: response.source_interval,
    profile,
    developing,
    historyUnavailable: response.history_unavailable === true,
    availableFrom: response.available_from ?? null,
  }
}
