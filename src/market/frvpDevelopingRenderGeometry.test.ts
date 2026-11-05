import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeFixedRangeVolumeProfileWithDeveloping,
  type FixedRangeVolumeProfileCandle,
  type FixedRangeVolumeProfileDevelopingSample,
  type FixedRangeVolumeProfileResult,
} from './fixedRangeVolumeProfile.ts'
import {
  buildFixedRangeVolumeProfileDevelopingLines,
  buildFixedRangeVolumeProfileDrawModels,
  buildFixedRangeVolumeProfileInstanceDrawModel,
  type FixedRangeVolumeProfileInstanceDrawModel,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import { frvpDefaultDrawStyle } from './frvpInstanceLineStyles.ts'
import { buildFixedRangeVolumeProfileRequestIdentityKey } from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import {
  frvpInstancePocMode,
  frvpInstanceValueAreaMode,
} from './frvpDevelopingMode.ts'

const TICK = 1
const FROM_TIME = 100
const TO_TIME = 300
const STYLES = frvpDefaultDrawStyle()
const X = (time: number) => time / 10
const Y = (price: number) => 1_000 - price

function candle(
  time: number,
  low: number,
  high: number,
  volume: number,
): FixedRangeVolumeProfileCandle {
  return { time, low, high, open: low, close: high, volume }
}

const CANDLES = [
  candle(100, 99, 101, 10),
  candle(200, 104, 106, 20),
  candle(300, 109, 111, 15),
]

function profileResult(): {
  profile: FixedRangeVolumeProfileResult
  developing: FixedRangeVolumeProfileDevelopingSample[]
} {
  return computeFixedRangeVolumeProfileWithDeveloping({
    candles: CANDLES,
    fromTime: FROM_TIME,
    toTime: TO_TIME,
    rowCount: 20,
    valueAreaPercent: 70,
    tickSize: TICK,
  })
}

function drawModel(
  overrides: {
    valueAreaMode?: FixedRangeVolumeProfileInstance['valueAreaMode']
    pocMode?: FixedRangeVolumeProfileInstance['pocMode']
    developing?: {
      samples: readonly FixedRangeVolumeProfileDevelopingSample[]
      visibleTimeRange?: { fromTime: number; toTime: number } | null
    } | null
  } = {},
): FixedRangeVolumeProfileInstanceDrawModel {
  const { profile } = profileResult()
  const model = buildFixedRangeVolumeProfileInstanceDrawModel({
    instanceId: 'frvp-1',
    fromTime: FROM_TIME,
    toTime: TO_TIME,
    profile,
    fromTimeToCoordinate: X,
    toTimeToCoordinate: X,
    barSpacing: 6,
    priceToY: Y,
    ...STYLES,
    ...overrides,
  })
  assert.ok(model)
  return model
}

function kinds(model: FixedRangeVolumeProfileInstanceDrawModel): string[] {
  return model.developingLines.map((line) => line.kind)
}

function instance(
  overrides: Partial<FixedRangeVolumeProfileInstance> = {},
): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-1',
    fromTime: FROM_TIME,
    toTime: TO_TIME,
    selectionInterval: '1m',
    rowCount: 20,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
    ...overrides,
  }
}

