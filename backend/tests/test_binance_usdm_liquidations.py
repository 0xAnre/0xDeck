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


class BinanceUsdmLiquidationsRelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = WebSocketChannelManager()
        self.channel = liquidations.LIQUIDATIONS_CHANNEL
        self.published: list[tuple[str, dict]] = []

        async def spy_publish(channel: str, payload: dict) -> None:
            self.published.append((channel, payload))

        self.manager.publish = spy_publish  # type: ignore[method-assign]

        @asynccontextmanager
        async def fake_connect(_url: str):
            class Upstream:
                async def recv(self_inner) -> str:
                    await asyncio.sleep(0.02)
                    return json.dumps(_force_order())

            yield Upstream()

        self.relay = liquidations.BinanceUsdmLiquidationsRelay(
            self.manager,
            connect_ws=fake_connect,
        )

    async def _connect_client(self) -> MagicMock:
        socket = MagicMock()
        socket.accept = AsyncMock()
        socket.send_text = AsyncMock()
        await self.manager.connect(self.channel, socket)
        return socket

    async def asyncTearDown(self) -> None:
        await self.relay.shutdown()

    async def test_dedupes_upstream_per_channel_and_relays_normalized_events(self) -> None:
        socket_a = await self._connect_client()
        await self.relay.on_client_connected(self.channel)
        socket_b = await self._connect_client()
        await self.relay.on_client_connected(self.channel)

        self.assertEqual(self.relay.upstream_count(self.channel), 1)

        for _ in range(100):
            if self.published:
                break
            await asyncio.sleep(0.01)

        self.assertTrue(self.published)
        channel, payload = self.published[0]
        self.assertEqual(channel, self.channel)
        self.assertEqual(payload["side"], "long")
        self.assertEqual(payload["notional"], 40000.0)
        self.assertIn("id", payload)

        self.manager.disconnect(self.channel, socket_a)
        await self.relay.on_client_disconnected(self.channel)
        self.assertEqual(self.relay.upstream_count(self.channel), 1)

        self.manager.disconnect(self.channel, socket_b)
        await self.relay.on_client_disconnected(self.channel)
        self.assertEqual(self.relay.upstream_count(self.channel), 0)


if __name__ == "__main__":
    unittest.main()
