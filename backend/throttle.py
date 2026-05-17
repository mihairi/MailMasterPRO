"""Anti-blocking throttler for outbound email.

Three sliding windows (per-minute / per-hour) + persistent per-day quota in DB.
Plus per-recipient-domain rate cap and random jitter delay.

All counters live in memory (sliding deque); the daily quota is persisted in
the `daily_quota` table so it survives restarts.
"""
from __future__ import annotations

import asyncio
import os
import random
import time
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Deque, Optional

import database as db


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _domain_of(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower().strip() if "@" in email else ""


class ThrottleConfig:
    def __init__(
        self,
        per_minute: Optional[int] = None,
        per_hour: Optional[int] = None,
        per_day: Optional[int] = None,
        per_domain_per_min: Optional[int] = None,
        delay_min_ms: Optional[int] = None,
        delay_max_ms: Optional[int] = None,
    ):
        self.per_minute        = per_minute        if per_minute        is not None else _env_int("MAX_PER_MINUTE", 20)
        self.per_hour          = per_hour          if per_hour          is not None else _env_int("MAX_PER_HOUR", 300)
        self.per_day           = per_day           if per_day           is not None else _env_int("MAX_PER_DAY", 2000)
        self.per_domain_per_min= per_domain_per_min if per_domain_per_min is not None else _env_int("MAX_PER_DOMAIN_PER_MIN", 5)
        self.delay_min_ms      = delay_min_ms      if delay_min_ms      is not None else _env_int("DELAY_MIN_MS", 800)
        self.delay_max_ms      = delay_max_ms      if delay_max_ms      is not None else _env_int("DELAY_MAX_MS", 2500)
        # sanity
        if self.delay_max_ms < self.delay_min_ms:
            self.delay_max_ms = self.delay_min_ms

    def as_dict(self) -> dict:
        return {
            "per_minute": self.per_minute,
            "per_hour": self.per_hour,
            "per_day": self.per_day,
            "per_domain_per_min": self.per_domain_per_min,
            "delay_min_ms": self.delay_min_ms,
            "delay_max_ms": self.delay_max_ms,
        }


class CampaignThrottler:
    """One instance per campaign. Owns its own in-memory windows."""

    def __init__(self, cfg: ThrottleConfig):
        self.cfg = cfg
        self._minute: Deque[float] = deque()
        self._hour:   Deque[float] = deque()
        self._domain: Dict[str, Deque[float]] = {}
        self._lock = asyncio.Lock()

    # ---------- public ----------

    async def wait_slot(self, recipient_email: str) -> None:
        """Block until it's safe to send to this recipient (rate caps satisfied)."""
        domain = _domain_of(recipient_email)
        while True:
            async with self._lock:
                wait_for = self._compute_wait_seconds(domain)
            if wait_for <= 0:
                return
            await asyncio.sleep(wait_for)

    async def record_send(self, recipient_email: str) -> None:
        """Record a successful (or attempted) send. Updates in-memory + DB daily quota."""
        domain = _domain_of(recipient_email)
        now = time.monotonic()
        async with self._lock:
            self._minute.append(now)
            self._hour.append(now)
            self._domain.setdefault(domain, deque()).append(now)
        # Persist daily counter in DB (idempotent UPSERT)
        await asyncio.to_thread(self._bump_daily)

    async def jitter_delay(self) -> None:
        """Sleep a random duration between configured min and max."""
        if self.cfg.delay_max_ms <= 0:
            return
        ms = random.randint(self.cfg.delay_min_ms, self.cfg.delay_max_ms)
        await asyncio.sleep(ms / 1000.0)

    # ---------- internal ----------

    def _compute_wait_seconds(self, domain: str) -> float:
        now = time.monotonic()
        self._evict(now)

        waits = [0.0]

        if len(self._minute) >= self.cfg.per_minute > 0:
            oldest = self._minute[0]
            waits.append(60.0 - (now - oldest) + 0.01)

        if len(self._hour) >= self.cfg.per_hour > 0:
            oldest = self._hour[0]
            waits.append(3600.0 - (now - oldest) + 0.01)

        if domain and self.cfg.per_domain_per_min > 0:
            dq = self._domain.get(domain)
            if dq and len(dq) >= self.cfg.per_domain_per_min:
                oldest = dq[0]
                waits.append(60.0 - (now - oldest) + 0.01)

        # Daily quota check (read DB)
        if self.cfg.per_day > 0:
            today_count = _read_daily()
            if today_count >= self.cfg.per_day:
                # Wait until next UTC midnight
                now_utc = datetime.now(timezone.utc)
                midnight = now_utc.replace(hour=23, minute=59, second=59, microsecond=999999)
                waits.append((midnight - now_utc).total_seconds() + 1.0)

        return max(waits)

    def _evict(self, now: float) -> None:
        while self._minute and now - self._minute[0] > 60.0:
            self._minute.popleft()
        while self._hour and now - self._hour[0] > 3600.0:
            self._hour.popleft()
        dead_domains = []
        for d, dq in self._domain.items():
            while dq and now - dq[0] > 60.0:
                dq.popleft()
            if not dq:
                dead_domains.append(d)
        for d in dead_domains:
            self._domain.pop(d, None)

    def _bump_daily(self) -> None:
        day = _today_utc()
        db.execute(
            "INSERT INTO daily_quota (day, count) VALUES (?, 1) "
            "ON CONFLICT(day) DO UPDATE SET count = count + 1",
            (day,),
        )


def _read_daily() -> int:
    row = db.fetch_one("SELECT count FROM daily_quota WHERE day = ?", (_today_utc(),))
    return int(row["count"]) if row else 0


def current_daily_count() -> int:
    return _read_daily()