describe('fixedRangeVolumeProfile developing render geometry', () => {
  it('renders today’s flat lines for a legacy instance with no stored modes', () => {
    const { developing } = profileResult()
    const model = drawModel({ developing: { samples: developing } })

    assert.deepEqual(kinds(model), [])
    assert.deepEqual(
      model.lines.map((line) => line.kind),
      ['poc', 'vah', 'val'],
    )
  })

  it('pins the default model to the explicit line-mode model', () => {
    const { developing } = profileResult()
    const legacy = drawModel({ developing: { samples: developing } })
    const explicitLine = drawModel({
      valueAreaMode: 'line',
      pocMode: 'line',
      developing: { samples: developing },
    })
    assert.deepEqual(legacy, explicitLine)
  })

  it('keeps line mode free of developing geometry even with samples available', () => {
    const { developing } = profileResult()
    const model = drawModel({
      valueAreaMode: 'line',
      pocMode: 'line',
      developing: { samples: developing },
    })
    assert.deepEqual(kinds(model), [])
    assert.equal(model.lines.length, 3)
  })

  it('draws only the developing value area when the value area is a step', () => {
    const { developing } = profileResult()
    const model = drawModel({
      valueAreaMode: 'step',
      pocMode: 'line',
      developing: { samples: developing },
    })
    assert.deepEqual(
      model.lines.map((line) => line.kind),
      ['poc'],
    )
    assert.deepEqual(kinds(model), ['vah', 'val'])
  })

  it('draws only the developing POC when the POC is a step', () => {
    const { developing } = profileResult()
    const model = drawModel({
      valueAreaMode: 'line',
      pocMode: 'step',
      developing: { samples: developing },
    })
    assert.deepEqual(
      model.lines.map((line) => line.kind),
      ['vah', 'val'],
    )
    assert.deepEqual(kinds(model), ['poc'])
  })

  it('draws both groups in both mode and keeps the two groups independent', () => {
    const { developing } = profileResult()
    const both = drawModel({
      valueAreaMode: 'both',
      pocMode: 'both',
      developing: { samples: developing },
    })
    assert.equal(both.lines.length, 3)
    assert.deepEqual(kinds(both), ['poc', 'vah', 'val'])

    const mixed = drawModel({
      valueAreaMode: 'both',
      pocMode: 'step',
      developing: { samples: developing },
    })
    assert.deepEqual(
      mixed.lines.map((line) => line.kind),
      ['vah', 'val'],
    )
    assert.deepEqual(kinds(mixed), ['poc', 'vah', 'val'])
  })

  it('ends each developing level on the full-range level at the range end', () => {
    const { profile, developing } = profileResult()
    const finalLevel = {
      poc: profile.pocPrice as number,
      vah: profile.vah as number,
      val: profile.val as number,
    }

    // Step-only: there is no flat line, and the last staircase point sits on
    // the level the full-range profile reports.
    const stepModel = drawModel({
      valueAreaMode: 'step',
      pocMode: 'step',
      developing: { samples: developing },
    })
    assert.deepEqual(stepModel.lines, [])
    for (const kind of ['poc', 'vah', 'val'] as const) {
      const line = stepModel.developingLines.find((item) => item.kind === kind)
      assert.ok(line, `no developing geometry for ${kind}`)
      const lastRun = line.runs[line.runs.length - 1]
      const lastPoint = lastRun[lastRun.length - 1]
      assert.equal(lastPoint.x, stepModel.rangeRight)
      assert.equal(lastPoint.y, Y(finalLevel[kind]))
    }

    // Both: the flat full-range line and the final step share the same y.
    const bothModel = drawModel({
      valueAreaMode: 'both',
      pocMode: 'both',
      developing: { samples: developing },
    })
    for (const flatLine of bothModel.lines) {
      const developingLine = bothModel.developingLines.find(
        (line) => line.kind === flatLine.kind,
      )
      assert.ok(developingLine, `no developing geometry for ${flatLine.kind}`)
      const lastRun = developingLine.runs[developingLine.runs.length - 1]
      const lastPoint = lastRun[lastRun.length - 1]
      assert.equal(lastPoint.x, bothModel.rangeRight)
      assert.equal(lastPoint.y, flatLine.y)
      assert.equal(flatLine.y, Y(finalLevel[flatLine.kind]))
    }
  })

  it('reuses the per-level stroke settings for the developing series', () => {
    const { developing } = profileResult()
    const styles = {
      ...STYLES,
      pocStrokeStyle: 'rgba(1, 2, 3, 0.4)',
      pocLineWidthCssPx: 4,
      pocLineDash: [2, 3],
      vahStrokeStyle: 'rgba(4, 5, 6, 0.7)',
      vahLineWidthCssPx: 2,
      vahLineDash: [1, 1],
      valStrokeStyle: 'rgba(7, 8, 9, 0.9)',
      valLineWidthCssPx: 1,
      valLineDash: [],
    }
    const model = buildFixedRangeVolumeProfileInstanceDrawModel({
      instanceId: 'frvp-1',
      fromTime: FROM_TIME,
      toTime: TO_TIME,
      profile: profileResult().profile,
      fromTimeToCoordinate: X,
      toTimeToCoordinate: X,
      barSpacing: 6,
      priceToY: Y,
      ...styles,
      valueAreaMode: 'both',
      pocMode: 'both',
      developing: { samples: developing },
    })
    assert.ok(model)
    const byKind = new Map(model.developingLines.map((line) => [line.kind, line]))
    for (const kind of ['poc', 'vah', 'val'] as const) {
      const line = byKind.get(kind)
      assert.equal(line?.strokeStyle, styles[`${kind}StrokeStyle`])
      assert.equal(line?.lineWidthCssPx, styles[`${kind}LineWidthCssPx`])
      assert.deepEqual(line?.lineDash, styles[`${kind}LineDash`])
    }
  })

  it('omits developing geometry when there are no samples', () => {
    // Without cumulative samples a step group renders nothing, like an empty
    // profile: the mode decides the flat line, the samples decide the steps.
    const model = drawModel({
      valueAreaMode: 'step',
      pocMode: 'step',
      developing: { samples: [] },
    })
    assert.deepEqual(kinds(model), [])
    assert.deepEqual(model.lines, [])

    const lineModel = drawModel({
      valueAreaMode: 'line',
      pocMode: 'line',
      developing: { samples: [] },
    })
    assert.deepEqual(kinds(lineModel), [])
    assert.deepEqual(
      lineModel.lines.map((line) => line.kind),
      ['poc', 'vah', 'val'],
    )
  })

  it('bounds the step walk to the visible window', () => {
    const samples = Array.from({ length: 500 }, (_, index) => ({
      time: 100 + index * 1,
      pocPrice: 100 + (index % 5),
      vah: 105 + (index % 3),
      val: 95 - (index % 2),
    }))
    const full = buildFixedRangeVolumeProfileDevelopingLines({
      developing: { samples },
      valueAreaMode: 'line',
      pocMode: 'both',
      rangeStartX: 0,
      rangeEndX: 1_000,
      timeToX: (time) => time - 100,
      priceToY: (price) => price,
      ...STYLES,
    })
    const windowed = buildFixedRangeVolumeProfileDevelopingLines({
      developing: { samples, visibleTimeRange: { fromTime: 300, toTime: 320 } },
      valueAreaMode: 'line',
      pocMode: 'both',
      rangeStartX: 0,
      rangeEndX: 1_000,
      timeToX: (time) => time - 100,
      priceToY: (price) => price,
      ...STYLES,
    })
    const fullPoints = full[0].runs.reduce((sum, run) => sum + run.length, 0)
    const windowedPoints = windowed[0].runs.reduce((sum, run) => sum + run.length, 0)
    assert.ok(windowedPoints < fullPoints)
    assert.ok(windowedPoints <= 3 * (320 - 300 + 2))
  })

  it('gets step samples only from the instances that the caller opts in', () => {
    const { profile, developing } = profileResult()
    const instanceStyles = frvpDefaultDrawStyle()
    const base = {
      fromTimeToCoordinate: X,
      toTimeToCoordinate: X,
      barSpacing: 6,
      priceToY: Y,
      styleForInstance: () => instanceStyles,
    }
    const legacyInstances = [instance()]
    const readyById = new Map([[legacyInstances[0].id, { profile, developing }]])

    // Hit-test/arbitration path: no developing map ⇒ no step geometry.
    const hitTestModels = buildFixedRangeVolumeProfileDrawModels({
      instances: legacyInstances,
      readyById,
      ...base,
    })
    assert.deepEqual(kinds(hitTestModels[0]), [])

    // Render path: the map + a step mode produce the step series.
    const stepInstances = [instance({ valueAreaMode: 'step', pocMode: 'step' })]
    const renderModels = buildFixedRangeVolumeProfileDrawModels({
      instances: stepInstances,
      readyById,
      developingSamplesById: new Map([[stepInstances[0].id, developing]]),
      developingVisibleTimeRange: null,
      ...base,
    })
    assert.deepEqual(kinds(renderModels[0]), ['poc', 'vah', 'val'])
    assert.deepEqual(renderModels[0].lines, [])
    assert.deepEqual(
      frvpInstanceValueAreaMode(stepInstances[0]),
      'step',
    )
    assert.equal(frvpInstancePocMode(stepInstances[0]), 'step')
    assert.equal(
      buildFixedRangeVolumeProfileRequestIdentityKey(stepInstances[0]),
      buildFixedRangeVolumeProfileRequestIdentityKey(instance()),
      'render modes must not change the profile request identity',
    )
  })
})
