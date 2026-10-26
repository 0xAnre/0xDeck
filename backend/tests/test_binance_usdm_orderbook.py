from __future__ import annotations

import asyncio
import json
import unittest
from contextlib import asynccontextmanager

from app.market import binance_usdm_orderbook as orderbook
from app.market.providers import relay_for_channel
from app.ws import WebSocketChannelManager, is_valid_channel

SNAPSHOT_ID = 1_000


def _snapshot(
    *,
    last_update_id: int = SNAPSHOT_ID,
    bids: list[list[str]] | None = None,
    asks: list[list[str]] | None = None,
) -> dict[str, object]:
    return {
        "lastUpdateId": last_update_id,
        "E": 1_792_000_000_000,
        "T": 1_792_000_000_000,
        "bids": bids if bids is not None else [["79999.0", "2.0"], ["79998.0", "3.0"]],
        "asks": asks if asks is not None else [["80001.0", "1.5"], ["80002.0", "4.0"]],
    }


def _diff(
    *,
    first: int,
    final: int,
    previous: int,
    bids: list[list[str]] | None = None,
    asks: list[list[str]] | None = None,
    symbol: str = "BTCUSDT",
    event_type: str = "depthUpdate",
) -> dict[str, object]:
    return {
        "e": event_type,
        "E": 1_792_000_000_000,
        "T": 1_792_000_000_000,
        "s": symbol,
        "ps": symbol,
        "st": 1,
        "U": first,
        "u": final,
        "pu": previous,
        "b": bids if bids is not None else [["79999.0", "2.5"]],
        "a": asks if asks is not None else [["80001.0", "1.25"]],
    }


def _state_from_snapshot() -> orderbook.OrderBookState:
    state = orderbook.OrderBookState()
    state.begin_resync()
    snapshot = orderbook.parse_orderbook_snapshot(_snapshot())
    assert snapshot is not None
    assert state.apply_snapshot(snapshot) is True
    return state


class OrderBookParsingTests(unittest.TestCase):
    def test_parses_snapshot_levels(self) -> None:
        snapshot = orderbook.parse_orderbook_snapshot(_snapshot())
        assert snapshot is not None
        self.assertEqual(snapshot.last_update_id, SNAPSHOT_ID)
        self.assertEqual(snapshot.bids, {79999.0: 2.0, 79998.0: 3.0})
        self.assertEqual(snapshot.asks, {80001.0: 1.5, 80002.0: 4.0})

    def test_parses_combined_and_raw_diff_envelopes(self) -> None:
        raw = json.dumps(_diff(first=1_001, final=1_001, previous=SNAPSHOT_ID))
        wrapped = json.dumps(
            {
                "stream": "btcusdt@depth@100ms",
                "data": _diff(first=1_001, final=1_001, previous=SNAPSHOT_ID),
            }
        )
        self.assertEqual(
            orderbook.parse_orderbook_diff_ws_payload(raw),
            orderbook.parse_orderbook_diff_ws_payload(wrapped),
        )

    def test_rejects_malformed_snapshots_and_diffs(self) -> None:
        for payload in (
            None,
            [],
            {"bids": [], "asks": []},
            _snapshot(last_update_id=0),
            _snapshot(bids=[["bad-price", "1"]]),
            _snapshot(asks=[["80001", "0"]]),
        ):
            self.assertIsNone(orderbook.parse_orderbook_snapshot(payload), payload)

        invalid_diffs: list[object] = [
            None,
            {"e": "depthUpdate"},
            _diff(first=5, final=4, previous=1),
            _diff(first=0, final=1, previous=1),
            _diff(first=1, final=2, previous=1, symbol="ETHUSDT"),
            _diff(first=1, final=2, previous=1, event_type="aggTrade"),
            _diff(first=1, final=2, previous=1, bids=[["79999", "-1"]]),
            _diff(first=1, final=2, previous=1, asks=[["bad", "1"]]),
        ]
        for payload in invalid_diffs:
            self.assertIsNone(
                orderbook.normalize_orderbook_diff_event(payload),
                payload,
            )


