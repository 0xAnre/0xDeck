import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Logical } from 'lightweight-charts'
import {
  SessionVwapBandSeriesPrimitive,
  attachSessionVwapBandSeriesPrimitive,
  type SessionVwapBandSeriesPrimitiveContext,
} from './sessionVwapBandSeriesPrimitive.ts'

describe('sessionVwapBandSeriesPrimitive lifecycle', () => {
  it('attaches once and clears models when hidden', () => {
    let attachCount = 0
    const series = {
      attachPrimitive: () => {
        attachCount += 1
      },
      detachPrimitive: () => {},
      priceToCoordinate: (price: number) => 100 - price,
    }
    const chart = {
      timeScale: () => ({
        timeToCoordinate: (time: number) => time,
        options: () => ({ barSpacing: 6 }),
      }),
    }

    const primitive = new SessionVwapBandSeriesPrimitive(() => ({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: false,
      fillStyle: 'rgba(1, 2, 3, 0.25)',
    }))
    series.attachPrimitive(primitive)
    primitive.attached({
      chart: chart as never,
      series: series as never,
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)
    assert.equal(attachCount, 1)
    primitive.detached()
  })

  it('attach helper detaches on dispose', () => {
    let detached = false
    const series = {
      attachPrimitive: () => {},
      detachPrimitive: () => {
        detached = true
      },
      priceToCoordinate: () => 50,
    }
    const attachment = attachSessionVwapBandSeriesPrimitive(series as never, {
      points: [],
      visible: true,
      fillStyle: 'rgba(1, 2, 3, 0.25)',
    })
    attachment.dispose()
    assert.equal(detached, true)
  })

  it('includes visible band bounds in autoscale and ignores hidden bands', () => {
    const points = [
      { time: 10, upper1: 12, lower1: 8 },
      { time: 20, upper1: 30, lower1: 4 },
      { time: 30, upper1: 100, lower1: 1 },
    ]
    let visible = true
    const primitive = new SessionVwapBandSeriesPrimitive(() => ({
      points,
      visible,
      fillStyle: 'rgba(1, 2, 3, 0.25)',
    }))
    primitive.attached({
      chart: {
        timeScale: () => ({
          timeToCoordinate: (time: number) => time,
          options: () => ({ barSpacing: 6 }),
        }),
      } as never,
      series: {
        barsInLogicalRange: () => ({ from: 10 as never, to: 20 as never }),
        priceToCoordinate: (price: number) => 100 - price,
      } as never,
      requestUpdate: () => {},
    })

    assert.deepEqual(primitive.autoscaleInfo(0 as Logical, 1 as Logical), {
      priceRange: { minValue: 4, maxValue: 30 },
    })

    visible = false
    assert.equal(primitive.autoscaleInfo(0 as Logical, 1 as Logical), null)
  })
})

type CapturedPrimitive = {
  attached: (param: unknown) => void
  updateAllViews: () => void
  paneViews: () => readonly {
    update: () => void
    renderer: () => { draw: (target: unknown) => void } | null
  }[]
}

function createPrimitiveHarness(context: SessionVwapBandSeriesPrimitiveContext) {
  let primitive: CapturedPrimitive | null = null
  const series = {
    attachPrimitive: (attached: CapturedPrimitive) => {
      primitive = attached
    },
    detachPrimitive: () => {},
    priceToCoordinate: (price: number) => 100 - price,
  }
  const chart = {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time,
      options: () => ({ barSpacing: 6 }),
    }),
  }
  const attachment = attachSessionVwapBandSeriesPrimitive(series as never, context)
  primitive!.attached({
    chart: chart as never,
    series: series as never,
    requestUpdate: () => {},
  })
  return { attachment, getPrimitive: () => primitive! }
}

function renderedFillStyles(primitive: CapturedPrimitive): string[] {
  const view = primitive.paneViews()[0]
  view.update()
  const renderer = view.renderer()
  if (!renderer) return []

  const fillStyles: string[] = []
  let fillStyle = ''
  const context = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
      fillStyles.push(value)
    },
  }
  renderer.draw({
    useBitmapCoordinateSpace: (callback: (scope: unknown) => void) => {
      callback({
        context,
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
        bitmapSize: { width: 100, height: 100 },
      })
    },
  })
  return fillStyles
}

describe('sessionVwapBandSeriesPrimitive fill style', () => {
  it('renders the palette default fill from the initial context', () => {
    const { getPrimitive } = createPrimitiveHarness({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    assert.deepEqual(renderedFillStyles(getPrimitive()), ['rgba(163, 163, 163, 0.25)'])
  })

  it('updates the rendered band fill when the stored fill style changes', () => {
    const { attachment, getPrimitive } = createPrimitiveHarness({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    attachment.setFillStyle('rgba(18, 52, 86, 0.6)')
    assert.deepEqual(renderedFillStyles(getPrimitive()), ['rgba(18, 52, 86, 0.6)'])
  })

  it('keeps the band geometry but renders a transparent fill at 0% opacity', () => {
    const { attachment, getPrimitive } = createPrimitiveHarness({
      points: [
        { time: 10, upper1: 12, lower1: 8 },
        { time: 20, upper1: 14, lower1: 9 },
      ],
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    attachment.setFillStyle('rgba(163, 163, 163, 0)')
    const fills = renderedFillStyles(getPrimitive())
    assert.deepEqual(fills, ['rgba(163, 163, 163, 0)'])
  })
})
