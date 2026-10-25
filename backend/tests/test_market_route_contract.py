from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.main import app
from app.market.common import HistoryPage
from app.market.providers import (
    BINANCE_PROVIDER,
    HYPERLIQUID_PROVIDER,
    MarketDataProvider,
    provider_for_channel,
    relay_for_channel,
)
from app.ws import is_valid_channel

# --------------------------------------------------------------------------
# Hermeticity guard.
#
# These tests exercise the real FastAPI routes with mocked upstream data. A
# live request here passes on a developer machine and fails on a
# restricted-egress CI runner (GitHub Actions cannot reach Binance from US
# egress) — that is exactly how PR #141's backend job broke: the Binance
# volume-profile route called a module-level fetcher instead of going through
# `BINANCE_PROVIDER`, so the provider patch never intercepted it.
#
# `setUpModule` makes any *unmocked* outbound connection in this module raise
# immediately, so the failure is loud and local instead of a 502 only in CI.
# `TestClient` reaches the app through Starlette's ASGI transport, so these
# seams are only used by real egress.
# --------------------------------------------------------------------------


class LiveNetworkBlocked(AssertionError):
    """A route-contract test tried to reach a real exchange endpoint."""


def _blocked_live_network(*args: object, **kwargs: object) -> None:
    raise LiveNetworkBlocked(
        "route-contract tests must be hermetic: patch the provider/relay call "
        "site instead of reaching the live upstream"
    )


LIVE_NETWORK_SEAMS = (
    "socket.socket.connect",
    "socket.socket.connect_ex",
    "socket.create_connection",
    "httpx.HTTPTransport.handle_request",
    "httpx.AsyncHTTPTransport.handle_async_request",
    "websockets.connect",
    "websockets.asyncio.client.connect",
)

# The socket seams are the load-bearing part of the guard (every real HTTP or
# WebSocket client ends up there); the library seams only add a clearer message
# and tolerate a renamed client API in a future dependency bump.
LIVE_NETWORK_REQUIRED_SEAMS = ("socket.socket.connect", "socket.create_connection")

_LIVE_NETWORK_PATCHERS: list[object] = []


def setUpModule() -> None:  # noqa: N802 - unittest hook
    for seam in LIVE_NETWORK_SEAMS:
        try:
            patcher = patch(seam, _blocked_live_network)
            patcher.start()
        except (AttributeError, ModuleNotFoundError):
            if seam in LIVE_NETWORK_REQUIRED_SEAMS:
                raise
            continue
        _LIVE_NETWORK_PATCHERS.append(patcher)


def tearDownModule() -> None:  # noqa: N802 - unittest hook
    while _LIVE_NETWORK_PATCHERS:
        _LIVE_NETWORK_PATCHERS.pop().stop()  # type: ignore[attr-defined]

# --------------------------------------------------------------------------
# Route/path contract shared with the frontend.
#
# These literals are mirrored by
# `src/market/marketApiRouteContract.test.ts`. The frontend test asserts the
# exact paths the client builds; this test asserts the FastAPI app registers
# exactly those paths and accepts the intervals the UI can request. A live
# `GET /api/market/hyperliquid/btc/klines` 404 (server running an older
# checkout without the Hyperliquid routes) fails one of the two.
# --------------------------------------------------------------------------

API_PREFIX = "/api"

MARKET_KLINES_SUFFIXES = (
    "",
    "/history",
    "/daily-context",
    "/weekly-context",
    "/monthly-context",
    "/quarterly-context",
    "/yearly-context",
    "/volume-profile",
)

MARKET_KLINES_BASE_PATHS = {
    "binance": "/market/binance/usdm/btcusdt/klines",
    "hyperliquid": "/market/hyperliquid/btc/klines",
}

CHART_INTERVALS = ("1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w")

# Intervals the UI can request per VWAP context level. Mirrors
# `CONTEXT_INTERVAL_MATRIX` in the frontend test, which derives the same matrix
# from `MARKET_INDICATOR_DEFINITIONS`.
CONTEXT_INTERVAL_MATRIX = {
    "/daily-context": CHART_INTERVALS,
    "/weekly-context": ("1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"),
    "/monthly-context": ("4h", "1d"),
    "/quarterly-context": ("4h", "1d"),
    "/yearly-context": ("1d", "1w"),
}

WS_CHANNELS = {
    "binance": "binance.usdm.btcusdt.kline.{interval}",
    "hyperliquid": "hyperliquid.btc.kline.{interval}",
}

