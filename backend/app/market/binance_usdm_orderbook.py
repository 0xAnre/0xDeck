"""Synchronized Binance USD-M BTCUSDT order book + imbalance sampler.

Binance publishes depth snapshots over REST and incremental depth updates over
WebSocket. This module maintains one local book for the lifetime of the backend
process, following Binance's documented ``U`` / ``u`` / ``pu`` synchronization
rules, and samples order-book imbalance at a fixed set of percent distances.

The collector is deliberately separate from candle and liquidation concerns:

* the ``MarketDataProvider`` candle protocol stays untouched,
* samples live in their own SQLite store (``order_book_store.py``),
* each sample is persisted before it is relayed on
  ``binance.usdm.btcusdt.orderbook``.

Coverage is reported honestly. A Binance REST snapshot is capped at 1000 levels,
which at BTCUSDT is only ~0.15–0.18% per side, so wider distance samples are
persisted with ``complete = false`` until the maintained book actually covers
the requested distance on both sides. Incomplete samples are never a claim about
the requested distance.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import math
import time
from dataclasses import dataclass
from typing import Any, Callable

import httpx
import websockets

from app.market.order_book_store import (
    DEFAULT_ORDERBOOK_DISTANCE,
    ORDERBOOK_DISTANCES,
    ORDERBOOK_EXCHANGE,
    ORDERBOOK_SOURCE,
    ORDERBOOK_SYMBOL,
    OrderBookStore,
    get_orderbook_store,
    orderbook_sample_id,
)
from app.ws import WebSocketChannelManager, ws_manager

logger = logging.getLogger(__name__)

SYMBOL = "BTCUSDT"
SYMBOL_LOWER = "btcusdt"

ORDERBOOK_SNAPSHOT_URL = (
    "https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000"
)
ORDERBOOK_DIFF_WS_URL = "wss://fstream.binance.com/ws/btcusdt@depth@100ms"

ORDERBOOK_CHANNEL = "binance.usdm.btcusdt.orderbook"

BASE_RECONNECT_DELAY_S = 1.0
MAX_RECONNECT_DELAY_S = 30.0

SAMPLE_INTERVAL_S = 10.0
STALE_AFTER_S = 10.0

# A slow snapshot must not grow the pre-snapshot buffer without bound.
MAX_BUFFERED_DIFFS = 5_000


def parse_orderbook_channel(channel: str) -> str | None:
    """Return the symbol for the order-book relay channel, else None."""
    if channel != ORDERBOOK_CHANNEL:
        return None
    return SYMBOL


def _as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            return None
        return int(value)
    if isinstance(value, str) and value.strip() != "":
        try:
            return int(value)
        except ValueError:
            return None
    return None


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


def _normalize_levels(
    levels: object,
    *,
    allow_zero_quantity: bool,
) -> dict[float, float] | None:
    if not isinstance(levels, (list, tuple)):
        return None
    normalized: dict[float, float] = {}
    for level in levels:
        if not isinstance(level, (list, tuple)) or len(level) < 2:
            return None
        price = _as_float(level[0])
        quantity = _as_float(level[1])
        if price is None or price <= 0 or quantity is None:
            return None
        if quantity < 0 or (quantity == 0 and not allow_zero_quantity):
            return None
        normalized[price] = quantity
    return normalized


@dataclass(frozen=True)
class OrderBookSnapshot:
    last_update_id: int
    bids: dict[float, float]
    asks: dict[float, float]


@dataclass(frozen=True)
class OrderBookDiff:
    first_update_id: int
    final_update_id: int
    previous_final_update_id: int
    bids: dict[float, float]
    asks: dict[float, float]


def parse_orderbook_snapshot(payload: object) -> OrderBookSnapshot | None:
    """Parse one ``/fapi/v1/depth`` response defensively."""
    if not isinstance(payload, dict):
        return None
    last_update_id = _as_int(payload.get("lastUpdateId"))
    bids = _normalize_levels(payload.get("bids"), allow_zero_quantity=False)
    asks = _normalize_levels(payload.get("asks"), allow_zero_quantity=False)
    if last_update_id is None or last_update_id <= 0 or bids is None or asks is None:
        return None
    return OrderBookSnapshot(
        last_update_id=last_update_id,
        bids=bids,
        asks=asks,
    )


def normalize_orderbook_diff_event(event: object) -> OrderBookDiff | None:
    """Normalize one Binance ``depthUpdate`` event, or None when invalid."""
    if not isinstance(event, dict) or event.get("e") != "depthUpdate":
        return None
    if event.get("s") != SYMBOL:
        return None

    first_update_id = _as_int(event.get("U"))
    final_update_id = _as_int(event.get("u"))
    previous_final_update_id = _as_int(event.get("pu"))
    if (
        first_update_id is None
        or final_update_id is None
        or previous_final_update_id is None
        or first_update_id <= 0
        or final_update_id < first_update_id
        or previous_final_update_id < 0
    ):
        return None

    bids = _normalize_levels(event.get("b"), allow_zero_quantity=True)
    asks = _normalize_levels(event.get("a"), allow_zero_quantity=True)
    if bids is None or asks is None:
        return None

    return OrderBookDiff(
        first_update_id=first_update_id,
        final_update_id=final_update_id,
        previous_final_update_id=previous_final_update_id,
        bids=bids,
        asks=asks,
    )


def parse_orderbook_diff_ws_payload(raw: str) -> OrderBookDiff | None:
    """Parse one upstream WebSocket frame (combined or raw event envelope)."""
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    event = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    return normalize_orderbook_diff_event(event)


def _apply_levels(
    target: dict[float, float],
    changes: dict[float, float],
) -> None:
    for price, quantity in changes.items():
        if quantity == 0:
            target.pop(price, None)
        else:
            target[price] = quantity


class OrderBookState:
    """Pure local order book state with Binance snapshot/diff synchronization.

    ``on_diff`` buffers updates until a snapshot is applied, then applies them in
    order. Any sequence gap, failed first-event window or failed ``pu``
    continuity sets ``needs_resync`` so the collector can fetch a new snapshot.
    """

    def __init__(self) -> None:
        self.bids: dict[float, float] = {}
        self.asks: dict[float, float] = {}
        self.last_update_id: int | None = None
        self.last_event_u: int | None = None
        self.awaiting_snapshot = False
        self.needs_resync = False
        self.buffer: list[OrderBookDiff] = []

    @property
    def synced(self) -> bool:
        return (
            self.awaiting_snapshot is False
            and self.last_update_id is not None
        )

    def begin_resync(self) -> None:
        """Drop the current book and buffer updates until a fresh snapshot."""
        self.bids = {}
        self.asks = {}
        self.last_update_id = None
        self.last_event_u = None
        self.awaiting_snapshot = True
        self.needs_resync = False
        self.buffer = []

    def best_bid(self) -> float | None:
        return max(self.bids) if self.bids else None

    def best_ask(self) -> float | None:
        return min(self.asks) if self.asks else None

    def mark_needs_resync(self) -> None:
        self.needs_resync = True

    def on_diff(self, diff: OrderBookDiff) -> None:
        """Consume one diff update (buffered until the snapshot is applied)."""
        if not self.synced:
            if len(self.buffer) < MAX_BUFFERED_DIFFS:
                self.buffer.append(diff)
            else:
                # A snapshot that takes this long means the buffer is no longer
                # trustworthy; request a new one instead of silently dropping.
                self.needs_resync = True
            return
        self._apply_live_diff(diff)

    def apply_snapshot(self, snapshot: OrderBookSnapshot) -> bool:
        """Replace the book with a snapshot and replay buffered diffs.

        Returns ``False`` when the buffered diffs reveal a gap; the caller must
        then resync instead of exposing an inconsistent book.
        """
        self.bids = dict(snapshot.bids)
        self.asks = dict(snapshot.asks)
        self.last_update_id = snapshot.last_update_id
        self.last_event_u = None
        self.awaiting_snapshot = False
        self.needs_resync = False
        buffered = self.buffer
        self.buffer = []

        first_applied = False
        for diff in buffered:
            # Binance rule 2: events already covered by the snapshot are dropped.
            if diff.final_update_id < snapshot.last_update_id:
                continue
            if not first_applied:
                # Binance rule 3: the first applied event must span the snapshot.
                if not (
                    diff.first_update_id
                    <= snapshot.last_update_id + 1
                    <= diff.final_update_id
                ):
                    self.needs_resync = True
                    self.awaiting_snapshot = True
                    return False
                self._apply_diff_levels(diff)
                self.last_event_u = diff.final_update_id
                first_applied = True
                continue

            # Binance rule 4: every later event must continue the previous one.
            if diff.final_update_id <= (self.last_event_u or 0):
                continue
            if diff.previous_final_update_id != self.last_event_u:
                self.needs_resync = True
                self.awaiting_snapshot = True
                return False
            self._apply_diff_levels(diff)
            self.last_event_u = diff.final_update_id

        return True

    def _apply_live_diff(self, diff: OrderBookDiff) -> None:
        if diff.final_update_id < (self.last_update_id or 0):
            return
        if self.last_event_u is None:
            if not (
                diff.first_update_id
                <= (self.last_update_id or 0) + 1
                <= diff.final_update_id
            ):
                self.needs_resync = True
                return
            self._apply_diff_levels(diff)
            self.last_event_u = diff.final_update_id
            return

        if diff.final_update_id <= self.last_event_u:
            # Duplicate or already-applied update.
            return
        if diff.previous_final_update_id != self.last_event_u:
            self.needs_resync = True
            return
        self._apply_diff_levels(diff)
        self.last_event_u = diff.final_update_id

    def _apply_diff_levels(self, diff: OrderBookDiff) -> None:
        _apply_levels(self.bids, diff.bids)
        _apply_levels(self.asks, diff.asks)


def _coverage_pct(mid: float, deepest_price: float) -> float:
    return abs(mid - deepest_price) / mid * 100.0


def compute_orderbook_sample(
    state: OrderBookState,
    distance: float,
    sample_time: int,
) -> dict[str, object] | None:
    """Compute one imbalance/notional/coverage sample for a percent distance."""
    if distance not in ORDERBOOK_DISTANCES:
        return None
    best_bid = state.best_bid()
    best_ask = state.best_ask()
    if best_bid is None or best_ask is None:
        return None
    mid = (best_bid + best_ask) / 2.0
    if not math.isfinite(mid) or mid <= 0:
        return None

    bid_floor = mid * (1.0 - distance / 100.0)
    ask_ceiling = mid * (1.0 + distance / 100.0)

    bid_notional = sum(
        price * quantity
        for price, quantity in state.bids.items()
        if price >= bid_floor
    )
    ask_notional = sum(
        price * quantity
        for price, quantity in state.asks.items()
        if price <= ask_ceiling
    )
    total = bid_notional + ask_notional
    imbalance = 0.0 if total <= 0 else 100.0 * (bid_notional - ask_notional) / total
    imbalance = max(-100.0, min(100.0, imbalance))

    deepest_bid = min(state.bids)
    deepest_ask = max(state.asks)
    bid_coverage = _coverage_pct(mid, deepest_bid)
    ask_coverage = _coverage_pct(mid, deepest_ask)
    complete = bid_coverage >= distance and ask_coverage >= distance

    return {
        "id": orderbook_sample_id(distance, sample_time),
        "source": ORDERBOOK_SOURCE,
        "exchange": ORDERBOOK_EXCHANGE,
        "symbol": ORDERBOOK_SYMBOL,
        "distance": distance,
        "time": sample_time,
        "mid": mid,
        "bid_notional": bid_notional,
        "ask_notional": ask_notional,
        "imbalance": imbalance,
        "bid_coverage_pct": bid_coverage,
        "ask_coverage_pct": ask_coverage,
        "complete": complete,
    }


def _fetch_snapshot_sync(url: str) -> object:
    response = httpx.get(url, timeout=10.0)
    response.raise_for_status()
    return response.json()


@dataclass
class _UpstreamState:
    task: asyncio.Task[None]
    stop_event: asyncio.Event


class BinanceUsdmOrderBookCollector:
    """One process-lifetime synchronized book + periodic imbalance sampler."""

    def __init__(
        self,
        manager: WebSocketChannelManager,
        connect_ws: Callable[[str], Any] | None = None,
        fetch_snapshot: Callable[[str], Any] | None = None,
        base_reconnect_delay_s: float = BASE_RECONNECT_DELAY_S,
        max_reconnect_delay_s: float = MAX_RECONNECT_DELAY_S,
        sample_interval_s: float = SAMPLE_INTERVAL_S,
        stale_after_s: float = STALE_AFTER_S,
        store: OrderBookStore | None = None,
    ) -> None:
        self._manager = manager
        self._connect_ws = connect_ws
        self._fetch_snapshot = fetch_snapshot or _fetch_snapshot_sync
        self._base_reconnect_delay_s = base_reconnect_delay_s
        self._max_reconnect_delay_s = max_reconnect_delay_s
        self._sample_interval_s = sample_interval_s
        self._stale_after_s = stale_after_s
        self._store = store
        self._upstreams: dict[str, _UpstreamState] = {}
        self._state = OrderBookState()
        self._snapshot_task: asyncio.Task[OrderBookSnapshot | None] | None = None
        self._snapshot_retry_at: float | None = None

    @property
    def state(self) -> OrderBookState:
        return self._state

    def upstream_count(self, channel: str) -> int:
        return 1 if channel in self._upstreams else 0

    @property
    def collecting(self) -> bool:
        return bool(self._upstreams)

    async def start_collection(self, channel: str = ORDERBOOK_CHANNEL) -> None:
        """Start the persistent upstream subscription (idempotent)."""
        if parse_orderbook_channel(channel) is None:
            return
        await self._start_upstream(channel)

    async def on_client_connected(self, channel: str) -> None:
        # Clients never start or stop collection.
        return None

    async def on_client_disconnected(self, channel: str) -> None:
        return None

    async def shutdown(self) -> None:
        for channel in list(self._upstreams):
            await self._stop_upstream(channel)

    def _persist(self, samples: list[dict[str, object]]) -> None:
        store = self._store or get_orderbook_store()
        try:
            store.insert_samples(samples)
        except Exception:  # pragma: no cover - defensive logging path
            # A transient database problem must not take down the live feed.
            logger.exception("Could not persist Binance order-book samples")

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
        self._cancel_snapshot_task()
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
            while not stop_event.is_set():
                try:
                    await self._consume_upstream(channel, stop_event)
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
            self._cancel_snapshot_task()
            self._clear_upstream_if_current(channel, task)

    def _cancel_snapshot_task(self) -> None:
        task = self._snapshot_task
        self._snapshot_task = None
        self._snapshot_retry_at = None
        if task is not None and not task.done():
            task.cancel()

    async def _load_snapshot(self) -> OrderBookSnapshot | None:
        try:
            fetch = self._fetch_snapshot
            if inspect.iscoroutinefunction(fetch):
                payload = await fetch(ORDERBOOK_SNAPSHOT_URL)
            else:
                payload = await asyncio.to_thread(fetch, ORDERBOOK_SNAPSHOT_URL)
            return parse_orderbook_snapshot(payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Could not fetch Binance order-book snapshot", exc_info=True)
            return None

    def _start_snapshot(self) -> None:
        self._cancel_snapshot_task()
        self._snapshot_task = asyncio.create_task(self._load_snapshot())

    def _apply_pending_snapshot(self) -> None:
        task = self._snapshot_task
        if task is None or not task.done():
            return
        self._snapshot_task = None
        try:
            snapshot = task.result()
        except asyncio.CancelledError:
            return
        except Exception:  # pragma: no cover - `_load_snapshot` catches
            snapshot = None

        if snapshot is None:
            self._snapshot_retry_at = (
                asyncio.get_running_loop().time() + self._base_reconnect_delay_s
            )
            return

        self._snapshot_retry_at = None
        if not self._state.apply_snapshot(snapshot):
            self._resync()

    def _resync(self) -> None:
        self._state.begin_resync()
        self._start_snapshot()

    async def _emit_samples(self) -> None:
        if not self._state.synced:
            return
        sample_time = int(time.time() * 1000)
        samples: list[dict[str, object]] = []
        for distance in ORDERBOOK_DISTANCES:
            sample = compute_orderbook_sample(self._state, distance, sample_time)
            if sample is not None:
                samples.append(sample)
        if not samples:
            return
        self._persist(samples)
        for sample in samples:
            await self._manager.publish(ORDERBOOK_CHANNEL, sample)

    async def _consume_upstream(
        self,
        channel: str,
        stop_event: asyncio.Event,
    ) -> None:
        connect = self._connect_ws or websockets.connect
        async with connect(ORDERBOOK_DIFF_WS_URL) as upstream:
            loop = asyncio.get_running_loop()
            self._resync()
            last_event_at = loop.time()
            next_sample_at = last_event_at + self._sample_interval_s

            while not stop_event.is_set():
                self._apply_pending_snapshot()
                now = loop.time()

                if self._state.needs_resync:
                    self._resync()
                    last_event_at = now
                elif (
                    self._snapshot_retry_at is not None
                    and now >= self._snapshot_retry_at
                    and self._snapshot_task is None
                ):
                    self._snapshot_retry_at = None
                    self._start_snapshot()

                deadlines = [next_sample_at]
                if self._state.synced:
                    deadlines.append(last_event_at + self._stale_after_s)
                if self._snapshot_retry_at is not None:
                    deadlines.append(self._snapshot_retry_at)
                if self._snapshot_task is not None:
                    # Poll a pending snapshot so it is applied promptly even
                    # when the upstream is silent; the diff buffer holds frames.
                    deadlines.append(now + 0.05)
                timeout = max(0.0, min(deadlines) - now)

                raw: str | bytes | None = None
                try:
                    raw = await asyncio.wait_for(upstream.recv(), timeout=timeout)
                except asyncio.TimeoutError:
                    raw = None

                if raw is not None:
                    if isinstance(raw, bytes):
                        raw = raw.decode()
                    diff = parse_orderbook_diff_ws_payload(str(raw))
                    if diff is not None:
                        last_event_at = loop.time()
                        self._state.on_diff(diff)
                        if self._state.needs_resync:
                            self._resync()
                            last_event_at = loop.time()

                self._apply_pending_snapshot()
                now = loop.time()

                if self._state.needs_resync:
                    self._resync()
                    last_event_at = now
                elif (
                    self._snapshot_retry_at is not None
                    and now >= self._snapshot_retry_at
                    and self._snapshot_task is None
                ):
                    self._snapshot_retry_at = None
                    self._start_snapshot()
                elif (
                    self._state.synced
                    and now - last_event_at >= self._stale_after_s
                ):
                    # Connected but no diff updates: the book can no longer be
                    # trusted, so fetch a fresh snapshot and replay from it.
                    self._resync()
                    last_event_at = now

                now = loop.time()
                if now >= next_sample_at:
                    await self._emit_samples()
                    next_sample_at = now + self._sample_interval_s


binance_orderbook_collector = BinanceUsdmOrderBookCollector(ws_manager)
