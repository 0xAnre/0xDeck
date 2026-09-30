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
    const callbacks = {
      getSnapshot: () => ({ interaction, instances }),
      getSelectionInterval: () => '1m' as const,
      onInteractionChange: (state: typeof interaction) => {
        interaction = state
      },
      onInstanceCompleted: (instance: unknown) => {
        instances.push(instance)
      },
    }
    applyFixedRangeVolumeProfilePanePointerUp(chart, 10, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 20, callbacks)
    assert.equal(instances.length, 1)
    assert.equal(interaction.phase, 'inactive')
  })

  it('ignores pointer when tool is inactive', () => {
    let interaction = INITIAL_FIXED_RANGE_VP_INTERACTION_STATE
    const chart = mockChart({ 10: 100 as Time })
    const callbacks = {
      getSnapshot: () => ({ interaction, instances: [] }),
      getSelectionInterval: () => '1m' as const,
      onInteractionChange: (state: typeof interaction) => {
        interaction = state
      },
      onInstanceCompleted: () => {},
    }
    applyFixedRangeVolumeProfilePanePointerUp(chart, 10, callbacks)
    assert.equal(interaction.phase, 'inactive')
  })

  it('does not create two instances from a completed inactive tool on extra pointer', () => {
    const instances: unknown[] = []
    let interaction = armFixedRangeVolumeProfileTool()
    const chart = mockChart({ 10: 100 as Time, 20: 200 as Time })
    const callbacks = {
      getSnapshot: () => ({ interaction, instances }),
      getSelectionInterval: () => '1m' as const,
      onInteractionChange: (state: typeof interaction) => {
        interaction = state
      },
      onInstanceCompleted: (instance: unknown) => {
        instances.push(instance)
      },
    }
    applyFixedRangeVolumeProfilePanePointerUp(chart, 10, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 20, callbacks)
    applyFixedRangeVolumeProfilePanePointerUp(chart, 30, callbacks)
    assert.equal(instances.length, 1)
  })

  it('uses preview time fallback only when it differs from anchor', () => {
    const preview = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, [], '1m').state
    const chart = mockChart({})
    assert.equal(resolveSelectionTimeFromPaneX(chart, 50, preview), null)
    const moved = { ...preview, draft: { anchorTime: 100, previewTime: 150 } }
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
      getSnapshot: () => ({ interaction, instances: [] }),
      getSelectionInterval: () => '1m',
      onInteractionChange: (state) => {
        interaction = state
      },
      onInstanceCompleted: () => {},
    })
    assert.equal(handlers.length, 1)
    controller.dispose()
    assert.equal(handlers.length, 0)
  })
})
