import { FileTextIcon, FolderOpenIcon, PlusIcon, TrashIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
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
  updateNoteContent,
  type NotesWorkspace,
} from './notesStorage'

const markdownClassName =
  'flex flex-col gap-2 text-xs leading-relaxed [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:font-medium [&_li]:ml-4 [&_ol]:list-decimal [&_p]:text-muted-foreground [&_strong]:text-foreground [&_table]:w-full [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_thead]:border-b [&_tr]:border-b [&_ul]:list-disc'

export function NotesPanel() {
  const [workspace, setWorkspace] = useState<NotesWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'edit' | 'preview'>('edit')

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
  }

  const handleCloseTab = (fileId: string) => {
    if (!workspace || !canCloseTabs) return
    persist(closeNoteTab(workspace, fileId))
  }

  const handleOpenNote = (fileId: string) => {
    if (!workspace) return
    persist(openNoteTab(workspace, fileId))
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon-xs" aria-label="Open note">
              <FolderOpenIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuGroup>
              {workspace.files.map((file) => (
                <DropdownMenuItem key={file.id} onSelect={() => handleOpenNote(file.id)}>
                  <FileTextIcon data-icon="inline-start" />
                  <span className="truncate">
                    {getNoteTitle(workspace.contents[file.id] ?? '', file.name)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
