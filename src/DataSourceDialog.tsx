import { useEffect, useState } from 'react'
import { DatabaseIcon } from 'lucide-react'
import { fetchRegistry, fetchSettings, saveSettings } from '@/api/client'
import type { DatasetRegistryItem } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCellValue } from '@/lib/formatCellValue'
import { cn } from '@/lib/utils'

const inputClassName =
  'h-8 w-full rounded-md border border-input bg-input/20 px-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30'

export function DataSourceDialog() {
  const [open, setOpen] = useState(false)
  const [parquetFolder, setParquetFolder] = useState('')
  const [folderReady, setFolderReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [registry, setRegistry] = useState<DatasetRegistryItem[]>([])
  const [selectedRegistryName, setSelectedRegistryName] = useState('')
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setSavedMessage(null)

    void fetchSettings()
      .then((settings) => {
        if (!cancelled) {
          setParquetFolder(settings.parquet_folder)
          setFolderReady(settings.folder_ready)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Backend unavailable')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const loadRegistry = async () => {
    setRegistryLoading(true)
    setRegistryError(null)

    try {
      const response = await fetchRegistry()
      setRegistry(response.registry)
      setSelectedRegistryName((current) => current || (response.registry[0]?.name ?? ''))
      return response.registry.length
    } catch (registryLoadError) {
      setRegistryError(
        registryLoadError instanceof Error ? registryLoadError.message : 'Failed to load registry',
      )
      return null
    } finally {
      setRegistryLoading(false)
    }
  }

  const handleSaveFolder = async () => {
    setLoading(true)
    setError(null)
    setSavedMessage(null)

    try {
      const settings = await saveSettings(parquetFolder.trim())
      setParquetFolder(settings.parquet_folder)
      setFolderReady(settings.folder_ready)
      window.dispatchEvent(new CustomEvent('parquet-settings-changed'))

      const count = await loadRegistry()
      if (count === null) {
        setSavedMessage('Folder saved — registry refresh failed')
      } else if (count === 0) {
        setSavedMessage('Folder saved — no datasets found')
      } else {
        setSavedMessage(`Folder saved — ${count} dataset${count === 1 ? '' : 's'} ready`)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save folder')
    } finally {
      setLoading(false)
    }
  }

  const selectedRegistry =
    registry.find((item) => item.name === selectedRegistryName) ?? registry[0] ?? null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Data source">
          <DatabaseIcon data-icon="inline-start" />
          Data source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Data source</DialogTitle>
          <DialogDescription>Local Parquet folder for widgets.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="folder" className="min-h-0" id="data-source-tabs">
          <TabsList variant="line" className="h-8 justify-start">
            <TabsTrigger value="folder">Folder</TabsTrigger>
            <TabsTrigger
              value="registry"
              onClick={() => {
                if (registry.length === 0) void loadRegistry()
              }}
            >
              Registry
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folder" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="parquet-folder" className="text-muted-foreground">
                Parquet folder
              </label>
              <input
                id="parquet-folder"
                type="text"
                value={parquetFolder}
                onChange={(event) => setParquetFolder(event.target.value)}
                className={inputClassName}
                placeholder="/path/to/parquet"
                spellCheck={false}
              />
              <p className="text-muted-foreground">
                Status:{' '}
                <span className={cn(folderReady ? 'text-up' : 'text-muted-foreground')}>
                  {folderReady ? 'connected' : 'not set'}
                </span>
              </p>
              <Button
                type="button"
                size="sm"
                disabled={loading || parquetFolder.trim().length === 0}
                onClick={() => void handleSaveFolder()}
              >
                Save folder
              </Button>
            </div>

            {error && <p className="text-destructive">{error}</p>}
            {savedMessage && <p className="text-up">{savedMessage}</p>}
            <p className="text-muted-foreground">
              Sample: <code>data/sample</code> after running the backend seed script.
            </p>
          </TabsContent>

          <TabsContent value="registry" className="min-h-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Streams, schemas, suggested columns, and sample rows.
              </p>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={registryLoading}
                onClick={() => void loadRegistry()}
              >
                Reload
              </Button>
            </div>

            {registryError && <p className="text-xs text-destructive">{registryError}</p>}
            {registryLoading && <p className="text-xs text-muted-foreground">Loading registry…</p>}

            {!registryLoading && registry.length > 0 && selectedRegistry && (
              <div className="grid min-h-0 gap-3 md:grid-cols-[13rem_1fr]">
                <div className="max-h-96 overflow-auto rounded-md ring-1 ring-border/60">
                  {registry.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-2 py-2 text-left hover:bg-muted/60',
                        item.name === selectedRegistry.name && 'bg-muted/50',
                      )}
                      onClick={() => setSelectedRegistryName(item.name)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{item.name}</span>
                        <span className="block text-[0.65rem] text-muted-foreground">
                          {item.schema.length} cols
                        </span>
                      </span>
                      <Badge variant="outline">{item.file_count.toLocaleString()}</Badge>
                    </button>
                  ))}
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{selectedRegistry.kind}</Badge>
                    <Badge variant="outline">{selectedRegistry.file_count.toLocaleString()} files</Badge>
                    {selectedRegistry.suggested.x_column && (
                      <Badge variant="outline">
                        x: {selectedRegistry.suggested.x_column}
                      </Badge>
                    )}
                    {selectedRegistry.suggested.y_column && (
                      <Badge variant="outline">
                        y: {selectedRegistry.suggested.y_column}
                      </Badge>
                    )}
                  </div>

                  <div className="mb-3 max-h-40 overflow-auto rounded-md ring-1 ring-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Column</TableHead>
                          <TableHead>Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedRegistry.schema.map((column) => (
                          <TableRow key={column.name} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{column.name}</TableCell>
                            <TableCell className="text-muted-foreground">{column.type}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="max-h-48 overflow-auto rounded-md ring-1 ring-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          {selectedRegistry.preview.columns.map((column) => (
                            <TableHead key={column}>{column}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedRegistry.preview.rows.map((row, rowIndex) => (
                          <TableRow key={`${selectedRegistry.name}-${rowIndex}`} className="hover:bg-muted/30">
                            {row.map((cell, cellIndex) => (
                              <TableCell key={`${rowIndex}-${cellIndex}`} className="tabular-nums">
                                {formatCellValue(cell, {
                                  column: selectedRegistry.preview.columns[cellIndex] ?? '',
                                })}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
