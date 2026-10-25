"""Read-only Hyperliquid account data.

The browser talks to FastAPI and FastAPI talks to Hyperliquid's public `info`
endpoint. Nothing here signs, places orders, or needs API keys: an account
address is enough to read the public clearinghouse state and fills.

Kept separate from `providers.py` on purpose. Account concerns (positions,
fills, the user-fills WebSocket relay) are not candle concerns, so the
`MarketDataProvider` protocol stays candle-only. Routes resolve these helpers
through `app.main`; the module-level HTTP seam (`_post_info`) is what tests
patch for hermetic runs.
"""

from __future__ import annotations

import asyncio
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
import websockets
from fastapi import HTTPException

from app.ws import WebSocketChannelManager, ws_manager

HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info"
HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws"

ACCOUNT_ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")
ACCOUNT_ADDRESS_INVALID_DETAIL = (
    "Hyperliquid account address must be '0x' followed by 40 hexadecimal characters"
)

# Hyperliquid returns at most 2000 fills per response.
HYPERLIQUID_FILLS_RESPONSE_CAP = 2000
DEFAULT_FILLS_PAGE_LIMIT = 10

CHANNEL_PREFIX = "hyperliquid.account."
CHANNEL_SUFFIX = ".userfills"
ACCOUNT_CHANNEL_PATTERN = re.compile(
    r"^hyperliquid\.account\.(0x[0-9a-fA-F]{40})\.userfills$"
)

BASE_RECONNECT_DELAY_S = 1.0
MAX_RECONNECT_DELAY_S = 30.0


def normalize_account_address(address: str) -> str:
    """Validate and lower-case an address (`0x` + 40 hex characters)."""
    value = address.strip() if isinstance(address, str) else ""
    if not ACCOUNT_ADDRESS_PATTERN.fullmatch(value):
        raise HTTPException(status_code=422, detail=ACCOUNT_ADDRESS_INVALID_DETAIL)
    return value.lower()


def is_valid_account_address(address: object) -> bool:
    return isinstance(address, str) and bool(
        ACCOUNT_ADDRESS_PATTERN.fullmatch(address.strip())
    )


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


def _as_text(value: object) -> str | None:
    return value if isinstance(value, str) and value != "" else None


def _post_info(
    body: dict[str, object],
    http_post: Callable[..., httpx.Response] | None = None,
) -> object:
    post = http_post if http_post is not None else httpx.post
    try:
        response = post(HYPERLIQUID_INFO_URL, json=body, timeout=10.0)
        response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid account request timed out",
        ) from None
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 422:
            raise HTTPException(
                status_code=422,
                detail="Hyperliquid rejected the account address",
            ) from None
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid account request failed",
        ) from None
    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid account request failed",
        ) from None

    try:
        return response.json()
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid account response was invalid",
        ) from None


# ---------------------------------------------------------------------------
# Position normalization
# ---------------------------------------------------------------------------


def normalize_position(item: object) -> dict[str, object] | None:
    """Normalize one `assetPositions` entry, or None when it is not a position.

    Every field is read defensively: Hyperliquid sends numbers as strings today,
    but a missing/renamed field must not crash the read-only widget.
    """
    if not isinstance(item, dict):
        return None
    raw = item.get("position", item)
    if not isinstance(raw, dict):
        return None

    coin = _as_text(raw.get("coin"))
    signed_size = _as_float(raw.get("szi"))
    if coin is None or signed_size is None:
        return None

    leverage = raw.get("leverage")
    leverage_value = (
        _as_float(leverage.get("value")) if isinstance(leverage, dict) else None
    )

    return {
        "coin": coin,
        "signed_size": signed_size,
        "size": abs(signed_size),
        "side": "long" if signed_size >= 0 else "short",
        "entry_price": _as_float(raw.get("entryPx")),
        "position_value": _as_float(raw.get("positionValue")),
        "unrealized_pnl": _as_float(raw.get("unrealizedPnl")),
        "liquidation_price": _as_float(raw.get("liquidationPx")),
        "leverage": leverage_value,
    }


