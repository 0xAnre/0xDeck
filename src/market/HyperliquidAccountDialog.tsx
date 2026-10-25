import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  HYPERLIQUID_ACCOUNT_INVALID_MESSAGE,
  normalizeHyperliquidAccountAddress,
  type HyperliquidBtcPosition,
} from '@/market/hyperliquidAccount'

type PositionStatus = 'idle' | 'loading' | 'ready' | 'error'

type HyperliquidAccountDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  savedAddress: string | null
  position: HyperliquidBtcPosition | null
  positionStatus: PositionStatus
  positionError: string | null
  onSave: (address: string) => void
  onRemove: () => void
}

function formatNumber(value: number, maximumFractionDigits = 5): string {
  return value.toLocaleString(undefined, { maximumFractionDigits })
}

function PositionSummary({
  savedAddress,
  position,
  positionStatus,
  positionError,
}: Pick<
  HyperliquidAccountDialogProps,
  'savedAddress' | 'position' | 'positionStatus' | 'positionError'
>) {
  if (!savedAddress) {
    return (
      <p className="text-xs text-muted-foreground">
        No account configured. Add a read-only address to show entry and close markers.
      </p>
    )
  }
  if (positionStatus === 'loading') {
    return <p className="text-xs text-muted-foreground">Loading BTC position…</p>
  }
  if (positionStatus === 'error') {
    return (
      <p role="alert" className="text-xs text-destructive">
        {positionError ?? 'Could not load the BTC position'}
      </p>
    )
  }
  if (!position) {
    return <p className="text-xs text-muted-foreground">No BTC position</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
      <Badge variant="secondary">
        <span className={position.side === 'long' ? 'text-long' : 'text-short'}>
          {position.side === 'long' ? 'Long' : 'Short'}
        </span>
      </Badge>
      <span className="text-foreground">{formatNumber(position.size)} BTC</span>
      <span className="text-muted-foreground">
        Avg entry{' '}
        <span className="text-foreground">
          {position.entry_price === null ? '—' : formatNumber(position.entry_price, 2)}
        </span>
      </span>
    </div>
  )
}

export function HyperliquidAccountDialog({
  open,
  onOpenChange,
  savedAddress,
  position,
  positionStatus,
  positionError,
  onSave,
  onRemove,
}: HyperliquidAccountDialogProps) {
  const [input, setInput] = useState(savedAddress ?? '')
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    const normalized = normalizeHyperliquidAccountAddress(input)
    if (normalized === null) {
      setError(HYPERLIQUID_ACCOUNT_INVALID_MESSAGE)
      return
    }
    setError(null)
    onSave(normalized)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hyperliquid account</DialogTitle>
          <DialogDescription>
            Read-only address. No wallet connection, signature, API key, or trading
            permission is used.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor="hyperliquid-account-address">Address</FieldLabel>
            <Input
              id="hyperliquid-account-address"
              aria-label="Hyperliquid account address"
              aria-invalid={error !== null}
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                if (error !== null) setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSave()
                }
              }}
            />
            {error !== null ? (
              <FieldError>{error}</FieldError>
            ) : (
              <FieldDescription>
                Workspace-wide setting, stored locally. Only visible on Hyperliquid BTC perp
                charts.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>

        <Separator />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Current BTC position
          </span>
          <PositionSummary
            savedAddress={savedAddress}
            position={position}
            positionStatus={positionStatus}
            positionError={positionError}
          />
        </div>

        <DialogFooter>
          {savedAddress && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setInput('')
                setError(null)
                onRemove()
              }}
            >
              Remove
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} id="hyperliquid-account-save">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
