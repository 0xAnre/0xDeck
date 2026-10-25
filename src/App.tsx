import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  appendPanel,
  lgLayoutEqual,
  loadWorkspace,
  removePanel,
  saveWorkspace,
  type WorkspaceState,
} from './layoutStorage'
import { panelDisplayTitle, resolvePanelInstance } from './panels'
import {
  getWidgetDefinitionForInstance,
  widgetHasHeaderControls,
} from '@/widgets/registry'
import { ParquetDataProvider } from './context/ParquetDataContext'
import { WidgetSettingsProvider } from './context/WidgetSettingsContext'
import { DataSourceDialog } from './DataSourceDialog'
import { ThemeSelect } from './ThemeSelect'
import { WidgetSelect } from './WidgetSelect'
import { applyTheme, loadTheme, saveTheme, type Theme } from './themeStorage'
import {
  createScreenNavigationSequenceHandler,
  resolveLockedWorkspaceScreenScrollTop,
  resolveNearestWorkspaceScreenIndex,
  resolveWorkspaceScreenExtentHeight,
  resolveWorkspaceScreenScrollTop,
  scrollToWorkspaceScreenAtIndex,
} from './screenNavigationShortcuts'

/** Sub-pixel scroll offsets are treated as aligned so Screen Lock never fights the browser. */
const WORKSPACE_LOCK_ALIGNMENT_TOLERANCE_PX = 0.5

const SCREEN_LOCK_LABELS = {
  off: 'Ekran kilidi kapalı — serbest kaydırma. Etkin ekrana kilitlemek için tıkla',
  on: 'Ekran kilidi açık — çalışma alanı etkin ekrana sabitlendi. Kilidi açmak için tıkla',
} as const

const RESIZE_HANDLES = ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] as const
const OVERLAP_COMPACTOR = getCompactor(null, true)

function reconcileStackOrder(previous: string[], activePanels: string[]): string[] {
  const kept = previous.filter((id) => activePanels.includes(id))
  const added = activePanels.filter((id) => !kept.includes(id))
  return [...kept, ...added]
}

function App() {
  const { width, containerRef, mounted } = useContainerWidth()
  const [workspace, setWorkspace] = useState<WorkspaceState>(loadWorkspace)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [screenLock, setScreenLock] = useState(false)
  const [workspaceViewportHeight, setWorkspaceViewportHeight] = useState(0)
  const activeScreenIndexRef = useRef(0)
  const lockedScrollTopRef = useRef(0)
  const [focusOrder, setFocusOrder] = useState<string[]>(
    () => loadWorkspace().activePanels,
  )
  const stackOrder = useMemo(
    () => reconcileStackOrder(focusOrder, workspace.activePanels),
    [focusOrder, workspace.activePanels],
  )

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  // Viewport height of the workspace scroller drives the virtual 9-screen scroll extent and the
  // Screen Lock alignment. Observing it keeps both correct on window/viewport resize.
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    const measure = () => setWorkspaceViewportHeight(container.clientHeight)
    measure()
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
        // Toggling ON from an arbitrary offset aligns to the nearest screen deterministically.
        const nearestIndex = resolveNearestWorkspaceScreenIndex(container, container.scrollTop)
        activeScreenIndexRef.current = nearestIndex
        alignLockedWorkspace(nearestIndex)
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
      setWorkspace((prev) => {
        const nextLg = layouts.lg ?? []
        if (lgLayoutEqual(prev.layouts.lg, nextLg)) return prev
        return { ...prev, layouts }
      })
    },
    [],
  )

  const persistLayoutInteraction = useCallback(
    (layout: Layout) => {
      setWorkspace((prev) => {
        const bp = breakpointFromWidth(width)
        const next: WorkspaceState = {
          ...prev,
          layouts: { ...prev.layouts, [bp]: layout },
        }
        saveWorkspace(next)
        return next
      })
    },
    [width],
  )

  const bringToFront = useCallback(
    (panelId: string) => {
      setFocusOrder((prev) => {
        const synced = reconcileStackOrder(prev, workspace.activePanels)
        return [...synced.filter((id) => id !== panelId), panelId]
      })
    },
    [workspace.activePanels],
  )

  const handleDragStart = useCallback(
    (_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem?.i) bringToFront(newItem.i)
    },
    [bringToFront],
  )

  const handleDragStop = useCallback(
    (layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem?.i) bringToFront(newItem.i)
      persistLayoutInteraction(layout)
    },
    [bringToFront, persistLayoutInteraction],
  )

  const handleResizeStart = useCallback(
    (_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem?.i) bringToFront(newItem.i)
    },
    [bringToFront],
  )

  const handleResizeStop = useCallback(
    (layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (newItem?.i) bringToFront(newItem.i)
      persistLayoutInteraction(layout)
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
    setWorkspace((prev) => {
      const next = appendPanel(prev, templateId)
      if (!next) return prev
      saveWorkspace(next)
      return next
    })
  }, [])

  const handleRemovePanel = useCallback((panelId: string) => {
    setWorkspace((prev) => {
      const next = removePanel(prev, panelId)
      if (!next) return prev
      saveWorkspace(next)
      return next
    })
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
        alignLockedWorkspace(screenIndex)
        return
      }

      if (resolveWorkspaceScreenScrollTop(container, screenIndex) === null) return

      event.preventDefault()
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
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 px-3 py-2">
        <div className="flex items-center gap-2 pl-[5ch]">
          <img
            className="block h-7 w-7 shrink-0"
            src="/favicon.png"
            alt=""
            width={28}
            height={28}
          />
          <h1 className="m-0 text-[0.95rem] font-semibold tracking-wide text-muted-foreground">
            0xDeck
          </h1>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
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

                const WidgetBody = definition.component

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
                    <CardTitle className="min-w-0 max-w-[30%] shrink truncate text-xs font-semibold">
                      {panelDisplayTitle(panel, visiblePanels)}
                    </CardTitle>
                    {widgetHasHeaderControls(definition) && (
                      <PanelHeaderControls panelId={panel.id} />
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
                    <WidgetBody
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
    </WidgetSettingsProvider>
    </ParquetDataProvider>
  )
}

export default App
