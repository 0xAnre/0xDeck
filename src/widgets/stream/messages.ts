export type ServerMessageBase = {
  type: string
  channel: string
  timestamp: string
}

export type ServerConnectedMessage = ServerMessageBase & {
  type: 'connected'
}

export type ServerEventMessage = ServerMessageBase & {
  type: 'event'
  payload: unknown
}

export type ServerPongMessage = ServerMessageBase & {
  type: 'pong'
}

export type ServerErrorMessage = ServerMessageBase & {
  type: 'error'
  message: string
}

export type ServerMessage =
  | ServerConnectedMessage
  | ServerEventMessage
  | ServerPongMessage
  | ServerErrorMessage

export type ClientPingMessage = {
  type: 'ping'
}

export type ClientMessage = ClientPingMessage

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!raw || typeof raw !== 'object') return null

  const record = raw as Record<string, unknown>
  const { type, channel, timestamp } = record
  if (typeof type !== 'string' || typeof channel !== 'string' || typeof timestamp !== 'string') {
    return null
  }

  const base = { type, channel, timestamp } as ServerMessageBase

  switch (type) {
    case 'connected':
      return { ...base, type: 'connected' }
    case 'pong':
      return { ...base, type: 'pong' }
    case 'event':
      return { ...base, type: 'event', payload: record.payload }
    case 'error':
      if (typeof record.message !== 'string') return null
      return { ...base, type: 'error', message: record.message }
    default:
      return null
  }
}
