"""
mt5_client.py — Async HTTP client for the MT5 bridge (FastAPI on localhost:8080).
Uses aiohttp for parallel candle/quote fetching across all symbols and timeframes.
All symbol conversion (EUR/USD ↔ EURUSD) is handled here.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import aiohttp

from config import (
    MT5_BRIDGE_URL,
    BRIDGE_TIMEOUT_S,
    ORDER_TIMEOUT_S,
    BRIDGE_RETRY_LIMIT,
    TIMEFRAMES,
    TF_CANDLE_COUNT,
    to_mt5_symbol,
    from_mt5_symbol,
    WATCH_SYMBOLS,
)
from indicators import Candle

logger = logging.getLogger(__name__)


# ─── Low-level request helpers ────────────────────────────────────────────────

async def _get(
    session: aiohttp.ClientSession,
    path: str,
    params: dict | None = None,
    timeout: int = BRIDGE_TIMEOUT_S,
) -> Any:
    """GET with exponential-backoff retry (read-only — safe to retry)."""
    url = f"{MT5_BRIDGE_URL}{path}"
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(BRIDGE_RETRY_LIMIT):
        try:
            async with session.get(
                url, params=params,
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as resp:
                resp.raise_for_status()
                return await resp.json()
        except aiohttp.ClientResponseError as e:
            logger.error("Bridge GET %s → HTTP %s: %s", path, e.status, e.message)
            raise  # HTTP errors (4xx/5xx) are not transient — don't retry
        except (asyncio.TimeoutError, aiohttp.ClientConnectionError) as e:
            last_exc = e
            if attempt < BRIDGE_RETRY_LIMIT - 1:
                wait = 2 ** attempt   # 1s, 2s, 4s …
                logger.warning(
                    "Bridge GET %s failed (attempt %d/%d), retrying in %ds: %s",
                    path, attempt + 1, BRIDGE_RETRY_LIMIT, wait, e,
                )
                await asyncio.sleep(wait)
            else:
                logger.error("Bridge GET %s timed out after %d attempts", path, BRIDGE_RETRY_LIMIT)
    raise last_exc


async def _post(
    session: aiohttp.ClientSession,
    path: str,
    body: dict,
    timeout: int = ORDER_TIMEOUT_S,
) -> Any:
    url = f"{MT5_BRIDGE_URL}{path}"
    try:
        async with session.post(
            url, json=body,
            timeout=aiohttp.ClientTimeout(total=timeout)
        ) as resp:
            resp.raise_for_status()
            return await resp.json()
    except aiohttp.ClientResponseError as e:
        logger.error("Bridge POST %s → HTTP %s: %s", path, e.status, e.message)
        raise


# ─── Health ───────────────────────────────────────────────────────────────────

async def ping_bridge() -> bool:
    """Return True if the MT5 bridge is reachable and connected."""
    try:
        async with aiohttp.ClientSession() as session:
            data = await _get(session, "/api/mt5/health")
            return bool(data.get("connected", False))
    except Exception:
        return False


# ─── Account & positions ──────────────────────────────────────────────────────

def _validate_account(data: Any) -> Optional[dict]:
    """Validate bridge account response. Returns dict or None."""
    if not isinstance(data, dict):
        logger.error("Bridge account response is not a dict: %r", data)
        return None
    required = ("balance", "equity")
    if not all(k in data for k in required):
        logger.error("Bridge account response missing fields %s: %r", required, data)
        return None
    return data


def _validate_positions(data: Any) -> list[dict]:
    """Validate bridge positions response. Returns list (empty on invalid)."""
    if not isinstance(data, dict):
        logger.error("Bridge positions response is not a dict: %r", data)
        return []
    raw = data.get("positions", [])
    if not isinstance(raw, list):
        logger.error("Bridge positions field is not a list: %r", raw)
        return []
    valid: list[dict] = []
    for pos in raw:
        if not isinstance(pos, dict):
            continue
        if "ticket" not in pos or "symbol" not in pos:
            logger.warning("Position missing ticket/symbol, skipping: %r", pos)
            continue
        valid.append(pos)
    return valid


async def fetch_account() -> Optional[dict]:
    """Return account info dict (balance, equity, margin, etc.) or None."""
    try:
        async with aiohttp.ClientSession() as session:
            data = await _get(session, "/api/mt5/account")
            return _validate_account(data)
    except Exception as e:
        logger.error("fetch_account failed: %s", e)
        return None


async def fetch_positions() -> list[dict]:
    """Return list of open MT5 positions."""
    try:
        async with aiohttp.ClientSession() as session:
            data = await _get(session, "/api/mt5/positions")
            return _validate_positions(data)
    except Exception as e:
        logger.error("fetch_positions failed: %s", e)
        return []


async def fetch_account_and_positions() -> tuple[Optional[dict], list[dict]]:
    """Fetch account info and open positions in parallel."""
    async with aiohttp.ClientSession() as session:
        account_task   = asyncio.create_task(_get(session, "/api/mt5/account"))
        positions_task = asyncio.create_task(_get(session, "/api/mt5/positions"))
        results = await asyncio.gather(account_task, positions_task, return_exceptions=True)

    raw_account  = results[0] if not isinstance(results[0], Exception) else None
    raw_pos_data = results[1] if not isinstance(results[1], Exception) else None
    if isinstance(results[0], Exception):
        logger.error("fetch_account_and_positions account error: %s", results[0])
    if isinstance(results[1], Exception):
        logger.error("fetch_account_and_positions positions error: %s", results[1])

    account   = _validate_account(raw_account) if raw_account is not None else None
    positions = _validate_positions(raw_pos_data) if raw_pos_data is not None else []
    return account, positions


# ─── Candles ──────────────────────────────────────────────────────────────────

def _parse_candles(raw: list[dict]) -> list[Candle]:
    candles: list[Candle] = []
    for c in raw:
        candles.append(Candle(
            time=int(c.get("time", 0)),
            open=float(c.get("open", 0)),
            high=float(c.get("high", 0)),
            low=float(c.get("low", 0)),
            close=float(c.get("close", 0)),
            volume=float(c.get("volume") or c.get("tick_volume") or 0),
        ))
    return candles


async def _fetch_candles_one(
    session: aiohttp.ClientSession,
    symbol: str,
    timeframe: str,
    count: int,
) -> list[Candle]:
    mt5_sym = to_mt5_symbol(symbol)
    try:
        data = await _get(session, "/api/mt5/candles", {
            "symbol": mt5_sym,
            "timeframe": timeframe,
            "count": count,
        })
        raw = data.get("candles", [])
        return _parse_candles(raw)
    except Exception as e:
        logger.warning("Candle fetch failed %s/%s: %s", symbol, timeframe, e)
        return []


async def fetch_all_candles(
    symbols: list[str] | None = None,
    timeframes: list[str] | None = None,
) -> dict[str, dict[str, list[Candle]]]:
    """
    Fetch candles for ALL symbols × ALL timeframes in parallel.
    Returns: {symbol: {timeframe: [Candle, ...]}}
    20 concurrent requests for 5 symbols × 4 timeframes.
    """
    if symbols is None:
        symbols = WATCH_SYMBOLS
    if timeframes is None:
        timeframes = TIMEFRAMES

    results: dict[str, dict[str, list[Candle]]] = {s: {} for s in symbols}

    async with aiohttp.ClientSession() as session:
        tasks: list[tuple[str, str, asyncio.Task]] = []
        for sym in symbols:
            for tf in timeframes:
                count = TF_CANDLE_COUNT.get(tf, 200)
                task = asyncio.create_task(
                    _fetch_candles_one(session, sym, tf, count)
                )
                tasks.append((sym, tf, task))

        for sym, tf, task in tasks:
            try:
                results[sym][tf] = await task
            except Exception as e:
                logger.warning("Candle task %s/%s exception: %s", sym, tf, e)
                results[sym][tf] = []

    return results


# ─── Quotes ───────────────────────────────────────────────────────────────────

async def fetch_quotes(symbols: list[str] | None = None) -> dict[str, dict]:
    """Return current bid/ask/last for each symbol."""
    if symbols is None:
        symbols = WATCH_SYMBOLS
    mt5_syms = ",".join(to_mt5_symbol(s) for s in symbols)
    try:
        async with aiohttp.ClientSession() as session:
            data = await _get(session, "/api/mt5/quotes", {"symbols": mt5_syms})
            quotes: dict[str, dict] = {}
            for q in data.get("data", []):
                display = from_mt5_symbol(q["symbol"])
                quotes[display] = q
            return quotes
    except Exception as e:
        logger.error("fetch_quotes failed: %s", e)
        return {}


# ─── Order execution ──────────────────────────────────────────────────────────

async def place_order(
    symbol: str,
    direction: str,    # "BUY" or "SELL"
    lots: float,
    stop_loss: float,
    take_profit: float,
    comment: str = "AI-MTF",
) -> dict:
    """
    Place a market order via the MT5 bridge.
    Returns bridge response dict with 'success', 'ticket', 'price'.
    """
    mt5_sym  = to_mt5_symbol(symbol)
    order_type = 0 if direction == "BUY" else 1

    body = {
        "symbol":    mt5_sym,
        "type":      order_type,
        "lots":      lots,
        "price":     0,          # 0 = market order
        "sl":        stop_loss,
        "tp":        take_profit,
        "comment":   comment,
        "deviation": 20,
    }

    try:
        async with aiohttp.ClientSession() as session:
            return await _post(session, "/api/mt5/order", body)
    except Exception as e:
        logger.error("place_order %s %s failed: %s", direction, symbol, e)
        return {"success": False, "error": str(e)}


async def close_position(ticket: int) -> dict:
    """Close a specific position by ticket number."""
    try:
        async with aiohttp.ClientSession() as session:
            return await _post(session, "/api/mt5/close", {"ticket": ticket})
    except Exception as e:
        logger.error("close_position ticket=%s failed: %s", ticket, e)
        return {"success": False, "error": str(e)}


async def close_all_positions() -> dict:
    """Emergency close — close ALL open positions."""
    try:
        async with aiohttp.ClientSession() as session:
            return await _post(session, "/api/mt5/close", {"type": "ALL"})
    except Exception as e:
        logger.error("close_all_positions failed: %s", e)
        return {"success": False, "error": str(e)}


async def modify_position_sl(
    ticket: int,
    symbol: str,
    new_sl: float,
    take_profit: float,
) -> dict:
    """
    Modify stop loss on an open position.
    MT5 modify is done by placing a new order with the same ticket.
    The bridge endpoint /api/mt5/modify handles this.
    Falls back to using order with TRADE_ACTION_SLTP.
    """
    mt5_sym = to_mt5_symbol(symbol)
    body = {
        "ticket":     ticket,
        "symbol":     mt5_sym,
        "sl":         new_sl,
        "tp":         take_profit,
    }
    try:
        async with aiohttp.ClientSession() as session:
            return await _post(session, "/api/mt5/modify", body)
    except Exception as e:
        logger.warning("modify_position_sl ticket=%s: %s", ticket, e)
        return {"success": False, "error": str(e)}