def normalize_clearinghouse_state(
    address: str,
    payload: object,
) -> dict[str, object]:
    positions: list[dict[str, object]] = []
    asset_positions: list[object] = []
    if isinstance(payload, dict) and isinstance(payload.get("assetPositions"), list):
        asset_positions = payload["assetPositions"]

    for item in asset_positions:
        position = normalize_position(item)
        if position is None or position["size"] == 0:
            continue
        positions.append(position)

    btc_position = next(
        (position for position in positions if str(position["coin"]).upper() == "BTC"),
        None,
    )
    return {
        "address": address,
        "positions": positions,
        "btc_position": btc_position,
    }


def fetch_clearinghouse_state_sync(
    address: str,
    http_post: Callable[..., httpx.Response] | None = None,
) -> dict[str, object]:
    safe_address = normalize_account_address(address)
    payload = _post_info(
        {"type": "clearinghouseState", "user": safe_address},
        http_post=http_post,
    )
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid account response was invalid",
        )
    return normalize_clearinghouse_state(safe_address, payload)


# ---------------------------------------------------------------------------
# Fill normalization
# ---------------------------------------------------------------------------


def normalize_fill(item: object) -> dict[str, object] | None:
    if not isinstance(item, dict):
        return None

    coin = _as_text(item.get("coin"))
    side = _as_text(item.get("side"))
    price = _as_float(item.get("px"))
    size = _as_float(item.get("sz"))
    time_ms = _as_int_ms(item.get("time"))
    if (
        coin is None
        or side not in ("A", "B")
        or price is None
        or price <= 0
        or size is None
        or size <= 0
        or time_ms is None
    ):
        return None

    tid = item.get("tid")
    oid = item.get("oid")
    return {
        "coin": coin,
        "price": price,
        "size": size,
        "side": side,
        "time": time_ms,
        "start_position": _as_float(item.get("startPosition")),
        "direction": _as_text(item.get("dir")),
        "closed_pnl": _as_float(item.get("closedPnl")),
        "fee": _as_float(item.get("fee")),
        "hash": _as_text(item.get("hash")),
        "oid": int(oid) if isinstance(oid, int) and not isinstance(oid, bool) else None,
        "tid": int(tid) if isinstance(tid, int) and not isinstance(tid, bool) else None,
        "crossed": item.get("crossed") if isinstance(item.get("crossed"), bool) else None,
    }


def fill_identity_key(fill: dict[str, object]) -> str:
    tid = fill.get("tid")
    if isinstance(tid, int):
        return f"tid:{tid}"
    return "|".join(
        str(fill.get(key) or "")
        for key in ("hash", "oid", "time", "coin")
    )


def normalize_fills(items: object) -> list[dict[str, object]]:
    if not isinstance(items, list):
        return []
    fills: list[dict[str, object]] = []
    for item in items:
        fill = normalize_fill(item)
        if fill is not None:
            fills.append(fill)
    return fills


def dedupe_fills(fills: list[dict[str, object]]) -> list[dict[str, object]]:
    seen: set[str] = set()
    unique: list[dict[str, object]] = []
    for fill in fills:
        key = fill_identity_key(fill)
        if key in seen:
            continue
        seen.add(key)
        unique.append(fill)
    unique.sort(key=lambda fill: (int(fill["time"]), str(fill_identity_key(fill))))
    return unique


def _fills_body(
    address: str,
    fills: list[dict[str, object]],
    *,
    truncated: bool,
    requested_start_time: int | None,
    requested_end_time: int | None,
    pages: int,
) -> dict[str, object]:
    return {
        "address": address,
        "fills": fills,
        "count": len(fills),
        "truncated": truncated,
        "complete": not truncated,
        "response_cap": HYPERLIQUID_FILLS_RESPONSE_CAP,
        "pages": pages,
        "requested_start_time": requested_start_time,
        "requested_end_time": requested_end_time,
    }


