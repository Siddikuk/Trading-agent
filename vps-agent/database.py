"""
database.py — PostgreSQL connection pool (psycopg2) and all CRUD functions.
Connects to the same Neon DB used by the Next.js dashboard, so trades/signals
written here appear automatically in the UI.

Also runs the AuditLog table migration on first use.
"""

from __future__ import annotations

import json
import logging
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

from config import DATABASE_URL

logger = logging.getLogger(__name__)

# ─── Connection pool ──────────────────────────────────────────────────────────

_pool: Optional[pg_pool.ThreadedConnectionPool] = None


def _get_pool() -> pg_pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = pg_pool.ThreadedConnectionPool(
            minconn=1, maxconn=5,
            dsn=DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
        logger.info("DB connection pool created")
    return _pool


@contextmanager
def _conn():
    p = _get_pool()
    conn = p.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Schema migration ─────────────────────────────────────────────────────────

AUDIT_LOG_DDL = """
CREATE TABLE IF NOT EXISTS "AuditLog" (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    action      TEXT        NOT NULL,
    symbol      TEXT,
    details     JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "AuditLog_symbol_idx" ON "AuditLog" (symbol);
CREATE INDEX IF NOT EXISTS "AuditLog_created_at_idx" ON "AuditLog" (created_at DESC);
"""


def run_migrations() -> None:
    """Ensure AuditLog table exists. Safe to call on every startup."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(AUDIT_LOG_DDL)
    logger.info("DB migrations applied")


# ─── AgentState ───────────────────────────────────────────────────────────────

def get_agent_state() -> Optional[dict]:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM "AgentState" WHERE id = %s', ('main',))
            row = cur.fetchone()
            return dict(row) if row else None


def update_agent_state(fields: dict) -> None:
    if not fields:
        return
    set_clauses = ", ".join(f'"{k}" = %s' for k in fields)
    values = list(fields.values()) + ['main']
    sql = f'UPDATE "AgentState" SET {set_clauses}, "updatedAt" = NOW() WHERE id = %s'
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, values)


def ensure_agent_state() -> None:
    """Create the AgentState singleton row if it doesn't exist."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM "AgentState" WHERE id = %s', ('main',))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO "AgentState"
                        (id, "isRunning", "autoTrade", balance, currency,
                         "maxRiskPercent", "maxDrawdownPercent", "dailyRiskLimit",
                         strategies, "watchSymbols", timeframe, "mt5Connected",
                         "lastScanAt", "createdAt", "updatedAt")
                    VALUES
                        ('main', false, false, 1000, 'USD',
                         2.0, 15.0, 5.0,
                         'RSI,MACD,Bollinger,Trend', 'EUR/USD,GBP/USD,USD/JPY,USD/CHF,XAU/USD',
                         'H1', false, NULL, NOW(), NOW())
                """)
                logger.info("AgentState singleton created")


# ─── Trades ───────────────────────────────────────────────────────────────────

def get_open_trades(symbol: Optional[str] = None) -> list[dict]:
    with _conn() as conn:
        with conn.cursor() as cur:
            if symbol:
                cur.execute(
                    'SELECT * FROM "Trade" WHERE status = %s AND symbol = %s',
                    ('OPEN', symbol)
                )
            else:
                cur.execute('SELECT * FROM "Trade" WHERE status = %s', ('OPEN',))
            return [dict(r) for r in cur.fetchall()]


def create_trade(
    symbol: str,
    direction: str,
    lot_size: float,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    strategy: str = "AI-MTF",
    signal_id: Optional[str] = None,
    notes: str = "",
) -> str:
    trade_id = str(uuid.uuid4())
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO "Trade"
                    (id, symbol, direction, "lotSize", "entryPrice",
                     "stopLoss", "takeProfit", status, strategy,
                     "signalId", notes, "openTime")
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'OPEN', %s, %s, %s, NOW())
            """, (
                trade_id, symbol, direction, lot_size, entry_price,
                stop_loss, take_profit, strategy, signal_id, notes,
            ))
    logger.info("Trade created: %s %s %s @ %s", trade_id[:8], direction, symbol, entry_price)
    return trade_id


def close_trade(
    trade_id: str,
    exit_price: float,
    pnl: float,
) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE "Trade"
                SET status = 'CLOSED',
                    "exitPrice" = %s,
                    pnl = %s,
                    "closeTime" = NOW()
                WHERE id = %s
            """, (exit_price, pnl, trade_id))
    logger.info("Trade closed: %s exit=%.5f pnl=%.2f", trade_id[:8], exit_price, pnl)


def get_daily_pnl() -> float:
    """Sum of PnL for all trades closed in the last 24 hours."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COALESCE(SUM(pnl), 0) AS total
                FROM "Trade"
                WHERE status = 'CLOSED'
                  AND "closeTime" > NOW() - INTERVAL '24 hours'
            """)
            row = cur.fetchone()
            return float(row["total"]) if row else 0.0


def get_trade_by_id(trade_id: str) -> Optional[dict]:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM "Trade" WHERE id = %s', (trade_id,))
            row = cur.fetchone()
            return dict(row) if row else None


# ─── Signals ──────────────────────────────────────────────────────────────────

def create_signal(
    symbol: str,
    direction: str,
    confidence: float,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    strategy: str,
    timeframe: str,
    indicators: dict,
    executed: bool = False,
    trade_id: Optional[str] = None,
) -> str:
    sig_id = str(uuid.uuid4())
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO "Signal"
                    (id, symbol, direction, confidence, "entryPrice",
                     "stopLoss", "takeProfit", strategy, timeframe,
                     indicators, executed, "tradeId", "createdAt",
                     "expiresAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        NOW(), NOW() + INTERVAL '1 hour')
            """, (
                sig_id, symbol, direction, confidence, entry_price,
                stop_loss, take_profit, strategy, timeframe,
                json.dumps(indicators), executed, trade_id,
            ))
    return sig_id


# ─── AuditLog ─────────────────────────────────────────────────────────────────

def create_audit_log(
    action: str,
    symbol: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO "AuditLog" (id, action, symbol, details)
                VALUES (%s, %s, %s, %s)
            """, (
                str(uuid.uuid4()),
                action,
                symbol,
                json.dumps(details) if details else None,
            ))


# ─── Settings ─────────────────────────────────────────────────────────────────

def get_setting(key: str) -> Optional[str]:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT value FROM "Setting" WHERE key = %s', (key,))
            row = cur.fetchone()
            return row["value"] if row else None


def upsert_setting(key: str, value: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO "Setting" (key, value)
                VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """, (key, value))
