import { PlusIcon, SearchIcon, TrashIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  closeNoteTab,
  createNoteFile,
  canDeleteNote,
  deleteNoteFile,
  getNoteTitle,
  getOpenFiles,
  loadNotesWorkspace,
  openNoteTab,
  saveNotesWorkspace,
  searchNotes,
  updateNoteContent,
  type NotesWorkspace,
} from './notesStorage'

const markdownClassName =
  'flex flex-col gap-2 text-xs leading-relaxed [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:font-medium [&_li]:ml-4 [&_ol]:list-decimal [&_p]:text-muted-foreground [&_strong]:text-foreground [&_table]:w-full [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_thead]:border-b [&_tr]:border-b [&_ul]:list-disc'

const searchInputClassName =
  'h-7 w-full rounded-md border border-input bg-input/20 px-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30'

export function NotesPanel() {
  const [workspace, setWorkspace] = useState<NotesWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [searchQuery, setSearchQuery] = useState('')

  const persist = useCallback((next: NotesWorkspace) => {
    setWorkspace(next)
    saveNotesWorkspace(next)
  }, [])

  useEffect(() => {
    let cancelled = false

    void loadNotesWorkspace()
      .then((loaded) => {
        if (!cancelled) {
          setWorkspace(loaded)
          setLoading(false)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load notes')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const searchResults = useMemo(
    () => (workspace ? searchNotes(workspace, searchQuery) : []),
    [workspace, searchQuery],
  )

  const openFiles = workspace ? getOpenFiles(workspace) : []
  const canCloseTabs = openFiles.length > 1

  const handleTabChange = (nextId: string) => {
    if (!workspace || nextId === workspace.activeId) return
    persist({ ...workspace, activeId: nextId })
  }

  const handleContentChange = (value: string) => {
    if (!workspace) return
    persist(updateNoteContent(workspace, workspace.activeId, value))
  }

  const handleCreateNote = () => {
    if (!workspace) return
    const { file, content } = createNoteFile(workspace.files)
    persist({
      files: [...workspace.files, file],
      contents: { ...workspace.contents, [file.id]: content },
      openIds: [...workspace.openIds, file.id],
      activeId: file.id,
    })
    setSearchQuery('')
  }

  const handleCloseTab = (fileId: string) => {
    if (!workspace || !canCloseTabs) return
    persist(closeNoteTab(workspace, fileId))
  }

  const handleOpenFromSearch = (fileId: string) => {
    if (!workspace) return
    persist(openNoteTab(workspace, fileId))
    setSearchQuery('')
  }

  const handleDeleteNote = () => {
    if (!workspace) return
    const next = deleteNoteFile(workspace, workspace.activeId)
    if (next) persist(next)
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-2">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="min-h-24 flex-1" />
      </div>
    )
  }

  if (error || !workspace) {
    return <p className="text-xs text-destructive">{error ?? 'Failed to load notes'}</p>
  }

  const activeContent = workspace.contents[workspace.activeId] ?? ''
  const activeFile = workspace.files.find((file) => file.id === workspace.activeId)
  const canDeleteActive = activeFile ? canDeleteNote(activeFile) : false

  return (
    <Tabs
      value={workspace.activeId}
      onValueChange={handleTabChange}
      className="flex h-full min-h-0 flex-col gap-2"
    >
      <div className="relative shrink-0">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className={cn(searchInputClassName, 'pl-7')}
          placeholder="Search all notes…"
          aria-label="Search notes"
        />
        {searchQuery.trim().length > 0 && (
          <div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-40 overflow-auto rounded-md border border-border bg-popover p-1 shadow-sm">
            {searchResults.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches</p>
            ) : (
              searchResults.map((result) => (
                <button
                  key={result.file.id}
                  type="button"
                  className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => handleOpenFromSearch(result.file.id)}
                >
                  <span className="text-xs font-medium">{result.title}</span>
                  <span className="truncate text-[0.65rem] text-muted-foreground">
                    {result.isOpen ? 'Open · ' : 'Closed · '}
                    {result.snippet}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <TabsList variant="line" className="h-auto min-w-0 flex-1 justify-start overflow-x-auto">
          {openFiles.map((file) => {
            const title = getNoteTitle(workspace.contents[file.id] ?? '', file.name)
            return (
              <TabsTrigger
                key={file.id}
                value={file.id}
                className="group shrink-0 gap-1 pr-1 text-xs"
              >
                <span className="max-w-28 truncate">{title}</span>
                {canCloseTabs && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Close ${title}`}
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleCloseTab(file.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        handleCloseTab(file.id)
                      }
                    }}
                  >
                    <XIcon />
                  </span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
        <Button type="button" variant="outline" size="xs" onClick={handleCreateNote}>
          <PlusIcon data-icon="inline-start" />
          New
        </Button>
        <Button
          type="button"
          variant={view === 'edit' ? 'secondary' : 'ghost'}
          size="xs"
          onClick={() => setView('edit')}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant={view === 'preview' ? 'secondary' : 'ghost'}
          size="xs"
          onClick={() => setView('preview')}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="xs"
          disabled={!canDeleteActive}
          onClick={handleDeleteNote}
          aria-label="Delete note"
        >
          <TrashIcon data-icon="inline-start" />
          Delete
        </Button>
      </div>

      {view === 'edit' ? (
        <Textarea
          value={activeContent}
          onChange={(event) => handleContentChange(event.target.value)}
          className="min-h-24 flex-1 font-mono text-xs"
          placeholder="# Title&#10;&#10;Write markdown…"
          spellCheck={false}
        />
      ) : (
        <div className="min-h-24 flex-1 overflow-auto">
          <div className={markdownClassName}>
            <Markdown>{activeContent}</Markdown>
          </div>
        </div>
      )}
    </Tabs>
  )
}
