from __future__ import annotations

import asyncio
import json
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

from app.market import binance_usdm_liquidations as liquidations
from app.market.providers import relay_for_channel
from app.ws import WebSocketChannelManager, is_valid_channel

EVENT_TIME_MS = 1_792_000_000_000
TRADE_TIME_MS = EVENT_TIME_MS + 25


def _force_order(
    *,
    side: str = "SELL",
    price: str = "80000.0",
    quantity: str = "0.5",
    symbol: str = "BTCUSDT",
    event_type: str = "forceOrder",
    event_time: int | str = EVENT_TIME_MS,
    trade_time: int | str = TRADE_TIME_MS,
) -> dict[str, object]:
    return {
        "e": event_type,
        "E": event_time,
        "o": {
            "s": symbol,
            "S": side,
            "o": "LIMIT",
            "f": "IOC",
            "q": quantity,
            "p": price,
            "ap": price,
            "X": "FILLED",
            "l": quantity,
            "z": quantity,
            "T": trade_time,
        },
    }


class NormalizeForceOrderTests(unittest.TestCase):
    def test_maps_sell_to_long_liquidation(self) -> None:
        event = liquidations.normalize_force_order_event(_force_order(side="SELL"))
        assert event is not None
        self.assertEqual(event["exchange"], "binance")
        self.assertEqual(event["symbol"], "BTCUSDT")
        self.assertEqual(event["side"], "long")
        self.assertEqual(event["price"], 80000.0)
        self.assertEqual(event["quantity"], 0.5)
        self.assertEqual(event["notional"], 40000.0)
        self.assertEqual(event["time"], EVENT_TIME_MS)
        self.assertEqual(event["trade_time"], TRADE_TIME_MS)
        self.assertTrue(str(event["id"]).startswith("binance|BTCUSDT|SELL|"))

    def test_maps_buy_to_short_liquidation(self) -> None:
        event = liquidations.normalize_force_order_event(_force_order(side="BUY"))
        assert event is not None
        self.assertEqual(event["side"], "short")

    def test_dedupe_id_is_stable_for_the_same_raw_fields(self) -> None:
        first = liquidations.normalize_force_order_event(_force_order())
        second = liquidations.normalize_force_order_event(_force_order())
        assert first is not None and second is not None
        self.assertEqual(first["id"], second["id"])

    def test_parses_combined_and_raw_envelopes(self) -> None:
        raw = json.dumps(_force_order())
        wrapped = json.dumps({"stream": "btcusdt@forceOrder", "data": _force_order()})
        self.assertEqual(
            liquidations.parse_force_order_ws_payload(raw),
            liquidations.parse_force_order_ws_payload(wrapped),
        )

    def test_rejects_malformed_and_invalid_events(self) -> None:
        invalid_payloads: list[object] = [
            None,
            [],
            {"e": "forceOrder"},
            _force_order(event_type="aggTrade"),
            _force_order(symbol="ETHUSDT"),
            _force_order(side="HOLD"),
            _force_order(price="0"),
            _force_order(price="-1"),
            _force_order(quantity="0"),
            _force_order(quantity="-0.5"),
            _force_order(event_time=0),
            _force_order(trade_time="not-a-time"),
        ]
        for payload in invalid_payloads:
            self.assertIsNone(
                liquidations.normalize_force_order_event(payload),
                payload,
            )

    def test_rejects_non_finite_numbers_and_bad_json(self) -> None:
        self.assertIsNone(
            liquidations.normalize_force_order_event(_force_order(price="NaN")),
        )
        self.assertIsNone(
            liquidations.normalize_force_order_event(_force_order(quantity="Infinity")),
        )
        self.assertIsNone(liquidations.parse_force_order_ws_payload("{not json"))
        self.assertIsNone(liquidations.parse_force_order_ws_payload("null"))