def fetch_user_fills_sync(
    address: str,
    http_post: Callable[..., httpx.Response] | None = None,
) -> dict[str, object]:
    """The most recent fills (`userFills`, capped upstream at 2000)."""
    safe_address = normalize_account_address(address)
    payload = _post_info(
        {"type": "userFills", "user": safe_address},
        http_post=http_post,
    )
    if not isinstance(payload, list):
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid account response was invalid",
        )
    fills = dedupe_fills(normalize_fills(payload))
    return _fills_body(
        safe_address,
        fills,
        truncated=len(payload) >= HYPERLIQUID_FILLS_RESPONSE_CAP,
        requested_start_time=None,
        requested_end_time=None,
        pages=1,
    )


def validate_fill_time_range(start_time: int, end_time: int) -> tuple[int, int]:
    if start_time <= 0 or end_time <= 0:
        raise HTTPException(
            status_code=400,
            detail="Fill window bounds must be positive epoch milliseconds",
        )
    if end_time <= start_time:
        raise HTTPException(
            status_code=400,
            detail="'end_time' must be greater than 'start_time'",
        )
    return start_time, end_time


def fetch_user_fills_by_time_sync(
    address: str,
    start_time: int,
    end_time: int,
    *,
    max_pages: int = DEFAULT_FILLS_PAGE_LIMIT,
    http_post: Callable[..., httpx.Response] | None = None,
) -> dict[str, object]:
    """Page forward through an explicit `userFillsByTime` window.

    Verified upstream behaviour: the endpoint returns fills from `startTime`
    forward (ascending) and is capped at 2000 per response. Pages advance the
    cursor to the newest returned fill time (inclusive; identity dedupe removes
    repeats). If a page adds nothing, or the page budget is exhausted, the
    result is marked `truncated` — never silently presented as complete.
    """
    safe_address = normalize_account_address(address)
    safe_start, safe_end = validate_fill_time_range(start_time, end_time)
    safe_pages = max(1, min(int(max_pages), DEFAULT_FILLS_PAGE_LIMIT * 5))

    collected: list[dict[str, object]] = []
    seen: set[str] = set()
    cursor = safe_start
    truncated = False
    pages = 0

    while pages < safe_pages:
        pages += 1
        payload = _post_info(
            {
                "type": "userFillsByTime",
                "user": safe_address,
                "startTime": cursor,
                "endTime": safe_end,
            },
            http_post=http_post,
        )
        if not isinstance(payload, list):
            raise HTTPException(
                status_code=502,
                detail="Hyperliquid account response was invalid",
            )

        page_fills = normalize_fills(payload)
        added = 0
        newest_time = cursor
        for fill in page_fills:
            key = fill_identity_key(fill)
            newest_time = max(newest_time, int(fill["time"]))
            if key in seen:
                continue
            seen.add(key)
            collected.append(fill)
            added += 1

        if len(payload) < HYPERLIQUID_FILLS_RESPONSE_CAP:
            break
        if added == 0:
            truncated = True
            break
        if newest_time >= safe_end:
            # A full final page may still hide fills sharing the last timestamp.
            truncated = True
            break
        if newest_time <= cursor:
            truncated = True
            break
        cursor = newest_time
    else:
        truncated = True

    return _fills_body(
        safe_address,
        dedupe_fills(collected),
        truncated=truncated,
        requested_start_time=safe_start,
        requested_end_time=safe_end,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# WebSocket relay
# ---------------------------------------------------------------------------


def account_user_fills_channel(address: str) -> str:
    return f"{CHANNEL_PREFIX}{normalize_account_address(address)}{CHANNEL_SUFFIX}"


def parse_account_user_fills_channel(channel: str) -> str | None:
    match = ACCOUNT_CHANNEL_PATTERN.fullmatch(channel)
    if not match:
        return None
    return match.group(1).lower()


def user_fills_subscription_payload(address: str) -> dict[str, object]:
    return {
        "method": "subscribe",
        "subscription": {"type": "userFills", "user": address.lower()},
    }


def parse_user_fills_ws_payload(raw: str) -> dict[str, object] | None:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict) or payload.get("channel") != "userFills":
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None

    user = _as_text(data.get("user"))
    if user is None or not is_valid_account_address(user):
        return None
    if not isinstance(data.get("fills"), list):
        return None

    return {
        "user": user.lower(),
        "is_snapshot": data.get("isSnapshot") is True,
        "fills": normalize_fills(data["fills"]),
    }