class OrderBookSynchronizationTests(unittest.TestCase):
    def test_buffers_diff_updates_until_the_snapshot_is_applied(self) -> None:
        state = orderbook.OrderBookState()
        state.begin_resync()
        buffered = orderbook.normalize_orderbook_diff_event(
            _diff(first=1_001, final=1_001, previous=SNAPSHOT_ID)
        )
        assert buffered is not None
        state.on_diff(buffered)

        self.assertFalse(state.synced)
        self.assertEqual(state.best_bid(), None)
        self.assertEqual(len(state.buffer), 1)

        snapshot = orderbook.parse_orderbook_snapshot(_snapshot())
        assert snapshot is not None
        self.assertTrue(state.apply_snapshot(snapshot))
        self.assertTrue(state.synced)
        self.assertEqual(state.bids[79999.0], 2.5)
        self.assertEqual(state.last_event_u, 1_001)
        self.assertEqual(state.buffer, [])

    def test_drops_buffered_events_already_covered_by_the_snapshot(self) -> None:
        state = orderbook.OrderBookState()
        state.begin_resync()
        for event in (
            _diff(first=900, final=999, previous=899),
            _diff(first=1_001, final=1_001, previous=SNAPSHOT_ID),
        ):
            parsed = orderbook.normalize_orderbook_diff_event(event)
            assert parsed is not None
            state.on_diff(parsed)

        snapshot = orderbook.parse_orderbook_snapshot(_snapshot())
        assert snapshot is not None
        self.assertTrue(state.apply_snapshot(snapshot))
        # The stale event is dropped, the first valid window event applies.
        self.assertEqual(state.last_event_u, 1_001)
        self.assertEqual(state.bids[79999.0], 2.5)

    def test_first_applied_event_must_span_the_snapshot_update_id(self) -> None:
        for event in (
            # Starts after the snapshot: updates 1001-ish were never seen.
            _diff(first=1_002, final=1_003, previous=SNAPSHOT_ID + 1),
            # Ends before the snapshot+1 window even though it was not dropped.
            _diff(first=990, final=1_000, previous=989),
        ):
            state = orderbook.OrderBookState()
            state.begin_resync()
            parsed = orderbook.normalize_orderbook_diff_event(event)
            assert parsed is not None
            state.on_diff(parsed)
            snapshot = orderbook.parse_orderbook_snapshot(_snapshot())
            assert snapshot is not None
            self.assertFalse(state.apply_snapshot(snapshot))
            self.assertTrue(state.needs_resync)
            self.assertFalse(state.synced)

    def test_requires_pu_continuity_for_later_events(self) -> None:
        state = _state_from_snapshot()
        first = orderbook.normalize_orderbook_diff_event(
            _diff(first=1_001, final=1_001, previous=SNAPSHOT_ID)
        )
        gap = orderbook.normalize_orderbook_diff_event(
            _diff(first=1_010, final=1_010, previous=1_005)
        )
        assert first is not None and gap is not None
        state.on_diff(first)
        self.assertTrue(state.synced)
        state.on_diff(gap)
        self.assertTrue(state.needs_resync)

    def test_ignores_duplicate_live_updates(self) -> None:
        state = _state_from_snapshot()
        event = orderbook.normalize_orderbook_diff_event(
            _diff(first=1_001, final=1_001, previous=SNAPSHOT_ID)
        )
        assert event is not None
        state.on_diff(event)
        state.on_diff(event)
        self.assertFalse(state.needs_resync)
        self.assertEqual(state.last_event_u, 1_001)

    def test_quantity_zero_removes_a_level(self) -> None:
        state = _state_from_snapshot()
        removal = orderbook.normalize_orderbook_diff_event(
            _diff(
                first=1_001,
                final=1_001,
                previous=SNAPSHOT_ID,
                bids=[["79999.0", "0"]],
                asks=[["80001.0", "0"]],
            )
        )
        assert removal is not None
        state.on_diff(removal)
        self.assertNotIn(79999.0, state.bids)
        self.assertNotIn(80001.0, state.asks)
        self.assertEqual(state.best_bid(), 79998.0)
        self.assertEqual(state.best_ask(), 80002.0)

    def test_resync_clears_the_book_and_buffers_again(self) -> None:
        state = _state_from_snapshot()
        state.mark_needs_resync()
        state.begin_resync()
        self.assertFalse(state.synced)
        self.assertEqual(state.bids, {})
        self.assertEqual(state.asks, {})


