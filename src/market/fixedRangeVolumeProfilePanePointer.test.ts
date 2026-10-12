import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, Time } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfilePanePointerUp,
  attachFixedRangeVolumeProfilePanePointer,
  resolvePaneRelativePointerX,
  resolveSelectionTimeFromPaneX,
} from './fixedRangeVolumeProfilePanePointer.ts'
import {
  applyFixedRangeVolumeProfileClick,
  armFixedRangeVolumeProfileTool,
  INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
} from './fixedRangeVolumeProfileInteraction.ts'

function mockChart(times: Record<number, Time | null> = {}): IChartApi {
  return {
    timeScale: () => ({
      coordinateToTime: (x: number) => times[Math.round(x)] ?? times[x] ?? null,
    }),
    panes: () => [{ getHTMLElement: () => null }],
  } as unknown as IChartApi
}

function pointerCallbacks(
  getInteraction: () => ReturnType<typeof armFixedRangeVolumeProfileTool>,
  instances: unknown[],
  onInteractionChange: (state: ReturnType<typeof armFixedRangeVolumeProfileTool>) => void,
  lastBarUnixTime: number | null = null,
) {
  return {
    getSnapshot: () => ({
      interaction: getInteraction(),
      instances,
      runtimeById: {},
    }),
    getSeries: () => null,
    getSelectionInterval: () => '1m' as const,
    getIntervalDurationSeconds: () => 300,
    getLastBarUnixTime: () => lastBarUnixTime,
    onInteractionChange,
    onInstanceCompleted: (instance: unknown) => {
      instances.push(instance)
    },
    onInstanceUpdated: () => {},
    onRequestRender: () => {},
    isAlternateToolActive: () => false,
  }
}

