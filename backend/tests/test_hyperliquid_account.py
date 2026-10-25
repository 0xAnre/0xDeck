from __future__ import annotations

import asyncio
import json
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.market import hyperliquid_account
from app.market.providers import relay_for_channel
from app.ws import WebSocketChannelManager

ADDRESS = "0xaf68caebaa151dd592112a07e2344b3950e13561"
INVALID_ADDRESS = "0x1234"
START_MS = 1_792_000_000_000


def _fill(
    tid: int,
    time_ms: int,
    *,
    coin: str = "BTC",
    side: str = "B",
    size: str = "0.1",
    price: str = "80000.0",
    start_position: str | None = "0.0",
    direction: str = "Open Long",
) -> dict[str, object]:
    fill: dict[str, object] = {
        "coin": coin,
        "px": price,
        "sz": size,
        "side": side,
        "time": time_ms,
        "dir": direction,
        "closedPnl": "0.0",
        "hash": f"0x{tid:064x}",
        "oid": tid + 1,
        "crossed": False,
        "fee": "-0.001",
        "tid": tid,
        "cloid": "0x0",
        "feeToken": "USDC",
        "twapId": None,
    }
    if start_position is not None:
        fill["startPosition"] = start_position
    return fill


def _clearinghouse_payload() -> dict[str, object]:
    return {
        "marginSummary": {"accountValue": "1000.0"},
        "assetPositions": [
            {
                "type": "oneWay",
                "position": {
                    "coin": "BTC",
                    "szi": "-0.0463",
                    "entryPx": "80322.2",
                    "positionValue": "3719.8809",
                    "unrealizedPnl": "-0.959165",
                    "leverage": {"type": "cross", "value": 5},
                },
            },
            {
                "type": "oneWay",
                "position": {
                    "coin": "ETH",
                    "szi": "1.5",
                    "entryPx": "2300.0",
                    "leverage": {"type": "cross", "value": 3},
                },
            },
        ],
    }


class HyperliquidAccountAddressTests(unittest.TestCase):
    def test_normalizes_case_and_whitespace_to_lowercase(self) -> None:
        self.assertEqual(
            hyperliquid_account.normalize_account_address(f"  0x{ADDRESS[2:].upper()}  "),
            ADDRESS,
        )

    def test_rejects_invalid_addresses(self) -> None:
        for value in ("0x1234", ADDRESS[2:], f"{ADDRESS}00", "", "not-an-address"):
            with self.assertRaises(HTTPException) as ctx:
                hyperliquid_account.normalize_account_address(value)
            self.assertEqual(ctx.exception.status_code, 422)
        self.assertFalse(hyperliquid_account.is_valid_account_address(123))
        self.assertTrue(hyperliquid_account.is_valid_account_address(ADDRESS))


class HyperliquidAccountNormalizationTests(unittest.TestCase):
    def test_normalizes_only_non_zero_positions_and_selects_btc(self) -> None:
        body = hyperliquid_account.normalize_clearinghouse_state(
            ADDRESS,
            _clearinghouse_payload(),
        )
        self.assertEqual(body["address"], ADDRESS)
        self.assertEqual(len(body["positions"]), 2)
        btc = body["btc_position"]
        assert isinstance(btc, dict)
        self.assertEqual(btc["coin"], "BTC")
        self.assertEqual(btc["side"], "short")
        self.assertEqual(btc["size"], 0.0463)
        self.assertEqual(btc["signed_size"], -0.0463)
        self.assertEqual(btc["entry_price"], 80322.2)
        self.assertEqual(btc["leverage"], 5.0)

    def test_missing_btc_position_is_explicit(self) -> None:
        body = hyperliquid_account.normalize_clearinghouse_state(
            ADDRESS,
            {
                "assetPositions": [
                    {
                        "type": "oneWay",
                        "position": {"coin": "ETH", "szi": "1.5", "entryPx": "2300"},
                    }
                ]
            },
        )
        self.assertIsNone(body["btc_position"])
        self.assertEqual(len(body["positions"]), 1)

    def test_defensively_skips_zero_and_malformed_positions(self) -> None:
        body = hyperliquid_account.normalize_clearinghouse_state(
            ADDRESS,
            {
                "assetPositions": [
                    {"position": {"coin": "BTC", "szi": "0.0"}},
                    {"position": {"coin": "BTC", "szi": "not-a-number"}},
                    {"position": {}},
                    None,
                    "nope",
                ]
            },
        )
        self.assertEqual(body["positions"], [])
        self.assertIsNone(body["btc_position"])

    def test_normalizes_fill_fields_and_preserves_raw_strings_as_numbers(self) -> None:
        fill = hyperliquid_account.normalize_fill(_fill(11, START_MS, start_position="1.04274"))
        assert fill is not None
        self.assertEqual(fill["coin"], "BTC")
        self.assertEqual(fill["price"], 80000.0)
        self.assertEqual(fill["size"], 0.1)
        self.assertEqual(fill["side"], "B")
        self.assertEqual(fill["time"], START_MS)
        self.assertEqual(fill["start_position"], 1.04274)
        self.assertEqual(fill["direction"], "Open Long")
        self.assertEqual(fill["tid"], 11)

    def test_missing_start_position_is_null_not_fabricated(self) -> None:
        fill = hyperliquid_account.normalize_fill(
            _fill(12, START_MS, start_position=None)
        )
        assert fill is not None
        self.assertIsNone(fill["start_position"])

    def test_rejects_malformed_fills(self) -> None:
        for item in (
            None,
            {},
            _fill(13, START_MS, side="X"),
            _fill(14, START_MS, size="0"),
            _fill(15, START_MS, price="-1"),
            _fill(16, 0),
        ):
            self.assertIsNone(hyperliquid_account.normalize_fill(item))

    def test_identity_key_uses_tid_then_stable_fallback(self) -> None:
        with_tid = hyperliquid_account.normalize_fill(_fill(21, START_MS))
        assert with_tid is not None
        self.assertEqual(hyperliquid_account.fill_identity_key(with_tid), "tid:21")

        fallback = dict(with_tid, tid=None)
        self.assertEqual(
            hyperliquid_account.fill_identity_key(fallback),
            f"0x{21:064x}|22|{START_MS}|BTC",
        )

    def test_dedupe_removes_repeats_and_sorts_ascending(self) -> None:
        a = hyperliquid_account.normalize_fill(_fill(31, START_MS + 2))
        b = hyperliquid_account.normalize_fill(_fill(32, START_MS))
        assert a is not None and b is not None
        deduped = hyperliquid_account.dedupe_fills([a, b, dict(a)])
        self.assertEqual([fill["tid"] for fill in deduped], [32, 31])


