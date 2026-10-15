import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  frvpHitAtPanePoint,
  preferDrawingPointerTarget,
  preferDrawingPointerTargetAmongPeers,
} from './drawingPointerArbitration.ts'
import type { FixedRangeVolumeProfileHitTarget } from './fixedRangeVolumeProfileHitTest.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import { buildFixedRangeVolumeProfileRequestIdentityKey } from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import type { LineHitTarget } from './lineHitTest.ts'
import type { AnchoredVwapDrawingHitTarget } from './anchoredVwapDrawingHitTest.ts'
import type { RectangleHitTarget } from './rectangleHitTest.ts'

function lineHit(kind: LineHitTarget['kind']): LineHitTarget {
  return { instanceId: 'line-1', kind, priority: 1, instanceIndex: 0 }
}

function rectangleHit(kind: RectangleHitTarget['kind']): RectangleHitTarget {
  return { instanceId: 'rect-1', kind, priority: 1, instanceIndex: 0 }
}

function frvpHit(kind: FixedRangeVolumeProfileHitTarget['kind']): FixedRangeVolumeProfileHitTarget {
  return { instanceId: 'frvp-1', kind, priority: 1, instanceIndex: 0 }
}

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

function frvpRuntime(
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileRuntimeSnapshot {
  const profile: FixedRangeVolumeProfileResult = {
    fromTime: instance.fromTime,
    toTime: instance.toTime - 1,
    candleCount: 1,
    profileLow: 20,
    profileHigh: 80,
    rowHeight: 60,
    rows: [
      {
        priceLow: 20,
        priceHigh: 80,
        upVolume: 5,
        downVolume: 5,
        totalVolume: 10,
        inValueArea: true,
      },
    ],
    totalVolume: 10,
    pocRowIndex: 0,
    pocPrice: 50,
    pocVolume: 10,
    vah: 70,
    val: 30,
    valueAreaVolume: 10,
    valueAreaPercentAchieved: 100,
  }
  return {
    [instance.id]: {
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
    },
  }
}

function anchoredVwapHit(
  kind: AnchoredVwapDrawingHitTarget['kind'],
): AnchoredVwapDrawingHitTarget {
  return { instanceId: 'avwap-1', kind }
}

describe('preferDrawingPointerTarget', () => {
  it('lets a line stroke win over a rectangle fill', () => {
    assert.equal(preferDrawingPointerTarget(lineHit('body'), rectangleHit('interior')), 'line')
    assert.equal(
      preferDrawingPointerTarget(lineHit('endpoint-a'), rectangleHit('interior')),
      'line',
    )
  })

  it('keeps a lone rectangle hit and a selected rectangle edge', () => {
    assert.equal(preferDrawingPointerTarget(null, rectangleHit('interior')), 'rectangle')
    assert.equal(preferDrawingPointerTarget(lineHit('body'), rectangleHit('edge-n')), 'rectangle')
    assert.equal(preferDrawingPointerTarget(lineHit('body'), null), 'line')
  })

  it('prefers the line when handle specificity ties', () => {
    assert.equal(
      preferDrawingPointerTarget(lineHit('endpoint-b'), rectangleHit('corner-se')),
      'line',
    )
  })
})

describe('preferDrawingPointerTargetAmongPeers', () => {
  it('lets line and rectangle beat FRVP body hits', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(lineHit('body'), rectangleHit('interior'), frvpHit('body')),
      'line',
    )
    assert.equal(
      preferDrawingPointerTargetAmongPeers(null, rectangleHit('interior'), frvpHit('body')),
      'rectangle',
    )
  })

  it('lets FRVP endpoint beat rectangle interior', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(null, rectangleHit('interior'), frvpHit('end')),
      'frvp',
    )
  })

  it('prefers line over FRVP endpoint when specificity ties', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(lineHit('endpoint-a'), null, frvpHit('start')),
      'line',
    )
  })

  it('lets anchored VWAP anchor beat rectangle interior', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(
        null,
        rectangleHit('interior'),
        null,
        anchoredVwapHit('anchor'),
      ),
      'anchored-vwap',
    )
  })

  it('prefers line endpoint over anchored VWAP anchor when specificity ties', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(
        lineHit('endpoint-a'),
        null,
        null,
        anchoredVwapHit('anchor'),
      ),
      'line',
    )
  })

  it('lets anchored VWAP body beat FRVP body', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(null, null, frvpHit('body'), anchoredVwapHit('body')),
      'anchored-vwap',
    )
  })
})

describe('frvpHitAtPanePoint identity validation', () => {
  function createChartAndSeries() {
    const chart = {
      timeScale: () => ({
        options: () => ({ barSpacing: 6 }),
        timeToCoordinate: (time: number) => time,
        coordinateToTime: () => 120,
        coordinateToLogical: (x: number) => x,
        logicalToCoordinate: (logical: number) => logical,
        timeToIndex: () => 1,
      }),
    } as unknown as IChartApi
    const series = {
      priceToCoordinate: (price: number) => 100 - price,
    } as unknown as ISeriesApi<SeriesType, Time>
    return { chart, series }
  }

  it('ignores a stale FRVP profile after the committed range changes', () => {
    const { chart, series } = createChartAndSeries()
    const previous = frvpInstance({ fromTime: 100, toTime: 200 })
    const committed = { ...previous, toTime: 260 }
    const runtimeById = frvpRuntime(previous)
    const baseArgs = {
      chart,
      series,
      paneX: 105,
      paneY: 50,
      intervalDurationSeconds: 3600,
      lastBarUnixTime: 200,
      runtimeById,
      selectedId: previous.id,
    }

    assert.equal(frvpHitAtPanePoint({ ...baseArgs, instances: [committed] }), null)
    assert.equal(
      frvpHitAtPanePoint({ ...baseArgs, instances: [previous] })?.instanceId,
      previous.id,
    )
  })
})