describe('fixedRangeVolumeProfilePanePointer', () => {
  it('resolves pane-relative pointer x', () => {
    const pane = {
      getBoundingClientRect: () => ({ left: 100, top: 0, width: 400, height: 300 }),
    } as HTMLElement
    const x = resolvePaneRelativePointerX({ clientX: 250, button: 0 } as PointerEvent, pane)
    assert.equal(x, 150)
  })

  it('creates one instance from first and second pointer times', () => {
    const instances: unknown[] = []
    let interaction = armFixedRangeVolumeProfileTool()
    const chart = mockChart({ 10: 100 as Time, 20: 200 as Time })
    const callbacks = pointerCallbacks(() => interaction, instances, (state) => {
      interaction = state
    })
    applyFixedRangeVolumeProfilePanePointerUp(chart, 10, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 20, callbacks)
    assert.equal(instances.length, 1)
    assert.equal(interaction.phase, 'inactive')
  })

  it('ignores pointer when tool is inactive', () => {
    let interaction = INITIAL_FIXED_RANGE_VP_INTERACTION_STATE
    const chart = mockChart({ 10: 100 as Time })
    const callbacks = {
      getSnapshot: () => ({ interaction, instances: [], runtimeById: {} }),
      getSeries: () => null,
      getSelectionInterval: () => '1m' as const,
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => null,
      onInteractionChange: (state: typeof interaction) => {
        interaction = state
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      isAlternateToolActive: () => false,
    }
    applyFixedRangeVolumeProfilePanePointerUp(chart, 10, callbacks)
    assert.equal(interaction.phase, 'inactive')
  })

  it('does not create two instances from a completed inactive tool on extra pointer', () => {
    const instances: unknown[] = []
    let interaction = armFixedRangeVolumeProfileTool()
    const chart = mockChart({ 10: 100 as Time, 20: 200 as Time })
    const callbacks = pointerCallbacks(() => interaction, instances, (state) => {
      interaction = state
    })
    applyFixedRangeVolumeProfilePanePointerUp(chart, 10, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 20, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 30, callbacks)
    assert.equal(instances.length, 1)
  })

  it('completes rightward creation when coordinateToTime snaps to an earlier bar in future whitespace', () => {
    const barTimes = [1_700_000_000, 1_700_000_300, 1_700_000_600]
    const chart = {
      timeScale: () => ({
        coordinateToTime: (x: number) => {
          if (x >= 25) return barTimes[1] as Time
          return barTimes[Math.round(x / 10)] ?? null
        },
        timeToIndex: (time: number, findNearest?: boolean) => {
          const lastIndex = barTimes.length - 1
          if (time > barTimes[lastIndex]) return findNearest ? lastIndex : null
          const index = barTimes.findIndex((bar) => bar >= time)
          if (index === -1) return findNearest ? lastIndex : null
          return index
        },
        logicalToCoordinate: (logical: number) => logical * 10,
        coordinateToLogical: (x: number) => x / 10,
      }),
      panes: () => [{ getHTMLElement: () => null }],
    } as unknown as IChartApi
    const instances: unknown[] = []
    let interaction = armFixedRangeVolumeProfileTool()
    const lastBar = barTimes[barTimes.length - 1]
    const callbacks = pointerCallbacks(() => interaction, instances, (state) => {
      interaction = state
    }, lastBar)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 0, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 50, callbacks)
    assert.equal(instances.length, 1)
    const instance = instances[0] as { fromTime: number; toTime: number }
    assert.equal(instance.fromTime, barTimes[0])
    assert.equal(instance.toTime, lastBar)
  })

  it('completes a range on the latest candle from whitespace past the last bar', () => {
    const barTimes = [1_700_000_000, 1_700_000_300, 1_700_000_600]
    const chart = {
      timeScale: () => ({
        coordinateToTime: (x: number) => barTimes[Math.round(x / 10)] ?? null,
        timeToIndex: (time: number, findNearest?: boolean) => {
          const lastIndex = barTimes.length - 1
          if (time > barTimes[lastIndex]) return findNearest ? lastIndex : null
          const index = barTimes.findIndex((bar) => bar >= time)
          if (index === -1) return findNearest ? lastIndex : null
          return index
        },
        logicalToCoordinate: (logical: number) => logical * 10,
        coordinateToLogical: (x: number) => x / 10,
      }),
      panes: () => [{ getHTMLElement: () => null }],
    } as unknown as IChartApi
    const instances: unknown[] = []
    let interaction = armFixedRangeVolumeProfileTool()
    const lastBar = barTimes[barTimes.length - 1]
    const callbacks = pointerCallbacks(() => interaction, instances, (state) => {
      interaction = state
    }, lastBar)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 0, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 50, callbacks)
    assert.equal(instances.length, 1)
    const instance = instances[0] as { toTime: number }
    assert.equal(instance.toTime, lastBar)
  })

  it('uses preview time fallback only when it differs from anchor', () => {
    const preview = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, [], '1m').state
    const chart = mockChart({})
    assert.equal(resolveSelectionTimeFromPaneX(chart, 50, preview), null)
    const moved = {
      ...preview,
      draft: { kind: 'create' as const, anchorTime: 100, previewTime: 150 },
    }
    assert.equal(resolveSelectionTimeFromPaneX(chart, 50, moved), 150)
  })

  it('disposes pane listener', () => {
    const handlers: Array<(event: PointerEvent) => void> = []
    const paneElement = {
      addEventListener: (type: string, handler: (event: PointerEvent) => void) => {
        if (type === 'pointerup') handlers.push(handler)
      },
      removeEventListener: (type: string, handler: (event: PointerEvent) => void) => {
        if (type === 'pointerup') {
          const index = handlers.indexOf(handler)
          if (index >= 0) handlers.splice(index, 1)
        }
      },
    } as unknown as HTMLElement
    const chart = {
      panes: () => [{ getHTMLElement: () => paneElement }],
      timeScale: () => ({ coordinateToTime: () => 100 }),
    } as unknown as IChartApi
    let interaction = armFixedRangeVolumeProfileTool()
    const controller = attachFixedRangeVolumeProfilePanePointer(chart, {
      getSnapshot: () => ({ interaction, instances: [], runtimeById: {} }),
      getSeries: () => null,
      getSelectionInterval: () => '1m',
      getIntervalDurationSeconds: () => 60,
      getLastBarUnixTime: () => null,
      onInteractionChange: (state) => {
        interaction = state
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      isAlternateToolActive: () => false,
    })
    assert.equal(handlers.length, 1)
    controller.dispose()
    assert.equal(handlers.length, 0)
  })
})
