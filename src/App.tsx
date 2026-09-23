import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveGridLayout,
  getCompactor,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout'
import { XIcon } from 'lucide-react'
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
import { PanelContent } from './PanelContent'
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
import { panelDisplayTitle, resolvePanelInstance, isConfigurablePanelKind } from './panels'
import { ParquetDataProvider } from './context/ParquetDataContext'
import { WidgetSettingsProvider } from './context/WidgetSettingsContext'
import { DataSourceDialog } from './DataSourceDialog'
import { ThemeSelect } from './ThemeSelect'
import { WidgetSelect } from './WidgetSelect'
import { applyTheme, loadTheme, saveTheme, type Theme } from './themeStorage'

const RESIZE_HANDLES = ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] as const
const OVERLAP_COMPACTOR = getCompactor(null, true)

function App() {
  const { width, containerRef, mounted } = useContainerWidth()
  const [workspace, setWorkspace] = useState<WorkspaceState>(loadWorkspace)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [stackOrder, setStackOrder] = useState<string[]>(
    () => loadWorkspace().activePanels,
  )

  useEffect(() => {
    setStackOrder((prev) => {
      const kept = prev.filter((id) => workspace.activePanels.includes(id))
      const added = workspace.activePanels.filter((id) => !kept.includes(id))
      return [...kept, ...added]
    })
  }, [workspace.activePanels])

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

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

  const bringToFront = useCallback((panelId: string) => {
    setStackOrder((prev) => [...prev.filter((id) => id !== panelId), panelId])
  }, [])

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
        </div>
      </header>

      <main ref={containerRef} className="min-h-0 flex-1 overflow-auto p-1.5">
        {mounted && width > 0 && visiblePanels.length > 0 && (
          <ResponsiveGridLayout
            layouts={workspace.layouts}
            width={width}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            rowHeight={ROW_HEIGHT}
            margin={[8, 8]}
            compactor={OVERLAP_COMPACTOR}
            dragConfig={{ enabled: true, cancel: '.panel-close, .panel-controls' }}
            resizeConfig={{ enabled: true, handles: RESIZE_HANDLES }}
            onLayoutChange={handleLayoutChange}
            onDragStart={handleDragStart}
            onDragStop={handleDragStop}
            onResizeStart={handleResizeStart}
            onResizeStop={handleResizeStop}
          >
            {visiblePanels.map((panel) => (
              <Card
                key={panel.id}
                size="sm"
                className="group/panel h-full cursor-grab gap-0 py-0 active:cursor-grabbing"
                style={{ zIndex: panelZIndex(panel.id) }}
              >
                <CardHeader className="pointer-events-none !flex items-center gap-1.5 px-2 pb-1 pt-1.5">
                  <CardTitle className="pointer-events-auto min-w-0 max-w-[30%] shrink truncate text-xs font-semibold">
                    {panelDisplayTitle(panel, visiblePanels)}
                  </CardTitle>
                  {isConfigurablePanelKind(panel.kind) && (
                    <PanelHeaderControls panelId={panel.id} />
                  )}
                  <CardAction className="pointer-events-auto !col-start-auto !row-span-1 !row-start-auto ml-auto shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="panel-close shrink-0 opacity-0 transition-opacity group-hover/panel:opacity-100"
                      aria-label={`${panel.title} panelini kapat`}
                      onClick={() => handleRemovePanel(panel.id)}
                    >
                      <XIcon />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="panel-body min-h-0 flex-1 overflow-auto px-2 pb-2 pt-0">
                  <PanelContent panelId={panel.id} kind={panel.kind} />
                </CardContent>
              </Card>
            ))}
          </ResponsiveGridLayout>
        )}

        {mounted && visiblePanels.length === 0 && (
          <p className="mx-auto my-8 text-center text-sm text-muted-foreground">
            Widget eklemek için üstteki Widgets menüsünü kullan
          </p>
        )}
      </main>
    </div>
    </WidgetSettingsProvider>
    </ParquetDataProvider>
  )
}

export default App
