import {
  fetchFixedRangeVolumeProfileKlines,
  type FixedRangeVolumeProfileKlinesResponse,
  type FixedRangeVolumeProfileSourceInterval,
} from '../api/fixedRangeVolumeProfileClient.ts'
import { BINANCE_USDM_BTCUSDT_PERPETUAL_TICK_SIZE } from './binanceUsdmBtcusdtPerpetual.ts'
import {
  computeFixedRangeVolumeProfile,
  type FixedRangeVolumeProfileResult,
} from './fixedRangeVolumeProfile.ts'
import {
  computeFixedRangeVolumeProfileComputationBounds,
  computeFixedRangeVolumeProfileRequestBounds,
} from './fixedRangeVolumeProfileRequestBounds.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
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
  } = {},
): Promise<FixedRangeVolumeProfilePipelineResult> {
  const requestBounds = computeFixedRangeVolumeProfileRequestBounds(instance)
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
      fetchFixedRangeVolumeProfileKlines({ startTime, endTime, signal }))

  const response = await fetchKlines(
    requestBounds.requestStartTime,
    requestBounds.requestEndTime,
    options.signal,
  )

  const profile = computeFixedRangeVolumeProfile({
    candles: response.candles,
    fromTime: computationBounds.fromTime,
    toTime: computationBounds.toTime,
    rowCount: instance.rowCount,
    valueAreaPercent: instance.valueAreaPercent,
    tickSize: BINANCE_USDM_BTCUSDT_PERPETUAL_TICK_SIZE,
  })

  return {
    instanceId: instance.id,
    requestStartTime: requestBounds.requestStartTime,
    requestEndTime: requestBounds.requestEndTime,
    sourceInterval: response.source_interval,
    profile,
  }
}
