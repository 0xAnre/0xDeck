/**
 * One WebSocket per relay channel, shared by every widget that needs it.
 *
 * `WidgetStreamClient` owns socket behaviour (URL, reconnect backoff, message
 * validation). This module adds the sharing rule on top: the channel name is
 * the subscription identity, so two BTC Perp panels on the same symbol and
 * interval share one `kline` socket instead of opening one each, and the
 * `liquidations` channel is dialed once for the whole page (Issue #238).
 */
import {
  createSharedStreamHub,
  type SharedStreamClient,
  type SharedStreamHandlers,
} from '@/lib/streamSubscriptionRegistry'
import {
  WidgetStreamClient,
  type WidgetStreamConnectionState,
} from '@/widgets/stream/client'
import type { ServerMessage } from '@/widgets/stream/messages'

export type WidgetStreamSubscription = SharedStreamHandlers<
  ServerMessage,
  WidgetStreamConnectionState
>

const hub = createSharedStreamHub<ServerMessage, WidgetStreamConnectionState>({
  createClient: (channel, handlers): SharedStreamClient<WidgetStreamConnectionState> =>
    new WidgetStreamClient({
      channel,
      onMessage: handlers.onMessage,
      onStateChange: handlers.onStateChange,
      onError: handlers.onError,
    }),
})

/**
 * Joins `channel`, opening it when this is the first subscriber, and returns
 * the unsubscribe for that widget. The socket stays open while any other
 * widget is still subscribed, so a panel unmount never interrupts a live feed
 * another panel is drawing.
 */
export function subscribeWidgetStream(
  channel: string,
  handlers: WidgetStreamSubscription,
): () => void {
  return hub.subscribe(channel, handlers)
}

/** Live subscribers on a channel (diagnostics and tests). */
export function widgetStreamSubscriberCount(channel: string): number {
  return hub.subscriberCount(channel)
}

/** Open relay connections; at most one per channel (diagnostics and tests). */
export function widgetStreamConnectionCount(): number {
  return hub.openConnectionCount()
}