class OrderBookMathTests(unittest.TestCase):
    def _wide_state(self) -> orderbook.OrderBookState:
        state = orderbook.OrderBookState()
        state.begin_resync()
        snapshot = orderbook.parse_orderbook_snapshot(
            _snapshot(
                bids=[
                    ["99.5", "1"],
                    ["99.0", "2"],
                    ["98.0", "3"],
                ],
                asks=[
                    ["100.5", "1"],
                    ["101.0", "4"],
                    ["102.0", "5"],
                ],
            )
        )
        assert snapshot is not None
        assert state.apply_snapshot(snapshot) is True
        return state

    def test_notional_imbalance_and_coverage(self) -> None:
        state = self._wide_state()
        sample = orderbook.compute_orderbook_sample(state, 1.0, 1_792_000_000_000)
        assert sample is not None
        self.assertEqual(sample["mid"], 100.0)
        self.assertAlmostEqual(float(sample["bid_notional"]), 297.5)
        self.assertAlmostEqual(float(sample["ask_notional"]), 504.5)
        self.assertAlmostEqual(
            float(sample["imbalance"]),
            100.0 * (297.5 - 504.5) / (297.5 + 504.5),
        )
        self.assertAlmostEqual(float(sample["bid_coverage_pct"]), 2.0)
        self.assertAlmostEqual(float(sample["ask_coverage_pct"]), 2.0)
        self.assertTrue(sample["complete"])

    def test_incomplete_coverage_is_not_a_complete_distance_measurement(self) -> None:
        state = self._wide_state()
        sample = orderbook.compute_orderbook_sample(state, 2.5, 1_792_000_000_000)
        assert sample is not None
        self.assertFalse(sample["complete"])
        self.assertLess(float(sample["bid_coverage_pct"]), 2.5)
        self.assertLess(float(sample["ask_coverage_pct"]), 2.5)

    def test_distance_samples_are_independent(self) -> None:
        state = self._wide_state()
        tight = orderbook.compute_orderbook_sample(state, 0.25, 1)
        wide = orderbook.compute_orderbook_sample(state, 2.5, 1)
        assert tight is not None and wide is not None
        self.assertNotEqual(tight["distance"], wide["distance"])
        self.assertNotAlmostEqual(
            float(tight["bid_notional"]),
            float(wide["bid_notional"]),
        )
        self.assertEqual(tight["id"].split("|")[2], "0.25")
        self.assertEqual(wide["id"].split("|")[2], "2.5")

    def test_imbalance_is_clamped_and_rejects_unknown_distances(self) -> None:
        state = orderbook.OrderBookState()
        state.begin_resync()
        snapshot = orderbook.parse_orderbook_snapshot(
            _snapshot(bids=[["99.9", "1000000"]], asks=[["100.1", "0.000001"]])
        )
        assert snapshot is not None
        assert state.apply_snapshot(snapshot) is True
        sample = orderbook.compute_orderbook_sample(state, 0.25, 1)
        assert sample is not None
        self.assertLessEqual(float(sample["imbalance"]), 100.0)
        self.assertGreater(float(sample["imbalance"]), 99.9)
        self.assertIsNone(orderbook.compute_orderbook_sample(state, 5.0, 1))


