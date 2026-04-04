"""
trade_manager.py — Monitor open trades every cycle.
- Moves SL to breakeven after BREAKEVEN_TRIGGER_PIPS profit
- Trails SL after TRAILING_TRIGGER_PIPS profit
- Syncs DB trade records with actual MT5 positions (detect broker-closed trades)
"""

from __future__ import annotations

import logging
from typing import Optional

from config import (
    BREAKEVEN_TRIGGER_PIPS,
    TRAILING_TRIGGER_PIPS,
    TRAILING_OFFSET_PIPS,
    PIP_SIZE,
)
from database import get_open_trades, close_trade, create_audit_log
from mt5_client import modify_position_sl

logger = logging.getLogger(__name__)


def _pips_profit(
    direction: str,
    entry_price: float,
    current_price: float,
    symbol: str,
) -> float:
    pip = PIP_SIZE.get(symbol, 0.0001)
    if direction == "BUY":
        return (current_price - entry_price) / pip
    else:
        return (entry_price - current_price) / pip


def _new_breakeven_sl(
    direction: str,
    entry_price: float,
    symbol: str,
) -> float:
    pip = PIP_SIZE.get(symbol, 0.0001)
    # Move SL exactly to entry (+ small buffer of 1 pip to avoid instant stop-out)
    if direction == "BUY":
        return entry_price + pip
    else:
        return entry_price - pip


def _new_trailing_sl(
    direction: str,
    current_price: float,
    symbol: str,
) -> float:
    pip = PIP_SIZE.get(symbol, 0.0001)
    offset = TRAILING_OFFSET_PIPS * pip
    if direction == "BUY":
        return current_price - offset
    else:
        return current_price + offset


async def manage_open_trades(mt5_positions: list[dict]) -> None:
    """
    Called every cycle.
    1. Sync DB — mark trades as CLOSED if broker already closed them.
    2. Apply breakeven / trailing stop moves.
    """
    db_trades = get_open_trades()
    if not db_trades:
        return

    # Build a set of open MT5 tickets for quick lookup
    mt5_tickets = {int(p.get("ticket", 0)) for p in mt5_positions}
    # Build ticket→position map
    ticket_to_pos = {int(p["ticket"]): p for p in mt5_positions}

    for trade in db_trades:
        trade_id    = trade["id"]
        symbol      = trade["symbol"]
        direction   = trade["direction"]
        entry_price = float(trade["entryPrice"])
        current_sl  = float(trade.get("stopLoss") or 0)
        current_tp  = float(trade.get("takeProfit") or 0)

        # ── 1. Sync closed trades ────────────────────────────────────────────
        # Try to find this trade in MT5 by matching symbol + direction
        # (We don't store MT5 ticket in DB — match by symbol+direction+open_proximity)
        matched_ticket = _find_mt5_ticket(trade, mt5_positions)

        if matched_ticket is None:
            # Trade not found in MT5 — it was closed externally (SL/TP hit, manual close)
            logger.info("Trade %s not found in MT5 — marking CLOSED", trade_id[:8])
            # Estimate PnL from last known position data (not available) — use 0 as placeholder
            close_trade(trade_id, exit_price=0.0, pnl=0.0)
            create_audit_log("TRADE_SYNCED_CLOSED", symbol, {
                "trade_id": trade_id,
                "reason": "Not found in MT5 positions",
            })
            continue

        pos = ticket_to_pos[matched_ticket]
        current_price = float(pos.get("price_current", entry_price))
        pips_profit   = _pips_profit(direction, entry_price, current_price, symbol)

        # Sync live PnL info (update trade notes for dashboard visibility)
        # (We don't update DB on every tick to avoid noise — just manage SL)

        # ── 2. Breakeven move ────────────────────────────────────────────────
        if pips_profit >= BREAKEVEN_TRIGGER_PIPS:
            be_sl = _new_breakeven_sl(direction, entry_price, symbol)

            # Only move if new SL is more favourable than current SL
            sl_improved = (
                (direction == "BUY"  and be_sl > current_sl) or
                (direction == "SELL" and be_sl < current_sl)
            )

            if sl_improved:
                logger.info(
                    "Moving SL to breakeven: %s %s | pips=%.1f | SL %.5f → %.5f",
                    symbol, direction, pips_profit, current_sl, be_sl,
                )
                result = await modify_position_sl(matched_ticket, symbol, be_sl, current_tp)
                if result.get("success"):
                    create_audit_log("BREAKEVEN_SL_MOVE", symbol, {
                        "trade_id": trade_id,
                        "old_sl": current_sl,
                        "new_sl": be_sl,
                        "pips_profit": pips_profit,
                    })

        # ── 3. Trailing stop ─────────────────────────────────────────────────
        if pips_profit >= TRAILING_TRIGGER_PIPS:
            trail_sl = _new_trailing_sl(direction, current_price, symbol)

            sl_improved = (
                (direction == "BUY"  and trail_sl > current_sl) or
                (direction == "SELL" and trail_sl < current_sl)
            )

            if sl_improved:
                logger.info(
                    "Trailing SL: %s %s | pips=%.1f | SL %.5f → %.5f",
                    symbol, direction, pips_profit, current_sl, trail_sl,
                )
                result = await modify_position_sl(matched_ticket, symbol, trail_sl, current_tp)
                if result.get("success"):
                    create_audit_log("TRAILING_SL_MOVE", symbol, {
                        "trade_id": trade_id,
                        "old_sl": current_sl,
                        "new_sl": trail_sl,
                        "pips_profit": pips_profit,
                    })


def _find_mt5_ticket(trade: dict, mt5_positions: list[dict]) -> Optional[int]:
    """
    Match a DB trade to an MT5 position by symbol + direction + entry price proximity.
    Returns ticket number or None if not found.
    """
    symbol    = trade["symbol"].replace("/", "")   # MT5 format
    direction = trade["direction"]
    entry     = float(trade["entryPrice"])
    mt5_type  = 0 if direction == "BUY" else 1

    best_ticket: Optional[int] = None
    best_diff   = float("inf")

    for pos in mt5_positions:
        if pos.get("symbol") != symbol:
            continue
        if int(pos.get("type", -1)) != mt5_type:
            continue
        diff = abs(float(pos.get("price_open", 0)) - entry)
        if diff < best_diff:
            best_diff   = diff
            best_ticket = int(pos["ticket"])

    # Accept match only if entry prices are very close (within 20 pips)
    pip = PIP_SIZE.get(trade["symbol"], 0.0001)
    if best_ticket is not None and best_diff <= pip * 20:
        return best_ticket
    return None
