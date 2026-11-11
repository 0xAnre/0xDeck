"""Short-lived in-process TTL cache in front of the exchange klines reads.

Every chart panel refetch used to be a full upstream round trip (measured
300-600 ms from this VPS). A pane renders several VWAP contexts and a volume
profile on top of its candle request, and a reload or a second browser tab
repeats them for the same bytes. This module keeps the last response per
request shape for a few seconds so those repeats are served locally.

The cache is deliberately tiny and dependency-free: a dict guarded by a
`threading.Lock`, `time.monotonic()` timestamps, and one lock per key so
concurrent requests for the same key wait for a single in-flight upstream call
instead of stampeding the exchange.

Rules:

- Only successful returns are stored. An exception propagates unchanged and
  leaves no entry, so the next request retries upstream.
- The key is the request *shape* (exchange, symbol, endpoint variant, interval,
  limit, explicit time range) and never the wall clock. A `*-context` request
  derives its window from the current time, so keying on that window would make
  every request a miss; the TTL bounds the staleness instead.
- `now_ms`, `http_get` and `http_post` are deterministic test seams. A call
  that supplies one bypasses the cache, so a fake upstream response can never
  outlive the test that installed it (the unit tests pin responses through
  those seams).
- Cached candle lists are shared, not copied. Every current caller only reads
  and serializes them; treat them as read-only.
- The WebSocket relay path never goes through this cache: live candles stay
  live.

Disable with `OXDECK_DISABLE_KLINES_CACHE=1`; tune with
`OXDECK_KLINES_CACHE_TTL_SECONDS` (default `DEFAULT_KLINES_CACHE_TTL_SECONDS`).
Both are read once at import.
"""

from __future__ import annotations

import functools
import os
import threading
import time
from dataclasses import dataclass
from typing import Callable, Generic, Hashable, TypeVar, cast

DEFAULT_KLINES_CACHE_TTL_SECONDS = 5.0
KLINES_CACHE_MAX_ENTRIES = 256
KLINES_CACHE_DISABLE_ENV = "OXDECK_DISABLE_KLINES_CACHE"
KLINES_CACHE_TTL_ENV = "OXDECK_KLINES_CACHE_TTL_SECONDS"

# Deterministic upstream/test seams: supplying one bypasses the cache.
CACHE_BYPASS_KWARGS = ("now_ms", "http_get", "http_post")

Value = TypeVar("Value")
CacheKey = Hashable

_MISSING = object()


def _configured_ttl_seconds() -> float:
    raw = os.environ.get(KLINES_CACHE_TTL_ENV)
    if raw is None or not raw.strip():
        return DEFAULT_KLINES_CACHE_TTL_SECONDS
    try:
        ttl = float(raw)
    except ValueError:
        return DEFAULT_KLINES_CACHE_TTL_SECONDS
    # A bogus negative TTL would cache forever; fall back to the default.
    return ttl if ttl >= 0 else DEFAULT_KLINES_CACHE_TTL_SECONDS


def _cache_enabled_from_env() -> bool:
    return os.environ.get(KLINES_CACHE_DISABLE_ENV, "").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }


@dataclass(frozen=True)
class CacheStats:
    hits: int
    misses: int
    entries: int


@dataclass(frozen=True)
class _Entry(Generic[Value]):
    value: Value
    stored_at: float


