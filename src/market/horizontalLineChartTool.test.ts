import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, IPriceLine, ISeriesApi } from 'lightweight-charts'
import {
  attachHorizontalLineChartTool,
  isHorizontalLineChartInteractionLocked,
  reconcileHorizontalLinePriceLines,
  resolveHorizontalLinePriceFromPaneY,
} from './horizontalLineChartTool.ts'
import {
  armHorizontalLineTool,
  cancelHorizontalLineInteraction,
  INITIAL_HORIZONTAL_LINE_INTERACTION_STATE,
} from './horizontalLineInteraction.ts'
import { createHorizontalLineInstance } from './horizontalLineInstances.ts'

type ScrollMode = 'locked' | 'unlocked'

function withMockWindow<T>(run: () => T): T {
  const keydownHandlers: Array<(event: KeyboardEvent) => void> = []
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (type: string, handler: (event: KeyboardEvent) => void) => {
        if (type === 'keydown') keydownHandlers.push(handler)
      },
      removeEventListener: (type: string, handler: (event: KeyboardEvent) => void) => {
        if (type === 'keydown') {
          const index = keydownHandlers.indexOf(handler)
          if (index >= 0) keydownHandlers.splice(index, 1)
        }
      },
      dispatchKeydown: (event: KeyboardEvent) => {
        for (const handler of keydownHandlers) handler(event)
      },
    },
  })
  try {
    return run()
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
}

function createMockChart(): { chart: IChartApi; scrollMode: () => ScrollMode } {
  let mode: ScrollMode = 'unlocked'
  const chart = {
    applyOptions: (options: { handleScroll?: { mouseWheel?: boolean } }) => {
      if (options.handleScroll?.mouseWheel === false) mode = 'locked'
      if (options.handleScroll?.mouseWheel === true) mode = 'unlocked'
    },
    panes: () => [
      {
        getHTMLElement: () =>
          ({
            addEventListener: () => {},
            removeEventListener: () => {},
            clientWidth: 400,
            clientHeight: 300,
          }) as unknown as HTMLElement,
      },
    ],
  } as unknown as IChartApi
  return { chart, scrollMode: () => mode }
}

function createMockSeries() {
  const priceLines: IPriceLine[] = []
  const series = {
    coordinateToPrice: (coordinate: number) => (coordinate > 0 ? 100_000 : null),
    createPriceLine: () => {
      const line = { applyOptions: () => {} } as IPriceLine
      priceLines.push(line)
      return line
    },
    removePriceLine: (line: IPriceLine) => {
      const index = priceLines.indexOf(line)
      if (index >= 0) priceLines.splice(index, 1)
    },
    priceLines: () => priceLines,
  } as unknown as ISeriesApi<'Candlestick'>
  return series
}

describe('horizontalLineChartTool', () => {
  it('locks chart interaction when armed', () => {
    const armed = armHorizontalLineTool()
    assert.equal(isHorizontalLineChartInteractionLocked(armed), true)
    assert.equal(
      isHorizontalLineChartInteractionLocked(INITIAL_HORIZONTAL_LINE_INTERACTION_STATE),
      false,
    )
  })

  it('applies chart scroll lock through controller sync', () => {
    withMockWindow(() => {
      const { chart, scrollMode } = createMockChart()
      const series = createMockSeries()
      const controller = attachHorizontalLineChartTool(chart, {
        getSnapshot: () => ({
          interaction: armHorizontalLineTool(),
          instances: [],
        }),
        getCandleSeries: () => series,
        onInteractionChange: () => {},
        onInstanceCompleted: () => {},
      })
      assert.equal(scrollMode(), 'locked')
      controller.dispose()
      assert.equal(scrollMode(), 'unlocked')
    })
  })

  it('reconciles price lines without duplicates', () => {
    const series = createMockSeries()
    const map = new Map<string, IPriceLine>()
    const a = createHorizontalLineInstance({ price: 1 })!
    const b = createHorizontalLineInstance({ price: 2, existingIds: new Set([a.id]) })!
    reconcileHorizontalLinePriceLines(series, [a, b], map)
    assert.equal(map.size, 2)
    reconcileHorizontalLinePriceLines(series, [a], map)
    assert.equal(map.size, 1)
    assert.equal(series.priceLines().length, 1)
  })

  it('resolves finite positive prices from pane coordinates', () => {
    const series = createMockSeries()
    assert.equal(resolveHorizontalLinePriceFromPaneY(series, 50), 100_000)
    assert.equal(resolveHorizontalLinePriceFromPaneY(series, 0), null)
  })

  it('cancels armed placement on escape', () => {
    withMockWindow(() => {
      const { chart } = createMockChart()
      const series = createMockSeries()
      let interaction = armHorizontalLineTool()
      const controller = attachHorizontalLineChartTool(chart, {
        getSnapshot: () => ({ interaction, instances: [] }),
        getCandleSeries: () => series,
        onInteractionChange: (next) => {
          interaction = next
        },
        onInstanceCompleted: () => {},
      })
      const win = globalThis.window as typeof globalThis.window & {
        dispatchKeydown: (event: KeyboardEvent) => void
      }
      win.dispatchKeydown({ key: 'Escape' } as KeyboardEvent)
      assert.deepEqual(interaction, cancelHorizontalLineInteraction(armHorizontalLineTool()))
      controller.dispose()
    })
  })
})
