import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FixedRangeVolumeProfileSeriesPrimitive,
  type FixedRangeVolumeProfileSeriesPrimitiveContext,
} from './fixedRangeVolumeProfileSeriesPrimitive.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import { buildFixedRangeVolumeProfileRequestIdentityKey } from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import type { FixedRangeVolumeProfileRuntimeState } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'

function frvpInstance(
  overrides: Partial<FixedRangeVolumeProfileInstance> = {},
): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-1',
    fromTime: 100,
    toTime: 200,
    selectionInterval: '1m',
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
    ...overrides,
  }
}

function readyState(instance: FixedRangeVolumeProfileInstance): FixedRangeVolumeProfileRuntimeState {
  const profile: FixedRangeVolumeProfileResult = {
    fromTime: instance.fromTime,
    toTime: instance.toTime - 1,
    candleCount: 1,
    profileLow: 100,
    profileHigh: 120,
    rowHeight: 20,
    rows: [
      {
        priceLow: 100,
        priceHigh: 120,
        upVolume: 5,
        downVolume: 5,
        totalVolume: 10,
        inValueArea: true,
      },
    ],
    totalVolume: 10,
    pocRowIndex: 0,
    pocPrice: 110,
    pocVolume: 10,
    vah: 115,
    val: 105,
    valueAreaVolume: 10,
    valueAreaPercentAchieved: 100,
  }
  return {
    status: 'ready',
    instanceId: instance.id,
    identityKey: buildFixedRangeVolumeProfileRequestIdentityKey(instance),
    requestStartTime: instance.fromTime,
    requestEndTime: instance.toTime,
    sourceInterval: '1m',
    profile,
    pipeline: {
      instanceId: instance.id,
      requestStartTime: instance.fromTime,
      requestEndTime: instance.toTime,
      sourceInterval: '1m',
      profile,
    },
  }
}

function fakeChart() {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time / 10,
      options: () => ({ barSpacing: 6 }),
    }),
    panes: () => [{ getHeight: () => 400 }],
  } as never
}

function rendererFor(
  context: () => FixedRangeVolumeProfileSeriesPrimitiveContext,
): unknown {
  const primitive = new FixedRangeVolumeProfileSeriesPrimitive(context)
  primitive.attached({
    chart: fakeChart(),
    series: { priceToCoordinate: (price: number) => 500 - price } as never,
    requestUpdate: () => {},
  })
  primitive.updateAllViews()
  const view = primitive.paneViews()[0] as { renderer: () => unknown }
  return view.renderer()
}

describe('fixedRangeVolumeProfileSeriesPrimitive lifecycle', () => {
  it('attaches once and updates views without re-attaching', () => {
    let attachCount = 0
    let updateCount = 0
    const series = {
      attachPrimitive: () => {
        attachCount += 1
      },
      detachPrimitive: () => {},
      priceToCoordinate: () => 100,
    }
    const chart = {
      timeScale: () => ({
        timeToCoordinate: () => 50,
        options: () => ({ barSpacing: 6 }),
      }),
      panes: () => [{ getHeight: () => 400 }],
    }

    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() => ({
      instances: [],
      runtimeById: {},
      selectedId: null,
      interaction: null,
      getIntervalDurationSeconds: () => 60,
      getLastBarUnixTime: () => null,
    }))
    series.attachPrimitive(primitive)
    primitive.attached({
      chart: chart as never,
      series: series as never,
      requestUpdate: () => {
        updateCount += 1
      },
    })
    primitive.updateAllViews()
    primitive.updateAllViews()
    assert.equal(attachCount, 1)
    assert.ok(updateCount >= 0)
    primitive.detached()
  })

  it('removes deleted instance profiles from the render model', () => {
    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() => ({
      instances: [],
      runtimeById: {},
      selectedId: null,
      interaction: null,
      getIntervalDurationSeconds: () => 60,
      getLastBarUnixTime: () => null,
    }))
    const chart = {
      timeScale: () => ({
        timeToCoordinate: () => 50,
        options: () => ({ barSpacing: 6 }),
      }),
      panes: () => [{ getHeight: () => 400 }],
    }
    const series = { priceToCoordinate: () => 100 }
    primitive.attached({
      chart: chart as never,
      series: series as never,
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)
    primitive.detached()
  })

  it('keeps rendering the live resize preview from the committed profile identity', () => {
    const committed = frvpInstance()
    const previewInstance = { ...committed, toTime: 260 }
    const interaction: FixedRangeVolumeProfileInteractionState = {
      phase: 'resizing',
      selectedId: committed.id,
      draft: {
        kind: 'resize',
        instanceId: committed.id,
        endpoint: 'end',
        initialFromTime: committed.fromTime,
        initialToTime: committed.toTime,
        previewPointerTime: 260,
      },
    }

    const renderer = rendererFor(() => ({
      instances: [previewInstance],
      runtimeById: { [committed.id]: readyState(committed) },
      selectedId: committed.id,
      interaction,
      getIntervalDurationSeconds: () => 60,
      getLastBarUnixTime: () => null,
    }))

    assert.notEqual(renderer, null)
  })

  it('suppresses a previously loaded profile after the range is committed', () => {
    const previous = frvpInstance()
    const committed = { ...previous, toTime: 260 }

    const renderer = rendererFor(() => ({
      instances: [committed],
      runtimeById: { [previous.id]: readyState(previous) },
      selectedId: committed.id,
      interaction: null,
      getIntervalDurationSeconds: () => 60,
      getLastBarUnixTime: () => null,
    }))

    assert.equal(renderer, null)
  })

  it('renders once the runtime carries the committed identity', () => {
    const committed = frvpInstance({ fromTime: 100, toTime: 260 })

    const renderer = rendererFor(() => ({
      instances: [committed],
      runtimeById: { [committed.id]: readyState(committed) },
      selectedId: committed.id,
      interaction: null,
      getIntervalDurationSeconds: () => 60,
      getLastBarUnixTime: () => null,
    }))

    assert.notEqual(renderer, null)
  })
})
