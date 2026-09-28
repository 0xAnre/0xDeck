import { parseServerMessage, type ClientPingMessage, type ServerMessage } from '@/widgets/stream/messages'

export type WidgetStreamConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error'

export type WidgetStreamClientOptions = {
  channel: string
  onMessage: (message: ServerMessage) => void
  onStateChange?: (state: WidgetStreamConnectionState) => void
  onError?: (error: Error) => void
  maxReconnectAttempts?: number
  baseReconnectDelayMs?: number
}

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5
const DEFAULT_BASE_RECONNECT_DELAY_MS = 1_000

export function buildWidgetStreamWebSocketUrl(channel: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/${encodeURIComponent(channel)}`
}

export class WidgetStreamClient {
  private readonly channel: string
  private readonly onMessage: (message: ServerMessage) => void
  private readonly onStateChange?: (state: WidgetStreamConnectionState) => void
  private readonly onError?: (error: Error) => void
  private readonly maxReconnectAttempts: number
  private readonly baseReconnectDelayMs: number

  private socket: WebSocket | null = null
  private state: WidgetStreamConnectionState = 'idle'
  private closedByUser = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: WidgetStreamClientOptions) {
    this.channel = options.channel
    this.onMessage = options.onMessage
    this.onStateChange = options.onStateChange
    this.onError = options.onError
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS
    this.baseReconnectDelayMs = options.baseReconnectDelayMs ?? DEFAULT_BASE_RECONNECT_DELAY_MS
  }

  getConnectionState(): WidgetStreamConnectionState {
    return this.state
  }

  connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    this.closedByUser = false
    this.clearReconnectTimer()
    this.openSocket(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
  }

  disconnect(): void {
    this.closedByUser = true
    this.clearReconnectTimer()
    this.reconnectAttempts = 0

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }

    this.setState('closed')
  }

  ping(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return

    const message: ClientPingMessage = { type: 'ping' }
    this.socket.send(JSON.stringify(message))
  }

  private openSocket(nextState: 'connecting' | 'reconnecting'): void {
    this.setState(nextState)

    const socket = new WebSocket(buildWidgetStreamWebSocketUrl(this.channel))
    this.socket = socket

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0
      this.setState('open')
    })

    socket.addEventListener('message', (event) => {
      try {
        const raw = JSON.parse(String(event.data)) as unknown
        const message = parseServerMessage(raw)
        if (!message) {
          this.emitError(new Error('Invalid WebSocket message shape'))
          return
        }
        this.onMessage(message)
      } catch {
        this.emitError(new Error('Failed to parse WebSocket message JSON'))
      }
    })

    socket.addEventListener('error', () => {
      this.setState('error')
      this.emitError(new Error('WebSocket connection error'))
    })

    socket.addEventListener('close', () => {
      this.socket = null

      if (this.closedByUser) {
        this.setState('closed')
        return
      }

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setState('closed')
        return
      }

      this.scheduleReconnect()
    })
  }

  private scheduleReconnect(): void {
    const delay = this.baseReconnectDelayMs * 2 ** this.reconnectAttempts
    this.reconnectAttempts += 1
    this.setState('reconnecting')

    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closedByUser) {
        this.openSocket('reconnecting')
      }
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private setState(state: WidgetStreamConnectionState): void {
    this.state = state
    this.onStateChange?.(state)
  }

  private emitError(error: Error): void {
    this.onError?.(error)
  }
}