class TTLCache(Generic[Value]):
    """A bounded, thread-safe cache of successful values keyed by request shape."""

    def __init__(
        self,
        ttl_seconds: float = DEFAULT_KLINES_CACHE_TTL_SECONDS,
        *,
        max_entries: int = KLINES_CACHE_MAX_ENTRIES,
        enabled: bool = True,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if ttl_seconds < 0:
            raise ValueError("ttl_seconds must be >= 0")
        self.ttl_seconds = ttl_seconds
        self.max_entries = max(1, max_entries)
        self.enabled = enabled and ttl_seconds > 0
        self._clock = clock
        self._lock = threading.Lock()
        self._entries: dict[CacheKey, _Entry[Value]] = {}
        # One lock per key, with its current user count, so same-key requests
        # collapse into one upstream call while different keys stay parallel.
        self._key_locks: dict[CacheKey, tuple[threading.Lock, int]] = {}
        self._hits = 0
        self._misses = 0

    def get_or_fetch(self, key: CacheKey, fetch: Callable[[], Value]) -> Value:
        if not self.enabled:
            return fetch()

        value = self._lookup(key)
        if value is not _MISSING:
            return cast(Value, value)

        key_lock = self._acquire_key_lock(key)
        try:
            # Another request may have filled the entry while this one waited.
            value = self._lookup(key, count_miss=False)
            if value is not _MISSING:
                return cast(Value, value)
            # Stored only after `fetch` returns: errors must not be cached.
            value = fetch()
            self._store(key, value)
            return cast(Value, value)
        finally:
            self._release_key_lock(key, key_lock)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def reset_stats(self) -> None:
        with self._lock:
            self._hits = 0
            self._misses = 0

    def stats(self) -> CacheStats:
        with self._lock:
            return CacheStats(
                hits=self._hits,
                misses=self._misses,
                entries=len(self._entries),
            )

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)

    def _lookup(self, key: CacheKey, *, count_miss: bool = True) -> Value | object:
        now = self._clock()
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None and now - entry.stored_at < self.ttl_seconds:
                self._hits += 1
                return entry.value
            if entry is not None:
                del self._entries[key]
            if count_miss:
                self._misses += 1
            return _MISSING

    def _store(self, key: CacheKey, value: Value) -> None:
        now = self._clock()
        with self._lock:
            self._entries[key] = _Entry(value=value, stored_at=now)
            self._prune_locked(now)

    def _prune_locked(self, now: float) -> None:
        if len(self._entries) <= self.max_entries:
            return
        expired = [
            key
            for key, entry in self._entries.items()
            if now - entry.stored_at >= self.ttl_seconds
        ]
        for key in expired:
            del self._entries[key]
        while len(self._entries) > self.max_entries:
            oldest = min(self._entries, key=lambda key: self._entries[key].stored_at)
            del self._entries[oldest]

    def _acquire_key_lock(self, key: CacheKey) -> threading.Lock:
        with self._lock:
            lock, users = self._key_locks.get(key, (threading.Lock(), 0))
            self._key_locks[key] = (lock, users + 1)
        lock.acquire()
        return lock

    def _release_key_lock(self, key: CacheKey, lock: threading.Lock) -> None:
        lock.release()
        with self._lock:
            current = self._key_locks.get(key)
            if current is None or current[0] is not lock:
                return
            users = current[1] - 1
            if users <= 0:
                del self._key_locks[key]
            else:
                self._key_locks[key] = (lock, users)


Fetch = TypeVar("Fetch", bound=Callable[..., object])


def ttl_cached(
    key_builder: Callable[..., CacheKey],
    *,
    cache: "TTLCache[object] | None" = None,
) -> Callable[[Fetch], Fetch]:
    """Cache a klines fetch function by the request shape its key builder returns.

    `key_builder` receives the call's own arguments and must accept the same
    signature as the wrapped function (it ignores the deterministic seams).
    Calls that pass `now_ms`, `http_get` or `http_post` by keyword bypass the
    cache: those arguments exist so a caller can pin the response, and caching
    them would hand that pinned response to a later caller with another fake
    upstream. Every current call site passes these seams by keyword or not at
    all.
    """
    target = klines_cache if cache is None else cache

    def decorator(fetch: Fetch) -> Fetch:
        @functools.wraps(fetch)
        def wrapper(*args: object, **kwargs: object) -> object:
            if any(kwargs.get(name) is not None for name in CACHE_BYPASS_KWARGS):
                return fetch(*args, **kwargs)
            return target.get_or_fetch(
                key_builder(*args, **kwargs),
                lambda: fetch(*args, **kwargs),
            )

        return cast(Fetch, wrapper)

    return decorator


klines_cache: TTLCache[object] = TTLCache(
    ttl_seconds=_configured_ttl_seconds(),
    enabled=_cache_enabled_from_env(),
)
