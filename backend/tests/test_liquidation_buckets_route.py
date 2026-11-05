from __future__ import annotations

import math
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import LIQUIDATIONS_BUCKETS_PATH, LIQUIDATIONS_HISTORY_PATH, app
from app.market.liquidation_store import (
    LIQUIDATIONS_DB_ENV,
    LIQUIDATION_BUCKET_INTERVAL_MS,
    MAX_BUCKET_COUNT,
    MONDAY_EPOCH_OFFSET_MS,
    get_liquidation_store,
)

# 2026-11-23T00:00:00Z: a Monday and a bucket boundary for every interval,
# including `1w` (whose buckets are floored on the Monday epoch offset).
BASE_TIME_MS = 1_795_392_000_000
BASE_SECONDS = BASE_TIME_MS // 1000


def _event(
    event_id: str,
    trade_time: int,
    *,
    side: str = "long",
    notional: float = 1_000.0,
) -> dict[str, object]:
    return {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "side": side,
        "price": 80_000.0,
        "quantity": notional / 80_000.0,
        "notional": notional,
        "time": trade_time,
        "trade_time": trade_time,
        "id": event_id,
    }


def _reference_bucket_time(trade_time_ms: int, interval: str) -> int:
    """Mirror of `liquidationBucketTime` in src/market/aggregatedLiquidations.ts."""
    duration_ms = LIQUIDATION_BUCKET_INTERVAL_MS[interval]
    if interval == "1w":
        weeks = (trade_time_ms - MONDAY_EPOCH_OFFSET_MS) // duration_ms
        return (MONDAY_EPOCH_OFFSET_MS + weeks * duration_ms) // 1000
    return (trade_time_ms // duration_ms) * (duration_ms // 1000)


def _reference_buckets(
    events: list[dict[str, object]], interval: str
) -> list[dict[str, object]]:
    """Mirror of `bucketAggregatedLiquidationEvents` (same events, same interval)."""
    buckets: dict[int, dict[str, float]] = {}
    for event in events:
        notional = float(event["notional"])
        if not math.isfinite(notional) or notional <= 0:
            continue
        time = _reference_bucket_time(int(event["trade_time"]), interval)
        bucket = buckets.setdefault(time, {"long": 0.0, "short": 0.0})
        bucket[str(event["side"])] += notional
    return [
        {"time": time, "long": values["long"], "short": values["short"]}
        for time, values in sorted(buckets.items())
        if values["long"] > 0 or values["short"] > 0
    ]


class LiquidationBucketsRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "liquidations.sqlite3"
        self.env_patch = patch.dict(
            os.environ,
            {
                LIQUIDATIONS_DB_ENV: str(self.db_path),
                "OXDECK_DISABLE_LIQUIDATION_COLLECTOR": "1",
            },
        )
        self.env_patch.start()
        self.store = get_liquidation_store()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.env_patch.stop()
        self.temp_dir.cleanup()

    def _buckets(
        self,
        interval: str,
        start_ms: int,
        end_ms: int,
    ) -> dict[str, object]:
        response = self.client.get(
            LIQUIDATIONS_BUCKETS_PATH,
            params={"interval": interval, "from": start_ms, "to": end_ms},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_empty_database_returns_empty_buckets(self) -> None:
        body = self._buckets("1h", BASE_TIME_MS, BASE_TIME_MS + 3_600_000)
        self.assertEqual(body["exchange"], "binance")
        self.assertEqual(body["symbol"], "BTCUSDT")
        self.assertEqual(body["interval"], "1h")
        self.assertEqual(body["buckets"], [])
        self.assertFalse(body["truncated"])

    def test_bucket_boundaries_for_every_supported_interval(self) -> None:
        for index, interval in enumerate(LIQUIDATION_BUCKET_INTERVAL_MS):
            duration_ms = LIQUIDATION_BUCKET_INTERVAL_MS[interval]
            # Each interval gets its own 42-day (6-week) window so events from
            # one case can never leak into another (a 1w request spans at most
            # 14 days) and the weekly base stays Monday-aligned.
            base = BASE_TIME_MS + index * 42 * 86_400_000
            base_seconds = base // 1000
            bucket_seconds = duration_ms // 1000
            rows = [
                _event(f"{interval}-first", base, notional=1_000.0),
                _event(
                    f"{interval}-first-last-ms",
                    base + duration_ms - 1,
                    side="short",
                    notional=2_000.0,
                ),
                _event(f"{interval}-second", base + duration_ms, notional=3_000.0),
                _event(
                    f"{interval}-second-last-ms",
                    base + 2 * duration_ms - 1,
                    notional=4_000.0,
                ),
            ]
            self.store.insert_events(rows)

            body = self._buckets(interval, base, base + 2 * duration_ms)
            self.assertEqual(
                body["buckets"],
                [
                    {
                        "time": base_seconds,
                        "long": 1_000.0,
                        "short": 2_000.0,
                    },
                    {
                        "time": base_seconds + bucket_seconds,
                        "long": 7_000.0,
                        "short": 0.0,
                    },
                ],
                interval,
            )

    def test_half_open_range_includes_from_and_excludes_to(self) -> None:
        self.store.insert_events(
            [
                _event("before", BASE_TIME_MS - 1),
                _event("at-from", BASE_TIME_MS),
                _event("at-to-minus-one", BASE_TIME_MS + 1_800_000 - 1),
                _event("at-to", BASE_TIME_MS + 1_800_000),
            ]
        )

        body = self._buckets("30m", BASE_TIME_MS, BASE_TIME_MS + 1_800_000)
        self.assertEqual(
            [bucket["time"] for bucket in body["buckets"]],
            [BASE_SECONDS],
        )
        self.assertEqual(body["buckets"][0]["long"], 2_000.0)

    def test_weekly_buckets_floor_to_monday_not_the_unix_epoch(self) -> None:
        sunday_ms = BASE_TIME_MS - 1_000
        self.store.insert_events(
            [
                _event("sunday", sunday_ms),
                _event("monday", BASE_TIME_MS),
            ]
        )

        body = self._buckets("1w", sunday_ms, BASE_TIME_MS + 604_800_000)
        self.assertEqual(
            body["buckets"],
            [
                {"time": BASE_SECONDS - 604_800, "long": 1_000.0, "short": 0.0},
                {"time": BASE_SECONDS, "long": 1_000.0, "short": 0.0},
            ],
        )

    def test_rejects_from_at_or_after_to(self) -> None:
        for start, end in (
            (BASE_TIME_MS, BASE_TIME_MS),
            (BASE_TIME_MS, BASE_TIME_MS - 1),
        ):
            response = self.client.get(
                LIQUIDATIONS_BUCKETS_PATH,
                params={"interval": "1h", "from": start, "to": end},
            )
            self.assertEqual(response.status_code, 400, response.text)
            self.assertIn("greater than", response.json()["detail"])

    def test_rejects_unknown_interval(self) -> None:
        response = self.client.get(
            LIQUIDATIONS_BUCKETS_PATH,
            params={
                "interval": "2m",
                "from": BASE_TIME_MS,
                "to": BASE_TIME_MS + 3_600_000,
            },
        )
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("Unsupported interval", response.json()["detail"])

    def test_rejects_non_positive_and_non_integer_timestamps(self) -> None:
        for start, end in ((0, BASE_TIME_MS), (-1, BASE_TIME_MS)):
            response = self.client.get(
                LIQUIDATIONS_BUCKETS_PATH,
                params={"interval": "1h", "from": start, "to": end},
            )
            self.assertEqual(response.status_code, 400, response.text)

        for params in (
            {"interval": "1h", "from": "soon", "to": BASE_TIME_MS},
            {"interval": "1h", "from": BASE_TIME_MS, "to": "later"},
        ):
            response = self.client.get(LIQUIDATIONS_BUCKETS_PATH, params=params)
            self.assertEqual(response.status_code, 422, response.text)

    def test_rejects_absurd_bucket_fan_out(self) -> None:
        minute_ms = 60_000
        # Exactly at the cap: allowed (an empty range is still a valid query).
        allowed = self.client.get(
            LIQUIDATIONS_BUCKETS_PATH,
            params={
                "interval": "1m",
                "from": BASE_TIME_MS,
                "to": BASE_TIME_MS + MAX_BUCKET_COUNT * minute_ms,
            },
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertEqual(allowed.json()["buckets"], [])

        rejected = self.client.get(
            LIQUIDATIONS_BUCKETS_PATH,
            params={
                "interval": "1m",
                "from": BASE_TIME_MS,
                "to": BASE_TIME_MS + (MAX_BUCKET_COUNT + 1) * minute_ms,
            },
        )
        self.assertEqual(rejected.status_code, 400, rejected.text)
        detail = rejected.json()["detail"]
        self.assertIn(str(MAX_BUCKET_COUNT + 1), detail)
        self.assertIn(str(MAX_BUCKET_COUNT), detail)

    def test_rejects_unaligned_range_whose_slots_exceed_the_cap(self) -> None:
        minute_ms = 60_000
        # 20,000 whole minutes but starting one ms into a minute still touches
        # 20,001 buckets; the guard counts slots, not a rounded duration.
        response = self.client.get(
            LIQUIDATIONS_BUCKETS_PATH,
            params={
                "interval": "1m",
                "from": BASE_TIME_MS + 1,
                "to": BASE_TIME_MS + 1 + MAX_BUCKET_COUNT * minute_ms,
            },
        )
        self.assertEqual(response.status_code, 400, response.text)

    def test_parity_with_the_client_bucket_contract(self) -> None:
        # Three days of mixed-side events with realistic fractional notionals,
        # ties inside one bucket and events on every boundary.
        events: list[dict[str, object]] = []
        for index in range(360):
            trade_time = BASE_TIME_MS + index * 12 * 60_000 + (index % 5) * 1_000
            events.append(
                _event(
                    f"parity-{index}",
                    trade_time,
                    side="long" if index % 3 else "short",
                    notional=80_000.5 + index * 12.25,
                )
            )
        self.store.insert_events(events)

        start_ms = BASE_TIME_MS
        end_ms = BASE_TIME_MS + 3 * 86_400_000
        # Events just outside the half-open range must not leak into it.
        self.store.insert_events(
            [
                _event("parity-before-from", start_ms - 1),
                _event("parity-at-to", end_ms),
            ]
        )
        stored = self._read_all_events_between(start_ms, end_ms)
        self.assertEqual(len(stored), 360)

        for interval in LIQUIDATION_BUCKET_INTERVAL_MS:
            expected = _reference_buckets(stored, interval)
            body = self._buckets(interval, start_ms, end_ms)
            actual = body["buckets"]

            self.assertEqual(
                [bucket["time"] for bucket in actual],
                [bucket["time"] for bucket in expected],
                f"{interval}: bucket times differ from the client contract",
            )
            for actual_bucket, expected_bucket in zip(actual, expected):
                for side in ("long", "short"):
                    self.assertTrue(
                        math.isclose(
                            float(actual_bucket[side]),
                            float(expected_bucket[side]),
                            rel_tol=1e-12,
                            abs_tol=1e-9,
                        ),
                        f"{interval} {actual_bucket['time']} {side}: "
                        f"{actual_bucket[side]} != {expected_bucket[side]}",
                    )

    def test_parity_is_exact_for_binary_exact_notionals(self) -> None:
        # Powers of two can be summed in any order without rounding, so SQL's
        # group order and the client's insertion order must agree bit-for-bit.
        self.store.insert_events(
            [
                _event("exact-a", BASE_TIME_MS, notional=1024.0),
                _event("exact-b", BASE_TIME_MS + 1, side="short", notional=512.0),
                _event("exact-c", BASE_TIME_MS + 2, notional=256.0),
            ]
        )
        body = self._buckets("1h", BASE_TIME_MS, BASE_TIME_MS + 3_600_000)
        self.assertEqual(
            body["buckets"],
            [{"time": BASE_SECONDS, "long": 1280.0, "short": 512.0}],
        )

    def test_events_endpoint_is_unchanged_by_the_buckets_route(self) -> None:
        self.store.insert_events(
            [
                _event("event-a", BASE_TIME_MS),
                _event("event-b", BASE_TIME_MS + 1_000, side="short"),
            ]
        )
        # Touch the bucket route first; it must not mutate or reshape anything.
        self.assertEqual(
            len(self._buckets("1h", BASE_TIME_MS, BASE_TIME_MS + 3_600_000)["buckets"]),
            1,
        )

        response = self.client.get(LIQUIDATIONS_HISTORY_PATH, params={"limit": 1})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(set(body), {"exchange", "symbol", "events", "has_more", "next_before", "next_before_id"})
        self.assertEqual([event["id"] for event in body["events"]], ["event-b"])
        self.assertNotIn("buckets", body)

        second = self.client.get(
            LIQUIDATIONS_HISTORY_PATH,
            params={
                "before": body["next_before"],
                "before_id": body["next_before_id"],
                "limit": 1,
            },
        ).json()
        self.assertEqual([event["id"] for event in second["events"]], ["event-a"])
        self.assertFalse(second["has_more"])

    def _read_all_events_between(
        self, start_ms: int, end_ms: int
    ) -> list[dict[str, object]]:
        collected: list[dict[str, object]] = []
        cursor: int | None = None
        cursor_id: str | None = None
        while True:
            page = self.store.read_history(
                before=cursor, before_id=cursor_id, limit=1000
            )
            for event in page.events:
                trade_time = int(event["trade_time"])
                if start_ms <= trade_time < end_ms:
                    collected.append(event)
            if not page.has_more:
                break
            cursor = page.next_before
            cursor_id = page.next_before_id
        return collected


if __name__ == "__main__":
    unittest.main()