class OrderBookChannelTests(unittest.TestCase):
    def test_channel_is_valid_and_maps_to_the_orderbook_relay(self) -> None:
        channel = orderbook.ORDERBOOK_CHANNEL
        self.assertTrue(is_valid_channel(channel))
        self.assertEqual(orderbook.parse_orderbook_channel(channel), "BTCUSDT")
        self.assertIs(
            relay_for_channel(channel),
            orderbook.binance_orderbook_collector,
        )

    def test_other_channels_are_not_orderbook_channels(self) -> None:
        self.assertIsNone(
            orderbook.parse_orderbook_channel("binance.usdm.btcusdt.kline.1m")
        )
        self.assertIsNone(
            orderbook.parse_orderbook_channel("binance.usdm.btcusdt.orderbook.1m")
        )


class _RecordingStore:
    def __init__(self) -> None:
        self.samples: list[dict] = []

    def insert_samples(self, samples: list[dict]) -> int:
        self.samples.extend(samples)
        return len(samples)


def _connect_for_connections(
    connections: list[list[object]],
    *,
    close_connections: bool = False,
    close_first_n: int | None = None,
):
    connection_index = 0

    @asynccontextmanager
    async def fake_connect(_url: str):
        nonlocal connection_index
        this_connection = connection_index
        connection_index += 1
        frames = connections.pop(0) if connections else []
        should_close = close_connections or (
            close_first_n is not None and this_connection < close_first_n
        )

        class Upstream:
            index = 0

            async def recv(self_inner) -> str:
                if self_inner.index < len(frames):
                    frame = frames[self_inner.index]
                    self_inner.index += 1
                    await asyncio.sleep(0.003)
                    return frame if isinstance(frame, str) else json.dumps(frame)
                if should_close:
                    raise ConnectionError("upstream closed")
                # Keep the upstream open without emitting more frames.
                await asyncio.sleep(3600)
                raise AssertionError("unreachable")

        yield Upstream()

    return fake_connect


def _snapshot_fetcher(counter: list[int], payload: dict[str, object]):
    def fetch(_url: str) -> object:
        counter.append(1)
        return payload

    return fetch


class BinanceUsdmOrderBookCollectorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = WebSocketChannelManager()
        self.published: list[tuple[str, dict]] = []
        self.store = _RecordingStore()
        self.fetch_count: list[int] = []

        async def spy_publish(channel: str, payload: dict) -> None:
            self.published.append((channel, payload))

        self.manager.publish = spy_publish  # type: ignore[method-assign]

    async def _wait_until(self, predicate) -> None:
        for _ in range(400):
            if predicate():
                return
            await asyncio.sleep(0.01)
        self.fail("condition was not reached before timeout")

    async def test_collects_samples_with_zero_clients_and_persists_first(self) -> None:
        collector = orderbook.BinanceUsdmOrderBookCollector(
            self.manager,
            connect_ws=_connect_for_connections(
                [[_diff(first=1_001, final=1_001, previous=SNAPSHOT_ID)]]
            ),
            fetch_snapshot=_snapshot_fetcher(self.fetch_count, _snapshot()),
            store=self.store,  # type: ignore[arg-type]
            sample_interval_s=0.02,
            stale_after_s=60,
            base_reconnect_delay_s=0.01,
            max_reconnect_delay_s=0.01,
        )
        try:
            await collector.start_collection()
            await collector.start_collection()
            self.assertEqual(collector.upstream_count(orderbook.ORDERBOOK_CHANNEL), 1)

            await self._wait_until(lambda: len(self.published) >= 4)
            self.assertEqual(self.manager.connection_count(orderbook.ORDERBOOK_CHANNEL), 0)
            self.assertGreaterEqual(len(self.store.samples), 4)
            self.assertEqual(
                sorted({float(sample["distance"]) for sample in self.store.samples}),
                [0.25, 0.5, 1.0, 2.5],
            )
            self.assertEqual(
                {channel for channel, _ in self.published},
                {orderbook.ORDERBOOK_CHANNEL},
            )
            for _, payload in self.published:
                self.assertEqual(payload["source"], "binance")
                self.assertIn("imbalance", payload)
                self.assertIn("complete", payload)
                self.assertEqual(payload["id"], f"binance|BTCUSDT|{payload['distance']}|{payload['time']}")
        finally:
            await collector.shutdown()

    async def test_buffers_diffs_while_the_snapshot_is_in_flight(self) -> None:
        snapshot_started = asyncio.Event()
        release_snapshot = asyncio.Event()

        async def slow_fetch(_url: str) -> object:
            self.fetch_count.append(1)
            snapshot_started.set()
            await release_snapshot.wait()
            return _snapshot()

        collector = orderbook.BinanceUsdmOrderBookCollector(
            self.manager,
            connect_ws=_connect_for_connections(
                [[_diff(first=1_001, final=1_001, previous=SNAPSHOT_ID)]]
            ),
            fetch_snapshot=slow_fetch,
            store=self.store,  # type: ignore[arg-type]
            sample_interval_s=60,
            stale_after_s=60,
            base_reconnect_delay_s=0.02,
            max_reconnect_delay_s=0.02,
        )
        try:
            await collector.start_collection()
            await self._wait_until(lambda: snapshot_started.is_set())
            await asyncio.sleep(0.05)
            # The diff arrived before the snapshot and is buffered, not applied.
            self.assertFalse(collector.state.synced)
            self.assertEqual(len(collector.state.buffer), 1)

            release_snapshot.set()
            await self._wait_until(lambda: collector.state.synced)
            self.assertEqual(collector.state.bids[79999.0], 2.5)
            self.assertEqual(collector.state.last_event_u, 1_001)
        finally:
            await collector.shutdown()

    async def test_reconnect_fetches_a_fresh_snapshot(self) -> None:
        def advancing_snapshot_fetcher(_url: str) -> object:
            self.fetch_count.append(1)
            return _snapshot(last_update_id=SNAPSHOT_ID + len(self.fetch_count) - 1)

        collector = orderbook.BinanceUsdmOrderBookCollector(
            self.manager,
            connect_ws=_connect_for_connections(
                [
                    [_diff(first=1_001, final=1_001, previous=SNAPSHOT_ID)],
                    [_diff(first=1_002, final=1_002, previous=1_001)],
                ],
                close_first_n=1,
            ),
            fetch_snapshot=advancing_snapshot_fetcher,
            store=self.store,  # type: ignore[arg-type]
            sample_interval_s=60,
            stale_after_s=60,
            base_reconnect_delay_s=0.02,
            max_reconnect_delay_s=0.02,
        )
        try:
            await collector.start_collection()
            await self._wait_until(lambda: len(self.fetch_count) >= 2)
            await self._wait_until(lambda: collector.state.last_event_u == 1_002)
        finally:
            await collector.shutdown()

    async def test_staleness_fetches_a_fresh_snapshot_while_connected(self) -> None:
        collector = orderbook.BinanceUsdmOrderBookCollector(
            self.manager,
            connect_ws=_connect_for_connections(
                [[_diff(first=1_001, final=1_001, previous=SNAPSHOT_ID)]]
            ),
            fetch_snapshot=_snapshot_fetcher(self.fetch_count, _snapshot()),
            store=self.store,  # type: ignore[arg-type]
            sample_interval_s=60,
            stale_after_s=0.03,
            base_reconnect_delay_s=0.02,
            max_reconnect_delay_s=0.02,
        )
        try:
            await collector.start_collection()
            await self._wait_until(lambda: len(self.fetch_count) >= 2)
        finally:
            await collector.shutdown()


if __name__ == "__main__":
    unittest.main()