@dataclass
class _UpstreamState:
    task: asyncio.Task[None]
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


class HyperliquidUserFillsRelay:
    """One shared upstream `userFills` subscription per account channel."""

    def __init__(
        self,
        manager: WebSocketChannelManager,
        connect_ws: Callable[[str], Any] | None = None,
        base_reconnect_delay_s: float = BASE_RECONNECT_DELAY_S,
        max_reconnect_delay_s: float = MAX_RECONNECT_DELAY_S,
    ) -> None:
        self._manager = manager
        self._connect_ws = connect_ws
        self._base_reconnect_delay_s = base_reconnect_delay_s
        self._max_reconnect_delay_s = max_reconnect_delay_s
        self._upstreams: dict[str, _UpstreamState] = {}

    def upstream_count(self, channel: str) -> int:
        return 1 if channel in self._upstreams else 0

    async def on_client_connected(self, channel: str) -> None:
        address = parse_account_user_fills_channel(channel)
        if address is None:
            return
        if self._manager.connection_count(channel) != 1:
            return
        await self._start_upstream(channel, address)

    async def on_client_disconnected(self, channel: str) -> None:
        address = parse_account_user_fills_channel(channel)
        if address is None:
            return
        if self._manager.connection_count(channel) != 0:
            return
        await self._stop_upstream(channel)

    async def shutdown(self) -> None:
        for channel in list(self._upstreams):
            await self._stop_upstream(channel)

    def _clear_upstream_if_current(
        self,
        channel: str,
        task: asyncio.Task[None],
    ) -> None:
        state = self._upstreams.get(channel)
        if state is not None and state.task is task:
            del self._upstreams[channel]

    async def _start_upstream(self, channel: str, address: str) -> None:
        existing = self._upstreams.get(channel)
        if existing is not None:
            if not existing.task.done():
                return
            del self._upstreams[channel]

        stop_event = asyncio.Event()
        task = asyncio.create_task(
            self._run_upstream(channel, address, stop_event)
        )
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
        address: str,
        stop_event: asyncio.Event,
    ) -> None:
        task = asyncio.current_task()
        if task is None:
            return

        try:
            attempt = 0
            url = HYPERLIQUID_WS_URL

            while not stop_event.is_set():
                if self._manager.connection_count(channel) == 0:
                    return

                try:
                    await self._consume_upstream(channel, url, address, stop_event)
                    attempt = 0
                except asyncio.CancelledError:
                    raise
                except Exception:
                    attempt += 1
                    if (
                        stop_event.is_set()
                        or self._manager.connection_count(channel) == 0
                    ):
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
        address: str,
        stop_event: asyncio.Event,
    ) -> None:
        connect = self._connect_ws or websockets.connect
        async with connect(url) as upstream:
            await upstream.send(
                json.dumps(user_fills_subscription_payload(address))
            )

            while not stop_event.is_set():
                if self._manager.connection_count(channel) == 0:
                    return

                raw = await upstream.recv()
                if isinstance(raw, bytes):
                    raw = raw.decode()

                message = parse_user_fills_ws_payload(str(raw))
                if message is None:
                    continue
                if message["user"] != address:
                    continue
                await self._manager.publish(channel, message)


hyperliquid_user_fills_relay = HyperliquidUserFillsRelay(ws_manager)