class LiquidationsChannelTests(unittest.TestCase):
    def test_channel_is_valid_and_maps_to_the_liquidations_relay(self) -> None:
        channel = liquidations.LIQUIDATIONS_CHANNEL
        self.assertTrue(is_valid_channel(channel))
        self.assertEqual(
            liquidations.parse_liquidations_channel(channel),
            "BTCUSDT",
        )
        self.assertIs(
            relay_for_channel(channel),
            liquidations.binance_liquidations_relay,
        )

    def test_other_channels_are_not_liquidation_channels(self) -> None:
        self.assertIsNone(
            liquidations.parse_liquidations_channel(
                "binance.usdm.btcusdt.kline.1m"
            )
        )
        self.assertIsNone(
            liquidations.parse_liquidations_channel(
                "binance.usdm.btcusdt.liquidations.1m"
            )
        )


class _RecordingStore:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def insert_event(self, event: dict) -> bool:
        self.events.append(event)
        return True


def _connect_for(frames: list[object], order: list[tuple[str, str]] | None = None):
    @asynccontextmanager
    async def fake_connect(_url: str):
        class Upstream:
            index = 0

            async def recv(self_inner) -> str:
                if self_inner.index < len(frames):
                    frame = frames[self_inner.index]
                    self_inner.index += 1
                    await asyncio.sleep(0.005)
                    return frame if isinstance(frame, str) else json.dumps(frame)
                # Keep the upstream open without emitting more frames.
                await asyncio.sleep(3600)
                raise AssertionError("unreachable")

        if order is not None:
            order.append(("connect", ""))
        yield Upstream()

    return fake_connect


class BinanceUsdmLiquidationsRelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = WebSocketChannelManager()
        self.channel = liquidations.LIQUIDATIONS_CHANNEL
        self.published: list[tuple[str, dict]] = []
        self.store = _RecordingStore()
        self.frames: list[object] = []

        async def spy_publish(channel: str, payload: dict) -> None:
            self.published.append((channel, payload))

        self.manager.publish = spy_publish  # type: ignore[method-assign]
        self.relay = liquidations.BinanceUsdmLiquidationsRelay(
            self.manager,
            connect_ws=_connect_for(self.frames),
            store=self.store,  # type: ignore[arg-type]
            base_reconnect_delay_s=0.01,
            max_reconnect_delay_s=0.01,
        )

    async def _connect_client(self) -> MagicMock:
        socket = MagicMock()
        socket.accept = AsyncMock()
        socket.send_text = AsyncMock()
        await self.manager.connect(self.channel, socket)
        return socket

    async def _wait_until(self, predicate) -> None:
        for _ in range(200):
            if predicate():
                return
            await asyncio.sleep(0.01)
        self.fail("condition was not reached before timeout")

    async def asyncTearDown(self) -> None:
        await self.relay.shutdown()

    async def test_collection_starts_once_and_survives_client_lifecycle(self) -> None:
        self.frames.append(_force_order())

        await self.relay.start_collection()
        await self.relay.start_collection()
        self.assertEqual(self.relay.upstream_count(self.channel), 1)

        socket_a = await self._connect_client()
        await self.relay.on_client_connected(self.channel)
        socket_b = await self._connect_client()
        await self.relay.on_client_connected(self.channel)
        self.assertEqual(self.relay.upstream_count(self.channel), 1)

        await self._wait_until(lambda: bool(self.published))

        channel, payload = self.published[0]
        self.assertEqual(channel, self.channel)
        self.assertEqual(payload["side"], "long")
        self.assertEqual(payload["notional"], 40000.0)
        self.assertIn("id", payload)
        self.assertEqual(len(self.store.events), 1)
        self.assertEqual(self.store.events[0]["id"], payload["id"])

        self.manager.disconnect(self.channel, socket_a)
        await self.relay.on_client_disconnected(self.channel)
        self.manager.disconnect(self.channel, socket_b)
        await self.relay.on_client_disconnected(self.channel)

        # Disconnecting the last chart must not stop collection.
        self.assertEqual(self.manager.connection_count(self.channel), 0)
        self.assertEqual(self.relay.upstream_count(self.channel), 1)
        self.assertTrue(self.relay.collecting)

    async def test_collects_and_stores_with_zero_ws_clients(self) -> None:
        self.frames.extend(
            [
                _force_order(side="SELL"),
                _force_order(side="BUY", event_time=EVENT_TIME_MS + 1_000),
            ]
        )
        await self.relay.start_collection()

        await self._wait_until(lambda: len(self.store.events) == 2)
        self.assertEqual(self.manager.connection_count(self.channel), 0)
        self.assertEqual(
            [event["side"] for event in self.store.events],
            ["long", "short"],
        )
        self.assertEqual(len(self.published), 2)

    async def test_persists_before_publishing(self) -> None:
        order: list[tuple[str, str]] = []
        store = _RecordingStore()

        def record_insert(event: dict) -> bool:
            order.append(("store", str(event["id"])))
            store.events.append(event)
            return True

        store.insert_event = record_insert  # type: ignore[method-assign]

        async def record_publish(_channel: str, payload: dict) -> None:
            order.append(("publish", str(payload["id"])))

        self.manager.publish = record_publish  # type: ignore[method-assign]
        relay = liquidations.BinanceUsdmLiquidationsRelay(
            self.manager,
            connect_ws=_connect_for([_force_order()]),
            store=store,  # type: ignore[arg-type]
        )
        try:
            await relay.start_collection()
            await self._wait_until(lambda: len(order) >= 2)
        finally:
            await relay.shutdown()

        self.assertEqual([kind for kind, _ in order[:2]], ["store", "publish"])
        self.assertEqual(order[0][1], order[1][1])

    async def test_invalid_frames_are_never_stored_or_published(self) -> None:
        self.frames.extend(
            [
                "{not json",
                json.dumps(_force_order(symbol="ETHUSDT")),
                json.dumps(_force_order(price="0")),
                _force_order(),
            ]
        )
        await self.relay.start_collection()

        await self._wait_until(lambda: len(self.store.events) == 1)
        self.assertEqual(len(self.store.events), 1)
        self.assertEqual(len(self.published), 1)
        self.assertEqual(self.store.events[0]["symbol"], "BTCUSDT")


