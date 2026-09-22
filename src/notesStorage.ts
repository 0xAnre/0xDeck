export const NOTES_STORAGE_KEY = '0xdeck-notes'

export type NoteSource = 'bundled' | 'local'

export type NoteFile = {
  id: string
  name: string
  source: NoteSource
  path?: string
}

export type NotesWorkspace = {
  files: NoteFile[]
  contents: Record<string, string>
  activeId: string
  openIds: string[]
}

export type NoteSearchResult = {
  file: NoteFile
  title: string
  snippet: string
  isOpen: boolean
}

export const SEED_NOTES: NoteFile[] = [
  { id: 'daily', name: 'daily.md', source: 'bundled', path: '/notes/daily.md' },
  { id: 'ideas', name: 'ideas.md', source: 'bundled', path: '/notes/ideas.md' },
  { id: 'trades', name: 'trades.md', source: 'bundled', path: '/notes/trades.md' },
  { id: 'research', name: 'research.md', source: 'bundled', path: '/notes/research.md' },
]

export function saveNotesWorkspace(workspace: NotesWorkspace) {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(workspace))
}

function normalizeWorkspace(saved: Partial<NotesWorkspace>): NotesWorkspace | null {
  if (!Array.isArray(saved.files) || !saved.contents || !saved.activeId) return null

  const fileIds = new Set(saved.files.map((file) => file.id))
  const openIds = (
    Array.isArray(saved.openIds)
      ? saved.openIds.filter((id) => fileIds.has(id))
      : saved.files.map((file) => file.id)
  ).filter((id, index, ids) => ids.indexOf(id) === index)

  const safeOpenIds = openIds.length > 0 ? openIds : [saved.files[0]!.id]
  const activeId = safeOpenIds.includes(saved.activeId) ? saved.activeId : safeOpenIds[0]!

  return {
    files: saved.files,
    contents: saved.contents,
    activeId,
    openIds: safeOpenIds,
  }
}

export function getOpenFiles(workspace: NotesWorkspace): NoteFile[] {
  const openSet = new Set(workspace.openIds)
  return workspace.files.filter((file) => openSet.has(file.id))
}

