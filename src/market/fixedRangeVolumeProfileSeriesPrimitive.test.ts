import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FixedRangeVolumeProfileSeriesPrimitive,
  type FixedRangeVolumeProfileSeriesPrimitiveContext,
} from './fixedRangeVolumeProfileSeriesPrimitive.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type {
  FixedRangeVolumeProfileDevelopingSample,
  FixedRangeVolumeProfileResult,
} from './fixedRangeVolumeProfile.ts'
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

function readyState(
  instance: FixedRangeVolumeProfileInstance,
  developing: FixedRangeVolumeProfileDevelopingSample[] = [],
): FixedRangeVolumeProfileRuntimeState {
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
    historyUnavailable: false,
    availableFrom: null,
    pipeline: {
      instanceId: instance.id,
      requestStartTime: instance.fromTime,
      requestEndTime: instance.toTime,
      sourceInterval: '1m',
      profile,
      developing,
      historyUnavailable: false,
      availableFrom: null,
    },
  }
}

function fakeChart() {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time / 10,
      options: () => ({ barSpacing: 6 }),
      getVisibleRange: () => null,
    }),
    panes: () => [{ getHeight: () => 400 }],
  } as never
}

type CanvasOp = [string, ...number[]]

/** Capture the renderer's canvas calls without a real canvas (1:1 pixel ratio). */
function drawOps(renderer: { draw: (target: unknown) => void }): CanvasOp[] {
  const ops: CanvasOp[] = []
  const context = {
    save: () => ops.push(['save']),
    restore: () => ops.push(['restore']),
    beginPath: () => ops.push(['beginPath']),
    rect: (x: number, y: number, width: number, height: number) =>
      ops.push(['rect', x, y, width, height]),
    clip: () => ops.push(['clip']),
    setLineDash: (segments: number[]) => ops.push(['setLineDash', ...segments]),
    moveTo: (x: number, y: number) => ops.push(['moveTo', x, y]),
    lineTo: (x: number, y: number) => ops.push(['lineTo', x, y]),
    stroke: () => ops.push(['stroke']),
    fillRect: (x: number, y: number, width: number, height: number) =>
      ops.push(['fillRect', x, y, width, height]),
    arc: (x: number, y: number, radius: number) => ops.push(['arc', x, y, radius]),
    fill: () => ops.push(['fill']),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
  }
  renderer.draw({
    useBitmapCoordinateSpace: (callback: (scope: unknown) => void) =>
      callback({
        context,
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
        bitmapSize: { width: 1_000, height: 1_000 },
      }),
  })
  return ops
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
        getVisibleRange: () => null,
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
        getVisibleRange: () => null,
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

  it('draws today’s flat lines for a legacy instance even when samples exist', () => {
    const committed = frvpInstance()
    const samples: FixedRangeVolumeProfileDevelopingSample[] = [
      { time: 100, pocPrice: 112, vah: 117, val: 107 },
      { time: 150, pocPrice: 108, vah: 116, val: 104 },
      { time: 200, pocPrice: 110, vah: 118, val: 106 },
    ]
    const baseline = drawOps(
      rendererFor(() => ({
        instances: [committed],
        runtimeById: { [committed.id]: readyState(committed) },
        selectedId: null,
        interaction: null,
        getIntervalDurationSeconds: () => 60,
        getLastBarUnixTime: () => null,
      })) as { draw: (target: unknown) => void },
    )
    const legacyWithSamples = drawOps(
      rendererFor(() => ({
        instances: [committed],
        runtimeById: { [committed.id]: readyState(committed, samples) },
        selectedId: null,
        interaction: null,
        getIntervalDurationSeconds: () => 60,
        getLastBarUnixTime: () => null,
      })) as { draw: (target: unknown) => void },
    )

    // Default regression: the default (line) instance draws exactly the same
    // bitmap operations whether or not developing samples are available.
    assert.deepEqual(legacyWithSamples, baseline)
    assert.equal(baseline.filter((op) => op[0] === 'moveTo').length, 3)
  })

  it('draws the developing staircase when a group is in step mode', () => {
    const committed = frvpInstance({ valueAreaMode: 'step', pocMode: 'step' })
    const samples: FixedRangeVolumeProfileDevelopingSample[] = [
      { time: 100, pocPrice: 112, vah: 117, val: 107 },
      { time: 150, pocPrice: 108, vah: 116, val: 104 },
      { time: 200, pocPrice: 110, vah: 118, val: 106 },
    ]
    const ops = drawOps(
      rendererFor(() => ({
        instances: [committed],
        runtimeById: { [committed.id]: readyState(committed, samples) },
        selectedId: null,
        interaction: null,
        getIntervalDurationSeconds: () => 60,
        getLastBarUnixTime: () => null,
      })) as { draw: (target: unknown) => void },
    )

    // 500 - price: the POC's developing levels are drawn as step segments.
    const drawnYs = ops.filter((op) => op[0] === 'lineTo').map((op) => op[2])
    assert.ok(drawnYs.includes(388), `POC level 112 missing from ${JSON.stringify(drawnYs)}`)
    assert.ok(drawnYs.includes(392))
    assert.ok(drawnYs.includes(390))
    // The flat full-range POC/VAH/VAL lines (390/385/395 only) are gone.
    assert.equal(ops.filter((op) => op[0] === 'moveTo').length, 3)
    assert.ok(ops.filter((op) => op[0] === 'lineTo').length > 3)
  })
})