class BinanceUsdmLiquidationsReconnectTests(unittest.IsolatedAsyncioTestCase):
    async def test_reconnects_with_backoff_and_keeps_storing(self) -> None:
        manager = WebSocketChannelManager()
        channel = liquidations.LIQUIDATIONS_CHANNEL
        store = _RecordingStore()
        attempts = {"count": 0}

        @asynccontextmanager
        async def flaky_connect(_url: str):
            attempts["count"] += 1
            attempt = attempts["count"]

            class Upstream:
                index = 0

                async def recv(self_inner) -> str:
                    if self_inner.index == 0:
                        self_inner.index += 1
                        return json.dumps(
                            _force_order(
                                event_time=EVENT_TIME_MS + attempt * 1_000,
                            )
                        )
                    raise ConnectionError("upstream dropped")

            yield Upstream()

        async def ignore_publish(_channel: str, _payload: dict) -> None:
            return None

        manager.publish = ignore_publish  # type: ignore[method-assign]
        relay = liquidations.BinanceUsdmLiquidationsRelay(
            manager,
            connect_ws=flaky_connect,
            store=store,  # type: ignore[arg-type]
            base_reconnect_delay_s=0.01,
            max_reconnect_delay_s=0.01,
        )
        try:
            await relay.start_collection()
            for _ in range(300):
                if attempts["count"] >= 2 and len(store.events) >= 2:
                    break
                await asyncio.sleep(0.01)
        finally:
            await relay.shutdown()

        self.assertGreaterEqual(attempts["count"], 2)
        self.assertGreaterEqual(len(store.events), 2)
        self.assertEqual(relay.upstream_count(channel), 0)


if __name__ == "__main__":
    unittest.main()