export function getNoteTitle(content: string, fallbackName: string): string {
  const firstLine = content.trimStart().split('\n')[0] ?? ''
  const match = firstLine.match(/^#\s+(.+)$/)
  if (match?.[1]?.trim()) return match[1].trim()
  return fallbackName.replace(/\.md$/i, '')
}

function slugifyFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'untitled'}.md`
}

function uniqueFileName(files: NoteFile[], fileId: string, desired: string): string {
  const lower = desired.toLowerCase()
  if (!files.some((file) => file.id !== fileId && file.name.toLowerCase() === lower)) {
    return desired
  }

  const base = desired.replace(/\.md$/i, '')
  let index = 2
  while (
    files.some((file) => file.id !== fileId && file.name.toLowerCase() === `${base}-${index}.md`)
  ) {
    index += 1
  }
  return `${base}-${index}.md`
}

export function updateNoteContent(
  workspace: NotesWorkspace,
  fileId: string,
  value: string,
): NotesWorkspace {
  const file = workspace.files.find((item) => item.id === fileId)
  if (!file) return workspace

  const title = getNoteTitle(value, file.name)
  const name = uniqueFileName(workspace.files, fileId, slugifyFileName(title))

  return {
    ...workspace,
    contents: { ...workspace.contents, [fileId]: value },
    files: workspace.files.map((item) =>
      item.id === fileId ? { ...item, name, source: 'local' } : item,
    ),
  }
}

export function closeNoteTab(workspace: NotesWorkspace, fileId: string): NotesWorkspace {
  if (workspace.openIds.length <= 1) return workspace
  if (!workspace.openIds.includes(fileId)) return workspace

  const openIds = workspace.openIds.filter((id) => id !== fileId)
  const activeId = workspace.activeId === fileId ? openIds[openIds.length - 1]! : workspace.activeId

  return { ...workspace, openIds, activeId }
}

export function openNoteTab(workspace: NotesWorkspace, fileId: string): NotesWorkspace {
  if (!workspace.files.some((file) => file.id === fileId)) return workspace

  const openIds = workspace.openIds.includes(fileId)
    ? workspace.openIds
    : [...workspace.openIds, fileId]

  return { ...workspace, openIds, activeId: fileId }
}

export function canDeleteNote(file: NoteFile): boolean {
  return file.source === 'local'
}

export function deleteNoteFile(workspace: NotesWorkspace, fileId: string): NotesWorkspace | null {
  const file = workspace.files.find((item) => item.id === fileId)
  if (!file || !canDeleteNote(file) || workspace.files.length <= 1) return null

  const files = workspace.files.filter((item) => item.id !== fileId)
  const contents = { ...workspace.contents }
  delete contents[fileId]

  let openIds = workspace.openIds.filter((id) => id !== fileId)
  if (openIds.length === 0) openIds = [files[0]!.id]

  const activeId =
    workspace.activeId === fileId
      ? openIds.includes(files[0]!.id)
        ? openIds[openIds.length - 1]!
        : files[0]!.id
      : workspace.activeId

  const safeActiveId = files.some((item) => item.id === activeId) ? activeId : files[0]!.id
  const safeOpenIds = openIds.filter((id) => files.some((item) => item.id === id))
  if (!safeOpenIds.includes(safeActiveId)) safeOpenIds.push(safeActiveId)

  return {
    files,
    contents,
    activeId: safeActiveId,
    openIds: safeOpenIds.length > 0 ? safeOpenIds : [safeActiveId],
  }
}

function buildSnippet(content: string, query: string): string {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return content.slice(0, 80).replace(/\s+/g, ' ')

  const lower = content.toLowerCase()
  const index = lower.indexOf(normalized)
  if (index === -1) return content.slice(0, 80).replace(/\s+/g, ' ')

  const start = Math.max(0, index - 24)
  const end = Math.min(content.length, index + normalized.length + 40)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return `${prefix}${content.slice(start, end).replace(/\s+/g, ' ')}${suffix}`
}

export function searchNotes(workspace: NotesWorkspace, query: string): NoteSearchResult[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const openSet = new Set(workspace.openIds)

  return workspace.files
    .filter((file) => {
      const content = workspace.contents[file.id] ?? ''
      return (
        file.name.toLowerCase().includes(normalized) ||
        getNoteTitle(content, file.name).toLowerCase().includes(normalized) ||
        content.toLowerCase().includes(normalized)
      )
    })
    .map((file) => ({
      file,
      title: getNoteTitle(workspace.contents[file.id] ?? '', file.name),
      snippet: buildSnippet(workspace.contents[file.id] ?? '', normalized),
      isOpen: openSet.has(file.id),
    }))
}

export async function loadNotesWorkspace(): Promise<NotesWorkspace> {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<NotesWorkspace>
      const normalized = normalizeWorkspace(saved)
      if (normalized) return normalized
    }
  } catch {
    // fall through to seed load
  }

  const contents = Object.fromEntries(
    await Promise.all(
      SEED_NOTES.map(async (note) => {
        const response = await fetch(note.path!)
        const text = response.ok ? await response.text() : ''
        return [note.id, text] as const
      }),
    ),
  )

  const workspace: NotesWorkspace = {
    files: [...SEED_NOTES],
    contents,
    activeId: SEED_NOTES[0]!.id,
    openIds: SEED_NOTES.map((note) => note.id),
  }

  saveNotesWorkspace(workspace)
  return workspace
}

export function createNoteFile(files: NoteFile[]): { file: NoteFile; content: string } {
  const count = files.filter((file) => file.name.startsWith('untitled-')).length + 1
  const name = `untitled-${count}.md`
  const file: NoteFile = {
    id: `note-${Date.now()}`,
    name,
    source: 'local',
  }
  const title = name.replace(/\.md$/, '')
  return {
    file,
    content: `# ${title}\n\n`,
  }
}