PROVIDERS: dict[str, MarketDataProvider] = {
    "binance": BINANCE_PROVIDER,
    "hyperliquid": HYPERLIQUID_PROVIDER,
}

# Every route resolves its context fetcher through its provider at call time,
# so this is where the fetchers must be patched for both exchanges.
CONTEXT_PATCH_TARGETS = {
    "binance": "app.market.binance_usdm_btc.fetch_klines_{level}_context_sync",
    "hyperliquid": "app.market.hyperliquid_btc.fetch_klines_{level}_context_sync",
}

# Levels whose fetcher rejects intervals it cannot serve (everything else
# accepts every chart interval).
STRICT_CONTEXT_LEVELS = ("monthly", "quarterly", "yearly")


def registered_market_paths() -> set[str]:
    paths: set[str] = set()
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/api/market/"):
            paths.add(route.path)
    return paths


def expected_market_paths() -> set[str]:
    return {
        f"{API_PREFIX}{MARKET_KLINES_BASE_PATHS[exchange]}{suffix}"
        for exchange in MARKET_KLINES_BASE_PATHS
        for suffix in MARKET_KLINES_SUFFIXES
    }


def klines_url(exchange: str, suffix: str = "") -> str:
    return f"{API_PREFIX}{MARKET_KLINES_BASE_PATHS[exchange]}{suffix}"


class MarketRouteContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_app_registers_exactly_the_market_routes_the_frontend_builds(self) -> None:
        self.assertEqual(registered_market_paths(), expected_market_paths())

    def test_hyperliquid_klines_route_is_registered(self) -> None:
        # The user-visible failure mode: a server without these routes answers
        # 404 `{"detail": "Not Found"}` and the chart shows "Could not load data".
        self.assertIn("/api/market/hyperliquid/btc/klines", registered_market_paths())
        self.assertIn(
            "/api/market/hyperliquid/btc/klines/history",
            registered_market_paths(),
        )

    def test_live_old_backend_path_would_404(self) -> None:
        # Guards the contract itself: an unregistered market path must 404, so
        # the assertion above is meaningful (not a wildcard/catch-all route).
        response = self.client.get("/api/market/does-not-exist/btc/klines")
        self.assertEqual(response.status_code, 404)

    def test_every_ws_channel_the_frontend_uses_maps_to_a_relay(self) -> None:
        for exchange, template in WS_CHANNELS.items():
            for interval in CHART_INTERVALS:
                channel = template.format(interval=interval)
                self.assertTrue(is_valid_channel(channel), channel)
                provider = provider_for_channel(channel)
                self.assertIsNotNone(provider, channel)
                assert provider is not None  # for type checkers
                self.assertEqual(provider.exchange, exchange, channel)
                self.assertIsNotNone(relay_for_channel(channel), channel)
                self.assertEqual(provider.parse_channel_interval(channel), interval)


class MarketKlinesIntervalAcceptanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def _assert_klines_accepts_every_interval(self, exchange: str) -> None:
        provider = PROVIDERS[exchange]
        with patch.object(provider, "fetch_klines_sync", return_value=[]):
            for interval in CHART_INTERVALS:
                response = self.client.get(
                    klines_url(exchange),
                    params={"interval": interval, "limit": 3},
                )
                self.assertEqual(
                    response.status_code,
                    200,
                    f"{exchange} {interval}: {response.text[:200]}",
                )
                body = response.json()
                self.assertEqual(body["interval"], interval)
                self.assertEqual(body["candles"], [])

    def test_binance_klines_accepts_every_chart_interval(self) -> None:
        self._assert_klines_accepts_every_interval("binance")

    def test_hyperliquid_klines_accepts_every_chart_interval(self) -> None:
        self._assert_klines_accepts_every_interval("hyperliquid")

    def test_hyperliquid_klines_returns_200_for_one_minute(self) -> None:
        # Exact request the browser makes on a fresh Hyperliquid 1m chart.
        with patch.object(
            HYPERLIQUID_PROVIDER,
            "fetch_klines_sync",
            return_value=[],
        ) as fetch:
            response = self.client.get(
                "/api/market/hyperliquid/btc/klines",
                params={"interval": "1m", "limit": 1000},
            )

        self.assertEqual(response.status_code, 200)
        fetch.assert_called_once_with("1m", 1000)
        self.assertEqual(response.json()["exchange"], "hyperliquid")

    def test_hyperliquid_rejects_source_only_interval_on_chart_route(self) -> None:
        response = self.client.get(
            "/api/market/hyperliquid/btc/klines",
            params={"interval": "3m"},
        )
        self.assertEqual(response.status_code, 400)

    def test_history_accepts_every_chart_interval(self) -> None:
        for exchange in MARKET_KLINES_BASE_PATHS:
            provider = PROVIDERS[exchange]
            with patch.object(
                provider,
                "fetch_history_before_sync",
                return_value=HistoryPage(candles=[]),
            ) as fetch:
                for interval in CHART_INTERVALS:
                    response = self.client.get(
                        klines_url(exchange, "/history"),
                        params={"interval": interval, "before": 1_700_000_000},
                    )
                    self.assertEqual(
                        response.status_code,
                        200,
                        f"{exchange} history {interval}: {response.text[:200]}",
                    )
                    self.assertEqual(response.json()["candles"], [])
                fetch.assert_called_with(CHART_INTERVALS[-1], 1_700_000_000)