class HyperliquidAccountFetchTests(unittest.TestCase):
    def test_user_fills_reports_the_upstream_cap(self) -> None:
        capped = [_fill(tid, START_MS + tid) for tid in range(2000)]
        with patch.object(
            hyperliquid_account,
            "_post_info",
            return_value=capped,
        ) as post:
            body = hyperliquid_account.fetch_user_fills_sync(f"0x{ADDRESS[2:].upper()}")

        self.assertEqual(post.call_args.args[0]["user"], ADDRESS)
        self.assertEqual(body["count"], 2000)
        self.assertTrue(body["truncated"])
        self.assertFalse(body["complete"])

    def test_user_fills_below_the_cap_is_complete(self) -> None:
        with patch.object(
            hyperliquid_account,
            "_post_info",
            return_value=[_fill(1, START_MS), _fill(2, START_MS + 1)],
        ):
            body = hyperliquid_account.fetch_user_fills_sync(ADDRESS)
        self.assertEqual(body["count"], 2)
        self.assertFalse(body["truncated"])
        self.assertTrue(body["complete"])

    def test_pages_forward_and_dedupes_overlapping_fill_times(self) -> None:
        # The endpoint returns fills forward from `startTime`, so the second
        # request starts at the newest first-page fill (inclusive; deduped).
        first = [_fill(tid, START_MS + tid) for tid in range(2000)]
        second = [
            _fill(1999, START_MS + 1999),
            _fill(2000, START_MS + 2000),
        ]
        with patch.object(
            hyperliquid_account,
            "_post_info",
            side_effect=[first, second],
        ) as post:
            body = hyperliquid_account.fetch_user_fills_by_time_sync(
                ADDRESS,
                START_MS,
                START_MS + 10_000,
            )

        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[1].args[0]["startTime"], START_MS + 1999)
        self.assertEqual(body["count"], 2001)
        self.assertEqual(body["pages"], 2)
        self.assertFalse(body["truncated"])

    def test_repeated_full_page_is_reported_as_truncated(self) -> None:
        full_page = [_fill(tid, START_MS + tid) for tid in range(2000)]
        with patch.object(
            hyperliquid_account,
            "_post_info",
            side_effect=[full_page, full_page],
        ):
            body = hyperliquid_account.fetch_user_fills_by_time_sync(
                ADDRESS,
                START_MS,
                START_MS + 10_000,
            )

        self.assertTrue(body["truncated"])
        self.assertEqual(body["count"], 2000)

    def test_page_budget_exhaustion_is_reported_as_truncated(self) -> None:
        pages = [
            [_fill(tid, START_MS + page * 2000 + tid) for tid in range(2000)]
            for page in range(2)
        ]
        with patch.object(
            hyperliquid_account,
            "_post_info",
            side_effect=pages,
        ):
            body = hyperliquid_account.fetch_user_fills_by_time_sync(
                ADDRESS,
                START_MS,
                START_MS + 100_000,
                max_pages=2,
            )

        self.assertTrue(body["truncated"])
        self.assertEqual(body["pages"], 2)

    def test_by_time_rejects_invalid_windows_before_any_request(self) -> None:
        with patch.object(hyperliquid_account, "_post_info") as post:
            for start, end in ((0, START_MS), (START_MS, START_MS), (10, 5)):
                with self.assertRaises(HTTPException) as ctx:
                    hyperliquid_account.fetch_user_fills_by_time_sync(
                        ADDRESS,
                        start,
                        end,
                    )
                self.assertEqual(ctx.exception.status_code, 400)
        post.assert_not_called()


class HyperliquidAccountRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_position_route_returns_normalized_btc_position(self) -> None:
        expected = hyperliquid_account.normalize_clearinghouse_state(
            ADDRESS,
            _clearinghouse_payload(),
        )
        with patch.object(
            hyperliquid_account,
            "fetch_clearinghouse_state_sync",
            return_value=expected,
        ) as fetch:
            response = self.client.get(
                f"/api/market/hyperliquid/account/{ADDRESS}/position"
            )

        self.assertEqual(response.status_code, 200)
        fetch.assert_called_once_with(ADDRESS)
        self.assertEqual(response.json()["btc_position"]["side"], "short")

    def test_fills_routes_are_wired_to_the_account_module(self) -> None:
        body = {
            "address": ADDRESS,
            "fills": [],
            "count": 0,
            "truncated": False,
            "complete": True,
        }
        with patch.object(
            hyperliquid_account,
            "fetch_user_fills_sync",
            return_value=body,
        ) as recent:
            response = self.client.get(f"/api/market/hyperliquid/account/{ADDRESS}/fills")
        self.assertEqual(response.status_code, 200)
        recent.assert_called_once_with(ADDRESS)

        with patch.object(
            hyperliquid_account,
            "fetch_user_fills_by_time_sync",
            return_value=body,
        ) as windowed:
            response = self.client.get(
                f"/api/market/hyperliquid/account/{ADDRESS}/fills/by-time",
                params={"start_time": START_MS, "end_time": START_MS + 60_000},
            )
        self.assertEqual(response.status_code, 200)
        windowed.assert_called_once_with(ADDRESS, START_MS, START_MS + 60_000)

    def test_invalid_address_is_rejected_with_422(self) -> None:
        for suffix in ("position", "fills"):
            response = self.client.get(
                f"/api/market/hyperliquid/account/{INVALID_ADDRESS}/{suffix}"
            )
            self.assertEqual(response.status_code, 422, suffix)


class HyperliquidAccountRelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = WebSocketChannelManager()
        self.sent: list[dict] = []
        self.published: list[tuple[str, dict]] = []

        async def spy_publish(channel: str, payload: dict) -> None:
            self.published.append((channel, payload))

        self.manager.publish = spy_publish  # type: ignore[method-assign]

        @asynccontextmanager
        async def fake_connect(_url: str):
            class Upstream:
                async def send(self_inner, raw: str) -> None:
                    self.sent.append(json.loads(raw))

                async def recv(self_inner) -> str:
                    await asyncio.sleep(0.02)
                    fill = _fill(100 + len(self.published), START_MS)
                    return json.dumps(
                        {
                            "channel": "userFills",
                            "data": {
                                "isSnapshot": len(self.published) == 0,
                                "user": ADDRESS,
                                "fills": [fill],
                            },
                        }
                    )

            yield Upstream()

        self.relay = hyperliquid_account.HyperliquidUserFillsRelay(
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

    async def test_subscribes_once_per_channel_and_relays_normalized_fills(self) -> None:
        self.channel = hyperliquid_account.account_user_fills_channel(ADDRESS)
        socket_a = await self._connect_client()
        await self.relay.on_client_connected(self.channel)
        socket_b = await self._connect_client()
        await self.relay.on_client_connected(self.channel)

        self.assertEqual(self.relay.upstream_count(self.channel), 1)

        for _ in range(100):
            if self.published:
                break
            await asyncio.sleep(0.01)

        self.assertEqual(len(self.sent), 1)
        self.assertEqual(
            self.sent[0],
            {
                "method": "subscribe",
                "subscription": {"type": "userFills", "user": ADDRESS},
            },
        )
        channel, payload = self.published[0]
        self.assertEqual(channel, self.channel)
        self.assertTrue(payload["is_snapshot"])
        self.assertEqual(payload["user"], ADDRESS)
        self.assertEqual(payload["fills"][0]["coin"], "BTC")

        self.manager.disconnect(self.channel, socket_a)
        await self.relay.on_client_disconnected(self.channel)
        self.assertEqual(self.relay.upstream_count(self.channel), 1)

        self.manager.disconnect(self.channel, socket_b)
        await self.relay.on_client_disconnected(self.channel)
        self.assertEqual(self.relay.upstream_count(self.channel), 0)

    async def test_relay_routing_returns_the_account_relay(self) -> None:
        channel = hyperliquid_account.account_user_fills_channel(ADDRESS)
        self.assertIs(
            relay_for_channel(channel),
            hyperliquid_account.hyperliquid_user_fills_relay,
        )


if __name__ == "__main__":
    unittest.main()
