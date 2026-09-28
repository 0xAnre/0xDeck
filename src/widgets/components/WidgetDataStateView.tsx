import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { WidgetDataNotReadyState } from '@/widgets/data/types'

type WidgetDataStateViewProps = {
  state: WidgetDataNotReadyState
  loadingFallback?: ReactNode
  className?: string
}

type StatusCopy = {
  title: string
  description: string
  destructive?: boolean
}

function statusCopy(state: WidgetDataNotReadyState): StatusCopy | null {
  switch (state.status) {
    case 'loading':
      return null
    case 'offline':
      return {
        title: 'Backend unavailable',
        description: 'The data API is not reachable. Start the backend and refresh the page.',
      }
    case 'no-folder':
      return {
        title: 'No data folder',
        description: 'Choose a Parquet folder in Data source to load datasets.',
      }
    case 'empty':
      return {
        title: 'No datasets',
        description: 'The selected folder has no usable datasets yet.',
      }
    case 'error':
      return {
        title: 'Could not load data',
        description: state.message,
        destructive: true,
      }
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

export function WidgetDataStateView({
  state,
  loadingFallback,
  className,
}: WidgetDataStateViewProps) {
  if (state.status === 'loading') {
    return (
      <div className={cn('min-h-0 flex-1', className)}>
        {loadingFallback ?? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="min-h-16 w-full flex-1" />
          </div>
        )}
      </div>
    )
  }

  const copy = statusCopy(state)
  if (!copy) return null

  return (
    <div
      className={cn(
        'flex min-h-16 flex-col justify-center gap-1 rounded-md px-1 py-2',
        className,
      )}
    >
      <p
        className={cn(
          'text-xs font-medium',
          copy.destructive ? 'text-destructive' : 'text-foreground',
        )}
      >
        {copy.title}
      </p>
      <p className="text-xs text-muted-foreground">{copy.description}</p>
    </div>
  )
}
