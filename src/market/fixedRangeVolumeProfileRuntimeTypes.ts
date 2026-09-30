import type { FixedRangeVolumeProfilePipelineResult } from './fixedRangeVolumeProfileDataPipeline.ts'

export type FixedRangeVolumeProfileRuntimeLoading = {
  status: 'loading'
  instanceId: string
  identityKey: string
}

export type FixedRangeVolumeProfileRuntimeReady = {
  status: 'ready'
  instanceId: string
  identityKey: string
  requestStartTime: number
  requestEndTime: number
  sourceInterval: FixedRangeVolumeProfilePipelineResult['sourceInterval']
  profile: FixedRangeVolumeProfilePipelineResult['profile']
  pipeline: FixedRangeVolumeProfilePipelineResult
}

export type FixedRangeVolumeProfileRuntimeError = {
  status: 'error'
  instanceId: string
  identityKey: string
  message: string
}

export type FixedRangeVolumeProfileRuntimeState =
  | FixedRangeVolumeProfileRuntimeLoading
  | FixedRangeVolumeProfileRuntimeReady
  | FixedRangeVolumeProfileRuntimeError

export type FixedRangeVolumeProfileRuntimeSnapshot = Record<
  string,
  FixedRangeVolumeProfileRuntimeState
>
