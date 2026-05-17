"""SQLite + SQLCipher database layer for MailMaster PRO.

Uses sqlcipher3-wheels (binary aarch64/x86_64 manylinux + win_amd64).
All operations are synchronous; callers in async endpoints should wrap with
`asyncio.to_thread(...)` when latency matters.
"""
from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Optional

try:
    from sqlcipher3 import dbapi2 as sqlcipher  # provided by sqlcipher3-wheels
    _HAS_SQLCIPHER = True
except ImportError:  # pragma: no cover
    import sqlite3 as sqlcipher  # type: ignore
    _HAS_SQLCIPHER = False


_lock = threading.RLock()
_initialized = False


def _db_path() -> Path:
    p = Path(os.environ.get("DB_PATH", "data/mailmaster.db"))
    if not p.is_absolute():
        p = Path(__file__).resolve().parent / p
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _connect() -> "sqlcipher.Connection":
    conn = sqlcipher.connect(str(_db_path()), timeout=15, isolation_level=None)
    conn.row_factory = sqlcipher.Row
    key = os.environ.get("DB_ENCRYPTION_KEY", "").strip()
    if key and _HAS_SQLCIPHER:
        # Use parameterised PRAGMA via quoted literal — sqlcipher PRAGMA does not accept ? binding.
        safe = key.replace("'", "''")
        conn.execute(f"PRAGMA key = '{safe}'")
        # Sanity check — fails with NotADbError if key is wrong on an existing encrypted DB.
        conn.execute("PRAGMA cipher_compatibility = 4")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


@contextmanager
def get_conn():
    """Yield a connection for one logical operation."""
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def execute(sql: str, params: Iterable[Any] = ()) -> None:
    with _lock, get_conn() as c:
        c.execute(sql, tuple(params))


def executemany(sql: str, seq: Iterable[Iterable[Any]]) -> None:
    with _lock, get_conn() as c:
        c.executemany(sql, [tuple(p) for p in seq])


def fetch_one(sql: str, params: Iterable[Any] = ()) -> Optional[dict]:
    with get_conn() as c:
        row = c.execute(sql, tuple(params)).fetchone()
        return dict(row) if row else None


def fetch_all(sql: str, params: Iterable[Any] = ()) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(sql, tuple(params)).fetchall()]


def count(sql: str, params: Iterable[Any] = ()) -> int:
    row = fetch_one(sql, params)
    if not row:
        return 0
    # First column of first row
    return int(next(iter(row.values())))


def init_schema() -> None:
    """Create tables / indexes if missing. Idempotent."""
    global _initialized
    if _initialized:
        return
    with _lock, get_conn() as c:
        # Test the key on an existing DB; if wrong, this will throw.
        try:
            c.execute("SELECT count(*) FROM sqlite_master").fetchone()
        except sqlcipher.DatabaseError as e:  # pragma: no cover
            raise RuntimeError(
                "Failed to open database. Check DB_ENCRYPTION_KEY in backend/.env. "
                f"Original error: {e}"
            )

        c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            TEXT PRIMARY KEY,
            email         TEXT NOT NULL UNIQUE,
            name          TEXT,
            role          TEXT NOT NULL DEFAULT 'user',
            password_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS email_templates (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            subject     TEXT NOT NULL,
            body_html   TEXT NOT NULL,
            created_by  TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS word_templates (
            id                TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            stored_path       TEXT NOT NULL,
            uploaded_by       TEXT,
            created_at        TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_keys (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            owner_email TEXT NOT NULL,
            key_preview TEXT NOT NULL,
            key_hash    TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            revoked     INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS send_logs (
            id              TEXT PRIMARY KEY,
            user_email      TEXT,
            recipient       TEXT,
            subject         TEXT,
            attachment_name TEXT,
            status          TEXT NOT NULL,
            error           TEXT,
            source          TEXT NOT NULL DEFAULT 'ui',
            campaign_id     TEXT,
            timestamp       TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_send_logs_ts        ON send_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_send_logs_user      ON send_logs(user_email);
        CREATE INDEX IF NOT EXISTS idx_send_logs_campaign  ON send_logs(campaign_id);

        CREATE TABLE IF NOT EXISTS daily_quota (
            day   TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0
        );
        """)
    _initialized = True
