"""Binance USD-M `BTCUSDT` perpetual liquidation-order collector and relay.

Binance publishes a `forceOrder` event when a position is liquidated. This
module normalizes that event, stores it in SQLite for page-reload history, and
relays it over the existing FastAPI `/api/ws/{channel}` infrastructure.

One upstream subscription runs for the lifetime of the backend process, even
with zero chart clients connected. Collection starts at application startup and
stops at shutdown. There is no REST backfill: history begins when the backend
first starts collecting, and the stream is not a complete market-wide
liquidation total.

Kept separate from `providers.py` on purpose. Liquidations are not candle
concerns, so the `MarketDataProvider` candle protocol stays untouched; routes
resolve the relay through `relay_for_channel()` for the non-candle channel.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from dataclasses import dataclass, field
from typing import Any, Callable

import websockets

from app.market.liquidation_store import (
    LiquidationStore,
    get_liquidation_store,
)
from app.ws import WebSocketChannelManager, ws_manager

logger = logging.getLogger(__name__)

BINANCE_USDM_FORCE_ORDER_WS_URL = (
    "wss://fstream.binance.com/market/ws/btcusdt@forceOrder"
)

SYMBOL = "BTCUSDT"
SYMBOL_LOWER = "btcusdt"

LIQUIDATIONS_CHANNEL = "binance.usdm.btcusdt.liquidations"

BASE_RECONNECT_DELAY_S = 1.0
MAX_RECONNECT_DELAY_S = 30.0

# Binance order side -> affected position side. A SELL force order closes a
# long; a BUY force order closes a short.
LIQUIDATION_SIDE_BY_ORDER_SIDE = {
    "SELL": "long",
    "BUY": "short",
}


def parse_liquidations_channel(channel: str) -> str | None:
    """Return the symbol for the liquidations relay channel, else None."""
    if channel != LIQUIDATIONS_CHANNEL:
        return None
    return SYMBOL


def _as_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str) and value.strip() != "":
        try:
            number = float(value)
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


def _as_int_ms(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = int(value)
    elif isinstance(value, str) and value.strip() != "":
        try:
            number = int(float(value))
        except ValueError:
            return None
    else:
        return None
    return number if number > 0 else None


def liquidation_event_id(
    *,
    raw_side: str,
    event_time: int,
    trade_time: int,
    quantity_raw: object,
    price_raw: object,
) -> str:
    """Stable dedupe key derived from the raw force-order fields."""
    return "|".join(
        (
            "binance",
            SYMBOL,
            raw_side,
            str(event_time),
            str(trade_time),
            str(quantity_raw),
            str(price_raw),
        )
    )


def normalize_force_order_event(event: object) -> dict[str, object] | None:
    """Normalize one Binance `forceOrder` event, or None when invalid.

    Every field is read defensively. Malformed payloads, unknown sides and
    non-finite or non-positive price/quantity/notional never reach clients.
    """
    if not isinstance(event, dict) or event.get("e") != "forceOrder":
        return None

    order = event.get("o")
    if not isinstance(order, dict):
        return None
    if order.get("s") != SYMBOL:
        return None

    raw_side = order.get("S")
    side = (
        LIQUIDATION_SIDE_BY_ORDER_SIDE.get(raw_side)
        if isinstance(raw_side, str)
        else None
    )
    if side is None:
        return None

    price = _as_float(order.get("ap"))
    quantity = _as_float(order.get("z"))
    event_time = _as_int_ms(event.get("E"))
    trade_time_raw = order.get("T")
    trade_time = (
        event_time if trade_time_raw is None else _as_int_ms(trade_time_raw)
    )
    if (
        price is None
        or price <= 0
        or quantity is None
        or quantity <= 0
        or event_time is None
        or trade_time is None
    ):
        return None

    notional = price * quantity
    if not math.isfinite(notional) or notional <= 0:
        return None

    return {
        "exchange": "binance",
        "symbol": SYMBOL,
        "side": side,
        "price": price,
        "quantity": quantity,
        "notional": notional,
        "time": event_time,
        "trade_time": trade_time,
        "id": liquidation_event_id(
            raw_side=raw_side,
            event_time=event_time,
            trade_time=trade_time,
            quantity_raw=order.get("z"),
            price_raw=order.get("ap"),
        ),
    }


def parse_force_order_ws_payload(raw: str) -> dict[str, object] | None:
    """Parse one upstream WebSocket frame (combined or raw event envelope)."""
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None

    event = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    return normalize_force_order_event(event)


@dataclass
class _UpstreamState:
    task: asyncio.Task[None]
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


class BinanceUsdmLiquidationsRelay:
    """One process-lifetime upstream `forceOrder` subscription.

    The subscription is independent of WebSocket clients: connecting or
    disconnecting the last chart never starts or stops collection. Every valid
    normalized event is persisted first and then published to the liquidation
    channel, so a page reload can replay what was stored while the backend ran.
    """

    def __init__(
        self,
        manager: WebSocketChannelManager,
        connect_ws: Callable[[str], Any] | None = None,
        base_reconnect_delay_s: float = BASE_RECONNECT_DELAY_S,
        max_reconnect_delay_s: float = MAX_RECONNECT_DELAY_S,
        store: LiquidationStore | None = None,
    ) -> None:
        self._manager = manager
        self._connect_ws = connect_ws
        self._base_reconnect_delay_s = base_reconnect_delay_s
        self._max_reconnect_delay_s = max_reconnect_delay_s
        self._store = store
        self._upstreams: dict[str, _UpstreamState] = {}

    def upstream_count(self, channel: str) -> int:
        return 1 if channel in self._upstreams else 0

    @property
    def collecting(self) -> bool:
        return bool(self._upstreams)

    async def start_collection(self, channel: str = LIQUIDATIONS_CHANNEL) -> None:
        """Start the persistent upstream subscription (idempotent)."""
        if parse_liquidations_channel(channel) is None:
            return
        await self._start_upstream(channel)

    async def on_client_connected(self, channel: str) -> None:
        # Kept as a no-op hook for the generic relay protocol in `main.py`.
        # Collection is process-lifetime state, so clients never start it.
        return None

    async def on_client_disconnected(self, channel: str) -> None:
        # Disconnecting the last chart must not stop collection.
        return None

    async def shutdown(self) -> None:
        for channel in list(self._upstreams):
            await self._stop_upstream(channel)

    def _persist(self, event: dict[str, object]) -> None:
        store = self._store or get_liquidation_store()
        try:
            store.insert_event(event)
        except Exception:  # pragma: no cover - defensive logging path
            # A transient database problem must not take down the live feed.
            logger.exception("Could not persist Binance liquidation event")

    def _clear_upstream_if_current(
        self,
        channel: str,
        task: asyncio.Task[None],
    ) -> None:
        state = self._upstreams.get(channel)
        if state is not None and state.task is task:
            del self._upstreams[channel]

    async def _start_upstream(self, channel: str) -> None:
        existing = self._upstreams.get(channel)
        if existing is not None:
            if not existing.task.done():
                return
            del self._upstreams[channel]

        stop_event = asyncio.Event()
        task = asyncio.create_task(self._run_upstream(channel, stop_event))
        self._upstreams[channel] = _UpstreamState(task=task, stop_event=stop_event)

    async def _stop_upstream(self, channel: str) -> None:
        state = self._upstreams.get(channel)
        if state is None:
            return

        task = state.task
        self._upstreams.pop(channel, None)
        state.stop_event.set()
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _run_upstream(
        self,
        channel: str,
        stop_event: asyncio.Event,
    ) -> None:
        task = asyncio.current_task()
        if task is None:
            return

        try:
            attempt = 0
            url = BINANCE_USDM_FORCE_ORDER_WS_URL

            while not stop_event.is_set():
                try:
                    await self._consume_upstream(channel, url, stop_event)
                    attempt = 0
                except asyncio.CancelledError:
                    raise
                except Exception:
                    attempt += 1
                    if stop_event.is_set():
                        return
                    delay = min(
                        self._base_reconnect_delay_s * (2 ** (attempt - 1)),
                        self._max_reconnect_delay_s,
                    )
                    try:
                        await asyncio.wait_for(stop_event.wait(), timeout=delay)
                        return
                    except asyncio.TimeoutError:
                        continue
        finally:
            self._clear_upstream_if_current(channel, task)

    async def _consume_upstream(
        self,
        channel: str,
        url: str,
        stop_event: asyncio.Event,
    ) -> None:
        connect = self._connect_ws or websockets.connect
        async with connect(url) as upstream:
            while not stop_event.is_set():
                raw = await upstream.recv()
                if isinstance(raw, bytes):
                    raw = raw.decode()

                event = parse_force_order_ws_payload(str(raw))
                if event is None:
                    continue

                # Persist before publishing so a reload can never lose an event
                # that a connected chart already rendered.
                self._persist(event)
                await self._manager.publish(channel, event)


binance_liquidations_relay = BinanceUsdmLiquidationsRelay(ws_manager)
