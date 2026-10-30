import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveGridLayout,
  getCompactor,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout'
import { LockIcon, LockOpenIcon, XIcon } from 'lucide-react'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './App.css'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PanelHeaderControls } from './PanelHeaderControls'
import { BREAKPOINTS, COLS, ROW_HEIGHT, breakpointFromWidth } from './breakpoints'
import {
  WORKSPACE_STORAGE_KEY,
  appendPanel,
  createWorkspace,
  lgLayoutEqual,
  loadWorkspaces,
  reloadWorkspaces,
  removePanel,
  saveWorkspaceChangeOrKeepPrevious,
  saveWorkspaces,
  selectWorkspace,
  updateWorkspaceState,
  type WorkspaceStore,
} from './layoutStorage'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { panelDisplayTitle, resolvePanelInstance } from './panels'
import {
  getWidgetDefinitionForInstance,
  widgetHasHeaderControls,
  type WidgetDefinition,
} from '@/widgets/registry'
import { ParquetDataProvider } from './context/ParquetDataContext'
import { WidgetSettingsProvider } from './context/WidgetSettingsContext'
import { WorkspaceScopeProvider } from './context/WorkspaceScopeContext'
import { DataSourceDialog } from './DataSourceDialog'
import { ThemeSelect } from './ThemeSelect'
import { WidgetSelect } from './WidgetSelect'
import { applyTheme, loadTheme, saveTheme, type Theme } from './themeStorage'
import {
  createScreenNavigationSequenceHandler,
  createWorkspaceScreenNavigationIntent,
  resolveLockedWorkspaceScreenScrollTop,
  resolveScreenLockAlignmentScreenIndex,
  resolveWorkspaceScreenExtentHeight,
  resolveWorkspaceScreenScrollTop,
  scrollToWorkspaceScreenAtIndex,
  type WorkspaceScreenNavigationIntent,
} from './screenNavigationShortcuts'

/** Sub-pixel scroll offsets are treated as aligned so Screen Lock never fights the browser. */
const WORKSPACE_LOCK_ALIGNMENT_TOLERANCE_PX = 0.5

const SCREEN_LOCK_LABELS = {
  off: 'Screen Lock OFF — ekran kilidi kapalı, serbest kaydırma. Etkin ekrana kilitlemek için tıkla',
  on: 'Screen Lock ON — ekran kilidi açık, çalışma alanı etkin ekrana sabitlendi. Kilidi açmak için tıkla',
} as const

const RESIZE_HANDLES = ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] as const
const OVERLAP_COMPACTOR = getCompactor(null, true)
/** Stable empty fallback so `focusOrder` keeps its identity for a workspace without stacking state. */
const EMPTY_PANEL_IDS: string[] = []

function reconcileStackOrder(previous: string[], activePanels: string[]): string[] {
  const kept = previous.filter((id) => activePanels.includes(id))
  const added = activePanels.filter((id) => !kept.includes(id))
  return [...kept, ...added]
}

/**
 * Widget body, memoized by the identity of its two props.
 *
 * A react-grid-layout drag or resize emits a layout change per frame, and `handleLayoutChange` /
 * `persistLayoutInteraction` store it per frame, so `App` re-renders on every mouse move. The body
 * props (`definition.component` from the registry, `panelId`, `headerSettings`) never change during
 * that, so without this memo every chart panel body — lightweight-charts, Recharts, the data table —
 * was re-rendered several times per mouse move and dominated the interaction. Measured on the
 * issue #200 workload (2 BTC charts, 2 Recharts charts, a table and a KPI card): the drag re-rendered
 * the BTC chart bodies 386 times and the header controls 1158 times, and 10 drag stops accumulated
 * ~1.9 s of long tasks; with the memo neither body renders at all during a drag or resize and 10 drag
 * stops no longer produce a single long task.
 *
 * Context reads still reach the body: `WorkspaceScopeProvider` and `WidgetSettingsProvider` updates
 * pierce `memo`, so a workspace switch or a settings change still re-renders exactly the panels that
 * consume them.
 */
