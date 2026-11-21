import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { RotateCcwIcon, WalletMinimalIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { lighterAccountLabel, type LighterAccountSummary } from '@/market/lighterAccount'
import { fetchLighterAccounts } from '@/market/lighterAccountApi'
import {
  DEFAULT_POSITION_WALLET,
  POSITION_WALLET_EXCHANGES,
  POSITION_WALLET_EXCHANGE_LABELS,
  positionWalletAddressError,
  positionWalletShortLabel,
  setPositionWallet,
  type PositionWalletExchange,
  type PositionWalletSelection,
} from '@/market/positionWallet'
import { usePositionWallet } from '@/market/usePositionWallet'

type PositionWalletDraft = {
  exchange: PositionWalletExchange
  address: string
  accountIndex: number | null
}

function draftForSelection(selection: PositionWalletSelection): PositionWalletDraft {
  return {
    exchange: selection.exchange,
    address: selection.address,
    accountIndex: selection.lighterAccountIndex,
  }
}

/**
 * The single wallet control for Position Markers.
 *
 * It sits in the app header next to the workspace icons, persists one global
 * exchange/address for every BTC Perp panel and workspace, and is the only
 * place a wallet is entered — panels have no per-widget wallet input. A Lighter
 * wallet that owns several accounts must be resolved here, so two accounts'
 * markers can never be mixed or an arbitrary account picked silently.
 */
export function PositionWalletControl() {
  const selection = usePositionWallet()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PositionWalletDraft>(() => draftForSelection(selection))
  const [accounts, setAccounts] = useState<LighterAccountSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const exchangeId = useId()
  const addressId = useId()
  const accountId = useId()

  // An unmounted control must not resolve a discovery request into a commit.
  useEffect(() => () => requestRef.current?.abort(), [])

  const commit = (next: PositionWalletSelection) => {
    setPositionWallet(next)
    setOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // A closed popover must not leave a discovery request running.
      requestRef.current?.abort()
      requestRef.current = null
      setBusy(false)
    } else {
      setDraft(draftForSelection(selection))
      setAccounts([])
      setError(null)
      setInfo(null)
      if (selection.exchange === 'lighter') void loadLighterAccounts(selection.address)
    }
    setOpen(next)
  }

  const handleExchangeChange = (value: string) => {
    const exchange: PositionWalletExchange = value === 'lighter' ? 'lighter' : 'hyperliquid'
    setDraft((current) => ({ ...current, exchange, accountIndex: null }))
    setAccounts([])
    setError(null)
    setInfo(null)
  }

  const handleAccountChange = (value: string) => {
    const index = Number(value)
    if (!Number.isSafeInteger(index)) return
    setDraft((current) => ({ ...current, accountIndex: index }))
    setInfo(null)
  }

  /**
   * Account discovery for one address. Reopening the menu for a saved Lighter
   * wallet also re-reads the accounts, so an account that was not chosen the
   * first time can still be selected without re-typing the address.
   */
  const loadLighterAccounts = async (
    address: string,
  ): Promise<LighterAccountSummary[] | null> => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setError(null)
    try {
      const found = await fetchLighterAccounts(address, controller.signal)
      if (controller.signal.aborted) return null
      setAccounts(found)
      return found
    } catch (caught) {
      if (controller.signal.aborted) return null
      setError(
        caught instanceof Error && caught.message !== ''
          ? caught.message
          : 'Could not check Lighter accounts for this address',
      )
      return null
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        requestRef.current = null
      }
    }
  }

  const resolveLighterAccount = async (address: string, requestedIndex: number | null) => {
    setInfo(null)
    const found = await loadLighterAccounts(address)
    if (found === null) return
    if (found.length === 0) {
      setInfo(
        'No Lighter account is associated with this address yet. Markers stay empty until it trades.',
      )
      commit({ exchange: 'lighter', address, lighterAccountIndex: null })
      return
    }
    if (found.length === 1) {
      commit({ exchange: 'lighter', address, lighterAccountIndex: found[0].index })
      return
    }
    if (requestedIndex !== null && found.some((account) => account.index === requestedIndex)) {
      commit({ exchange: 'lighter', address, lighterAccountIndex: requestedIndex })
      return
    }
    setInfo(
      `This wallet owns ${found.length} Lighter accounts. Choose the account whose markers should be shown.`,
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const addressError = positionWalletAddressError(draft.address)
    if (addressError !== null) {
      setError(addressError)
      return
    }
    const address = draft.address.trim().toLowerCase()
    if (draft.exchange === 'hyperliquid') {
      commit({ exchange: 'hyperliquid', address, lighterAccountIndex: null })
      return
    }
    void resolveLighterAccount(address, draft.accountIndex)
  }

  const label = positionWalletShortLabel(selection)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Position Markers wallet: ${label}`}
              data-testid="position-wallet-trigger"
            >
              <WalletMinimalIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Position Markers wallet: {label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-foreground">Position Markers wallet</span>
          <span className="text-[0.625rem] text-muted-foreground">
            Shared by every BTC Perp panel and workspace. The wallet exchange is independent of
            the candle exchange.
          </span>
        </div>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={exchangeId}>Exchange</FieldLabel>
              <Select value={draft.exchange} onValueChange={handleExchangeChange}>
                <SelectTrigger id={exchangeId} size="sm" aria-label="Wallet exchange">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {POSITION_WALLET_EXCHANGES.map((exchange) => (
                      <SelectItem key={exchange} value={exchange}>
                        {POSITION_WALLET_EXCHANGE_LABELS[exchange]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor={addressId}>Wallet address</FieldLabel>
              <Input
                id={addressId}
                value={draft.address}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={error !== null}
                aria-describedby={`${addressId}-description`}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, address: event.target.value }))
                  setError(null)
                  setInfo(null)
                }}
                placeholder="0x…"
              />
              <FieldDescription id={`${addressId}-description`}>
                {draft.exchange === 'hyperliquid'
                  ? 'Read-only Hyperliquid account address. No wallet connection, signature or API key.'
                  : 'Read-only Lighter L1 address. Account index is resolved from this address.'}
              </FieldDescription>
            </Field>

            {accounts.length > 1 && (
              <Field>
                <FieldLabel htmlFor={accountId}>Lighter account</FieldLabel>
                <Select
                  value={draft.accountIndex === null ? '' : String(draft.accountIndex)}
                  onValueChange={handleAccountChange}
                >
                  <SelectTrigger id={accountId} size="sm" aria-label="Lighter account">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accounts.map((account) => (
                        <SelectItem key={account.index} value={String(account.index)}>
                          {lighterAccountLabel(account)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Markers from two accounts are never mixed.
                </FieldDescription>
              </Field>
            )}

            {error !== null && <FieldError>{error}</FieldError>}
            {info !== null && (
              <p className="text-[0.625rem] text-muted-foreground" role="status">
                {info}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => {
                  setPositionWallet(DEFAULT_POSITION_WALLET)
                  setOpen(false)
                }}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Reset
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? 'Checking…' : 'Save'}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </PopoverContent>
    </Popover>
  )
}