class MarketContextIntervalAcceptanceTests(unittest.TestCase):
    """The context routes must accept every interval the UI can request."""

    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_context_routes_accept_their_ui_requestable_intervals(self) -> None:
        for exchange, template in CONTEXT_PATCH_TARGETS.items():
            for suffix, intervals in CONTEXT_INTERVAL_MATRIX.items():
                level = suffix.strip("/").removesuffix("-context")
                with patch(template.format(level=level)) as fetch:
                    fetch.return_value = []
                    for interval in intervals:
                        response = self.client.get(
                            klines_url(exchange, suffix),
                            params={"interval": interval},
                        )
                        self.assertEqual(
                            response.status_code,
                            200,
                            f"{exchange} {suffix} {interval}: {response.text[:200]}",
                        )
                        fetch.assert_called_with(interval)

    def test_strict_context_routes_reject_intervals_outside_their_matrix(self) -> None:
        # Real fetchers validate before any HTTP call, so a rejected interval is
        # a 400 with no network access.
        for exchange in MARKET_KLINES_BASE_PATHS:
            for level in STRICT_CONTEXT_LEVELS:
                suffix = f"/{level}-context"
                allowed = CONTEXT_INTERVAL_MATRIX[suffix]
                for interval in CHART_INTERVALS:
                    if interval in allowed:
                        continue
                    response = self.client.get(
                        klines_url(exchange, suffix),
                        params={"interval": interval},
                    )
                    self.assertEqual(
                        response.status_code,
                        400,
                        f"{exchange} {suffix} {interval} should be rejected",
                    )


class MarketVolumeProfilePathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_volume_profile_route_is_registered_for_both_exchanges(self) -> None:
        self.assertIn(
            "/api/market/binance/usdm/btcusdt/klines/volume-profile",
            registered_market_paths(),
        )
        self.assertIn(
            "/api/market/hyperliquid/btc/klines/volume-profile",
            registered_market_paths(),
        )

    def test_volume_profile_route_returns_200_for_both_exchanges(self) -> None:
        # The route must resolve the source klines through its provider object.
        # Patching the provider therefore *proves* interception: if a route
        # bypassed the seam (module-level fetcher), `fetch` would never be
        # called and the real upstream would be reached.
        for exchange, provider in PROVIDERS.items():
            with patch.object(
                provider,
                "fetch_volume_profile_source_klines_sync",
                return_value=("1m", []),
            ) as fetch:
                response = self.client.get(
                    klines_url(exchange, "/volume-profile"),
                    params={"start_time": 1_700_000_000, "end_time": 1_700_003_600},
                )
            self.assertEqual(
                response.status_code,
                200,
                f"{exchange}: {response.text[:200]}",
            )
            fetch.assert_called_once_with(1_700_000_000, 1_700_003_600)
            body = response.json()
            self.assertEqual(body["exchange"], exchange)
            self.assertEqual(body["symbol"], provider.symbol)
            self.assertEqual(body["source_interval"], "1m")
            self.assertEqual(body["start_time"], 1_700_000_000)
            self.assertEqual(body["end_time"], 1_700_003_600)
            self.assertEqual(body["candles"], [])
            self.assertIn("available_from", body)
            self.assertIn("history_unavailable", body)

    def test_volume_profile_routes_reject_an_invalid_time_range(self) -> None:
        # Validation happens before the provider is called, so this is a 400
        # with no upstream access at all.
        for exchange, provider in PROVIDERS.items():
            with patch.object(
                provider,
                "fetch_volume_profile_source_klines_sync",
            ) as fetch:
                response = self.client.get(
                    klines_url(exchange, "/volume-profile"),
                    params={"start_time": 1_700_003_600, "end_time": 1_700_000_000},
                )
            self.assertEqual(response.status_code, 400, exchange)
            fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
