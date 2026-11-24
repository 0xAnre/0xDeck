import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FixedRangeVolumeProfileSeriesPrimitive,
  attachFixedRangeVolumeProfileSeriesPrimitive,
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
    historyUnavailable: false,
    availableFrom: null,
    pipeline: {
      instanceId: instance.id,
      requestStartTime: instance.fromTime,
      requestEndTime: instance.toTime,
      sourceInterval: '1m',
      profile,
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


function frvpSchedulingSeries() {
  return { priceToCoordinate: (price: number) => 500 - price } as never
}

function frvpSchedulingContext(
  instances: FixedRangeVolumeProfileInstance[],
): FixedRangeVolumeProfileSeriesPrimitiveContext {
  return {
    instances,
    runtimeById: Object.fromEntries(instances.map((instance) => [instance.id, readyState(instance)])),
    selectedId: null,
    interaction: null,
    getIntervalDurationSeconds: () => 60,
    getLastBarUnixTime: () => null,
  }
}

describe('fixedRangeVolumeProfileSeriesPrimitive scheduling', () => {
  it('library updateAllViews does not request another redraw', () => {
    let requests = 0
    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() =>
      frvpSchedulingContext([frvpInstance()]),
    )
    primitive.attached({
      chart: fakeChart(),
      series: frvpSchedulingSeries(),
      requestUpdate: () => {
        requests += 1
      },
    })
    assert.equal(requests, 1)
    requests = 0

    primitive.updateAllViews()
    primitive.updateAllViews()

    assert.equal(requests, 0)
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.notEqual(view.renderer(), null)
    primitive.detached()
  })

  it('explicit invalidate, context provider change and public update still request a paint', () => {
    let requests = 0
    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() =>
      frvpSchedulingContext([]),
    )
    primitive.attached({
      chart: fakeChart(),
      series: frvpSchedulingSeries(),
      requestUpdate: () => {
        requests += 1
      },
    })
    requests = 0

    primitive.invalidate()
    assert.equal(requests, 1)

    requests = 0
    primitive.setContextProvider(() => frvpSchedulingContext([frvpInstance()]))
    assert.equal(requests, 1)

    requests = 0
    primitive.updateAllViews()
    assert.equal(requests, 0)
  })

  it('the public attachment update and dispose keep the invalidation contract', () => {
    let requests = 0
    let captured: FixedRangeVolumeProfileSeriesPrimitive | null = null
    const series = {
      attachPrimitive: (primitive: FixedRangeVolumeProfileSeriesPrimitive) => {
        captured = primitive
      },
      detachPrimitive: () => {},
      priceToCoordinate: (price: number) => 500 - price,
    }
    const attachment = attachFixedRangeVolumeProfileSeriesPrimitive(
      series as never,
      () => frvpSchedulingContext([frvpInstance()]),
    )
    assert.notEqual(captured, null)
    captured!.attached({
      chart: fakeChart(),
      series: series as never,
      requestUpdate: () => {
        requests += 1
      },
    })
    requests = 0

    attachment.update()
    assert.equal(requests, 1)

    attachment.dispose()
    attachment.update()
    assert.equal(requests, 1)
  })

  it('empty state settles without requests or renderer work', () => {
    let requests = 0
    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() =>
      frvpSchedulingContext([]),
    )
    primitive.attached({
      chart: fakeChart(),
      series: frvpSchedulingSeries(),
      requestUpdate: () => {
        requests += 1
      },
    })
    requests = 0

    primitive.updateAllViews()

    assert.equal(requests, 0)
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)
  })

  it('a view-only callback reflects an externally updated context on the next library update', () => {
    let context = frvpSchedulingContext([])
    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() => context)
    primitive.attached({
      chart: fakeChart(),
      series: frvpSchedulingSeries(),
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)

    context = frvpSchedulingContext([frvpInstance()])
    primitive.updateAllViews()
    assert.notEqual(view.renderer(), null)
    primitive.detached()
  })
})

function drawCallsAtBitmapRatio(
  instance: FixedRangeVolumeProfileInstance,
  horizontalPixelRatio: number,
  verticalPixelRatio: number,
) {
  const renderer = rendererFor(() => ({
    instances: [instance],
    runtimeById: { [instance.id]: readyState(instance) },
    selectedId: null,
    interaction: null,
    getIntervalDurationSeconds: () => 60,
    getLastBarUnixTime: () => null,
  })) as { draw: (target: never) => void } | null
  if (!renderer) throw new Error('expected an FRVP renderer')

  const fills: Array<{ left: number; top: number; width: number; height: number }> = []
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  let lastPoint: { x: number; y: number } | null = null
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    setLineDash() {},
    moveTo(x: number, y: number) {
      lastPoint = { x, y }
    },
    lineTo(x: number, y: number) {
      if (lastPoint) lines.push({ x1: lastPoint.x, y1: lastPoint.y, x2: x, y2: y })
    },
    stroke() {},
    fill() {},
    arc() {},
    fillRect(left: number, top: number, width: number, height: number) {
      fills.push({ left, top, width, height })
    },
  }
  const target = {
    useBitmapCoordinateSpace(callback: (scope: never) => void) {
      callback({
        context,
        horizontalPixelRatio,
        verticalPixelRatio,
        bitmapSize: { width: 2000, height: 1000 },
        mediaSize: { width: 1000, height: 500 },
      } as never)
    },
  }
  renderer.draw(target as never)
  return { fills, lines }
}

describe('fixedRangeVolumeProfileSeriesPrimitive bitmap draw arguments at ratio 2', () => {
  it('scales bitmap fill and line arguments by the supplied pixel ratio', () => {
    const instance = frvpInstance()
    const ratio1 = drawCallsAtBitmapRatio(instance, 1, 1)
    const ratio2 = drawCallsAtBitmapRatio(instance, 2, 2)
    // Draw-argument equality only: this is not a framebuffer/pixel proof.
    assert.equal(ratio1.fills.length, 2)
    assert.equal(ratio2.fills.length, 2)
    assert.deepEqual(ratio1.fills, [
      { left: 7, top: 380, width: 1, height: 20 },
      { left: 8, top: 380, width: 1, height: 20 },
    ])
    assert.deepEqual(ratio2.fills, [
      { left: 14, top: 760, width: 3, height: 40 },
      { left: 17, top: 760, width: 3, height: 40 },
    ])
    assert.deepEqual(ratio2.lines[0], {
      x1: 14,
      y1: 780,
      x2: 46,
      y2: 780,
    })
  })

  it('keeps the default full row height and widens linearly at ratio 2', () => {
    const instance = frvpInstance()
    const defaultDraw = drawCallsAtBitmapRatio(instance, 2, 2)
    const halfHeight = drawCallsAtBitmapRatio(
      frvpInstance({ histogramBarHeightPercent: 50 }),
      2,
      2,
    )
    const wide = drawCallsAtBitmapRatio(
      frvpInstance({ histogramWidthPercent: 50 }),
      2,
      2,
    )
    assert.equal(defaultDraw.fills[0].height, 40)
    assert.equal(halfHeight.fills[0].height, 20)
    assert.equal(halfHeight.fills[0].top, 770)
    assert.equal(defaultDraw.fills[0].width, 3)
    assert.equal(wide.fills[0].width, 8)
    assert.equal(wide.fills[0].height, 40)
  })
})