const PanelWidgetBody = memo(function PanelWidgetBody({
  component: WidgetBody,
  panelId,
  headerSettings,
}: {
  component: WidgetDefinition['component']
  panelId: string
  headerSettings: WidgetDefinition['headerSettings']
}) {
  return <WidgetBody panelId={panelId} headerSettings={headerSettings} />
})

/**
 * Panel header controls, memoized by `panelId`.
 *
 * The controls re-read their widget settings from `WidgetSettingsContext`, whose value changes only
 * when a panel registers or bumps its settings, so a workspace layout update never changes what they
 * render. Memoizing keeps the dropdown triggers out of the per-frame `App` re-render as well.
 */
const MemoPanelHeaderControls = memo(PanelHeaderControls)

function App() {
  const { width, containerRef, mounted } = useContainerWidth()
  const [workspaces, setWorkspaces] = useState<WorkspaceStore>(loadWorkspaces)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [screenLock, setScreenLock] = useState(false)
  const [workspaceViewportHeight, setWorkspaceViewportHeight] = useState(0)
  const activeScreenIndexRef = useRef(0)
  const pendingScreenNavigationRef = useRef<WorkspaceScreenNavigationIntent | null>(null)
  const lockedScrollTopRef = useRef(0)

  const activeWorkspaceId = workspaces.activeWorkspaceId
  // `loadWorkspaces` and every store mutation keep at least one workspace.
  const workspace = (
    workspaces.workspaces.find((entry) => entry.id === activeWorkspaceId) ??
    workspaces.workspaces[0]
  ).state

  // Stacking order is per workspace, so z-index never leaks from one workspace into another.
  const [focusOrderByWorkspace, setFocusOrderByWorkspace] = useState<
    Record<string, string[]>
  >({})
  const focusOrder = focusOrderByWorkspace[activeWorkspaceId] ?? EMPTY_PANEL_IDS
  const stackOrder = useMemo(
    () => reconcileStackOrder(focusOrder, workspace.activePanels),
    [focusOrder, workspace.activePanels],
  )

  // Grid callbacks are guarded with the workspace they belong to: a layout change or a
  // drag/resize stop that started in the previously active workspace must never be persisted
  // into the newly activated one.
  const activeWorkspaceIdRef = useRef(activeWorkspaceId)
  const interactionWorkspaceIdRef = useRef(activeWorkspaceId)

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId
  }, [activeWorkspaceId])

  // Latest store for the `storage` listener, which runs outside the render pass.
  const workspacesRef = useRef(workspaces)
  useEffect(() => {
    workspacesRef.current = workspaces
  }, [workspaces])

  // Another tab writes the same `0xdeck-workspace` key. Re-read it so this tab adopts workspaces
  // created elsewhere instead of rendering (and later saving) a stale list, while keeping its own
  // active workspace and its not-yet-persisted edits.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== WORKSPACE_STORAGE_KEY) return
      setWorkspaces(reloadWorkspaces(workspacesRef.current))
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  // Viewport height of the workspace scroller drives the virtual 9-screen scroll extent and the
  // Screen Lock alignment. Observing it keeps both correct on window/viewport resize. The initial
  // measurement does not need the observer, so it runs even where ResizeObserver is unavailable.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => setWorkspaceViewportHeight(container.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])

  const alignLockedWorkspace = useCallback(
    (screenIndex: number) => {
      const container = containerRef.current
      if (!container) return
      const targetTop = resolveLockedWorkspaceScreenScrollTop(container, screenIndex)
      if (targetTop === null) return
      lockedScrollTopRef.current = targetTop
      if (Math.abs(container.scrollTop - targetTop) <= WORKSPACE_LOCK_ALIGNMENT_TOLERANCE_PX) return
      container.scrollTo({ top: targetTop, behavior: 'auto' })
    },
    [containerRef],
  )

  // Screen Lock ON: re-align to the active screen's exact top after a viewport-height change.
  useEffect(() => {
    if (!screenLock) return
    alignLockedWorkspace(activeScreenIndexRef.current)
  }, [screenLock, workspaceViewportHeight, alignLockedWorkspace])

  // Screen Lock ON: any workspace scroll offset (wheel, trackpad, keyboard, momentum, focus scroll)
  // is reverted to the active screen's exact top, so the workspace never rests between screens.
  // Widget interactions are untouched: panel bodies and the BTC Perp chart scroll/zoom themselves.
  useEffect(() => {
    if (!screenLock) return
    const container = containerRef.current
    if (!container) return

    const settle = () => {
      const targetTop = lockedScrollTopRef.current
      if (Math.abs(container.scrollTop - targetTop) <= WORKSPACE_LOCK_ALIGNMENT_TOLERANCE_PX) return
      container.scrollTop = targetTop
    }

    settle()
    container.addEventListener('scroll', settle, { passive: true })
    return () => container.removeEventListener('scroll', settle)
  }, [screenLock, containerRef])

  const handleToggleScreenLock = useCallback(() => {
    if (!screenLock) {
      const container = containerRef.current
      if (container) {
        // An `m` + digit jump may still be animating; align to the screen it is heading to instead of
        // the intermediate offset. Otherwise toggling ON from an arbitrary offset aligns to the
        // nearest screen deterministically.
        const activeIndex = resolveScreenLockAlignmentScreenIndex(container, container.scrollTop, {
          intent: pendingScreenNavigationRef.current,
          nowMs: Date.now(),
        })
        pendingScreenNavigationRef.current = null
        activeScreenIndexRef.current = activeIndex
        alignLockedWorkspace(activeIndex)
      }
    }
    setScreenLock((prev) => !prev)
  }, [alignLockedWorkspace, containerRef, screenLock])

  const workspaceExtentHeight = resolveWorkspaceScreenExtentHeight(workspaceViewportHeight)

  const visiblePanels = useMemo(
    () =>
      workspace.activePanels
        .map((id) => resolvePanelInstance(id))
        .filter((panel): panel is NonNullable<typeof panel> => panel !== null),
    [workspace.activePanels],
  )

  const handleLayoutChange = useCallback(
    (_layout: Layout, layouts: ResponsiveLayouts) => {
      setWorkspaces((prev) => {
        // Late event from the workspace the grid rendered for; never write it elsewhere.
        if (prev.activeWorkspaceId !== activeWorkspaceId) return prev
        return updateWorkspaceState(prev, activeWorkspaceId, (state) => {
          const nextLg = layouts.lg ?? []
          if (lgLayoutEqual(state.layouts.lg, nextLg)) return state
          return { ...state, layouts }
        })
      })
    },
    [activeWorkspaceId],
  )

  const persistLayoutInteraction = useCallback(
    (layout: Layout, workspaceId: string) => {
      setWorkspaces((prev) => {
        if (prev.activeWorkspaceId !== workspaceId) return prev
        const bp = breakpointFromWidth(width)
        const next = updateWorkspaceState(prev, workspaceId, (state) => ({
          ...state,
          layouts: { ...state.layouts, [bp]: layout },
        }))
        if (next === prev) return prev
        saveWorkspaces(next)
        return next
      })
    },
    [width],
  )

  const bringToFront = useCallback(
    (panelId: string) => {
      setFocusOrderByWorkspace((prev) => {
        const current = prev[activeWorkspaceId] ?? EMPTY_PANEL_IDS
        const synced = reconcileStackOrder(current, workspace.activePanels)
        return {
          ...prev,
          [activeWorkspaceId]: [...synced.filter((id) => id !== panelId), panelId],
        }
      })
    },
    [activeWorkspaceId, workspace.activePanels],
  )

  const handleDragStart = useCallback(
    (_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      // Capture the workspace at interaction start; only its stop handler may write.
      interactionWorkspaceIdRef.current = activeWorkspaceIdRef.current
      if (newItem?.i) bringToFront(newItem.i)
    },
    [bringToFront],
  )

  const handleDragStop = useCallback(
    (layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem?.i) bringToFront(newItem.i)
      persistLayoutInteraction(layout, interactionWorkspaceIdRef.current)
    },
    [bringToFront, persistLayoutInteraction],
  )

  const handleResizeStart = useCallback(
    (_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      interactionWorkspaceIdRef.current = activeWorkspaceIdRef.current
      if (newItem?.i) bringToFront(newItem.i)
    },
    [bringToFront],
  )

  const handleResizeStop = useCallback(
    (layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem?.i) bringToFront(newItem.i)
      persistLayoutInteraction(layout, interactionWorkspaceIdRef.current)
    },
    [bringToFront, persistLayoutInteraction],
  )

  const panelZIndex = useCallback(
    (panelId: string) => {
      const index = stackOrder.indexOf(panelId)
      return index === -1 ? 1 : index + 1
    },
    [stackOrder],
  )

  const handleAddPanel = useCallback((templateId: string) => {
    setWorkspaces((prev) => {
      const next = updateWorkspaceState(
        prev,
        prev.activeWorkspaceId,
        (state) => appendPanel(state, templateId) ?? state,
      )
      if (next === prev) return prev
      saveWorkspaces(next)
      return next
    })
  }, [])

  const handleRemovePanel = useCallback((panelId: string) => {
    setWorkspaces((prev) => {
      const next = updateWorkspaceState(
        prev,
        prev.activeWorkspaceId,
        (state) => removePanel(state, panelId) ?? state,
      )
      if (next === prev) return prev
      saveWorkspaces(next)
      return next
    })
  }, [])

  const handleSelectWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces((prev) =>
      saveWorkspaceChangeOrKeepPrevious(prev, selectWorkspace(prev, workspaceId)),
    )
  }, [])

  const handleCreateWorkspace = useCallback(() => {
    setWorkspaces((prev) => saveWorkspaceChangeOrKeepPrevious(prev, createWorkspace(prev)))
  }, [])

  const handleThemeChange = useCallback((next: Theme) => {
    setTheme(next)
  }, [])

  useEffect(() => {
    const sequence = createScreenNavigationSequenceHandler()
    const onKeyDown = (event: KeyboardEvent) => {
      const screenIndex = sequence.handleKeyDown(event)
      if (screenIndex === null) return

      const container = containerRef.current
      if (!container) return

      if (screenLock) {
        // Screen Lock ON: jump to the exact screen top with no animation and hold it there.
        event.preventDefault()
        activeScreenIndexRef.current = screenIndex
        pendingScreenNavigationRef.current = null
        alignLockedWorkspace(screenIndex)
        return
      }

      if (resolveWorkspaceScreenScrollTop(container, screenIndex) === null) return

      event.preventDefault()
      // Record the requested screen in both modes: the smooth scroll takes ~300-500 ms, and toggling
      // Screen Lock ON in that window must align to the intended screen, not the intermediate offset.
      activeScreenIndexRef.current = screenIndex
      pendingScreenNavigationRef.current = createWorkspaceScreenNavigationIntent(
        screenIndex,
        Date.now(),
      )
      scrollToWorkspaceScreenAtIndex(container, screenIndex)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      sequence.dispose()
    }
  }, [alignLockedWorkspace, containerRef, screenLock])

  return (
    <ParquetDataProvider>
    <WidgetSettingsProvider>
    <WorkspaceScopeProvider workspaceId={activeWorkspaceId}>
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2 md:flex-nowrap">
        <div className="flex min-w-0 grow shrink basis-auto items-center gap-2 pl-[5ch]">
          <img
            className="block h-7 w-7 shrink-0"
            src="/favicon.png"
            alt=""
            width={28}
            height={28}
          />
          <h1 className="m-0 shrink-0 text-[0.95rem] font-semibold tracking-wide text-muted-foreground">
            0xDeck
          </h1>
          <WorkspaceSwitcher
            workspaceIds={workspaces.workspaces.map((entry) => entry.id)}
            activeWorkspaceId={activeWorkspaceId}
            onSelect={handleSelectWorkspace}
            onCreate={handleCreateWorkspace}
          />
        </div>

        <div className="ml-auto flex min-w-0 shrink flex-wrap items-center justify-end gap-2 md:shrink-0">
          <ThemeSelect value={theme} onChange={handleThemeChange} />
          <WidgetSelect panelCount={visiblePanels.length} onAdd={handleAddPanel} />
          <DataSourceDialog />
          <Button
            type="button"
            size="sm"
            variant={screenLock ? 'default' : 'outline'}
            aria-pressed={screenLock}
            aria-label={SCREEN_LOCK_LABELS[screenLock ? 'on' : 'off']}
            title={SCREEN_LOCK_LABELS[screenLock ? 'on' : 'off']}
            onClick={handleToggleScreenLock}
          >
            {screenLock ? (
              <LockIcon data-icon="inline-start" />
            ) : (
              <LockOpenIcon data-icon="inline-start" />
            )}
            Screen Lock
            <span className="font-semibold">{screenLock ? 'ON' : 'OFF'}</span>
          </Button>
        </div>
      </header>

      <main ref={containerRef} className="workspace-scroller min-h-0 flex-1 overflow-auto p-1.5">
        <div
          className="workspace-screens"
          style={workspaceExtentHeight > 0 ? { minHeight: workspaceExtentHeight } : undefined}
        >
          {mounted && width > 0 && visiblePanels.length > 0 && (
            <ResponsiveGridLayout
              // Remounting per workspace discards in-flight drag/resize state of the previous one.
              key={activeWorkspaceId}
              layouts={workspace.layouts}
              width={width}
              breakpoints={BREAKPOINTS}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              margin={[8, 8]}
              compactor={OVERLAP_COMPACTOR}
              dragConfig={{
                enabled: true,
                handle: '.panel-drag-handle',
                cancel: '.panel-close, .panel-controls',
              }}
              resizeConfig={{ enabled: true, handles: RESIZE_HANDLES }}
              onLayoutChange={handleLayoutChange}
              onDragStart={handleDragStart}
              onDragStop={handleDragStop}
              onResizeStart={handleResizeStart}
              onResizeStop={handleResizeStop}
            >
              {visiblePanels.map((panel) => {
                const definition = getWidgetDefinitionForInstance(panel.id)
                if (!definition) return null

                return (
                <Card
                  key={panel.id}
                  size="sm"
                  className="group/panel h-full gap-0 py-0"
                  style={{ zIndex: panelZIndex(panel.id) }}
                >
                  <CardHeader
                    className="panel-drag-handle !flex cursor-grab items-center gap-1.5 px-2 pb-1 pt-1.5 active:cursor-grabbing"
                  >
                    {!definition.hideHeaderTitle && (
                      <CardTitle className="min-w-0 max-w-[30%] shrink truncate text-xs font-semibold">
                        {panelDisplayTitle(panel, visiblePanels)}
                      </CardTitle>
                    )}
                    {widgetHasHeaderControls(definition) && (
                      <MemoPanelHeaderControls panelId={panel.id} />
                    )}
                    <CardAction className="!col-start-auto !row-span-1 !row-start-auto ml-auto shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="panel-close cursor-pointer shrink-0 opacity-0 transition-opacity group-hover/panel:opacity-100"
                        aria-label={`${panel.title} panelini kapat`}
                        onClick={() => handleRemovePanel(panel.id)}
                      >
                        <XIcon />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="panel-body min-h-0 flex-1 overflow-auto px-2 pb-2 pt-0">
                    <PanelWidgetBody
                      component={definition.component}
                      panelId={panel.id}
                      headerSettings={definition.headerSettings}
                    />
                  </CardContent>
                </Card>
                )
              })}
            </ResponsiveGridLayout>
          )}

          {mounted && visiblePanels.length === 0 && (
            <p className="mx-auto my-8 text-center text-sm text-muted-foreground">
              Widget eklemek için üstteki Widgets menüsünü kullan
            </p>
          )}
        </div>
      </main>
    </div>
    </WorkspaceScopeProvider>
    </WidgetSettingsProvider>
    </ParquetDataProvider>
  )
}

export default App
