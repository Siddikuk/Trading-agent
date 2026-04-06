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
    TRAILING_OFFSET_BY_SYMBOL,
    PIP_SIZE,
    from_mt5_symbol,
)
from database import get_open_trades, close_trade, create_audit_log, update_trade_sl, update_trade_notes
from mt5_client import modify_position_sl, fetch_quotes, fetch_deal_by_position
from reasoning import post_trade_analysis

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
    offset = TRAILING_OFFSET_BY_SYMBOL.get(symbol, TRAILING_OFFSET_PIPS) * pip
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
        matched_ticket = _find_mt5_ticket(trade, mt5_positions)

        if matched_ticket is None:
            # Trade not found in MT5 — closed externally (SL/TP hit, manual close, broker action)
            logger.info("Trade %s not found in MT5 — marking CLOSED", trade_id[:8])

            exit_price = entry_price  # fallback
            estimated_pnl = 0.0

            # Try to get actual close price + P&L from MT5 deal history
            mt5_ticket = int(trade.get("mt5Ticket") or 0)
            # Fallback: parse ticket from notes if mt5Ticket column is NULL (pre-migration trades)
            if not mt5_ticket and trade.get("notes"):
                import re
                m = re.search(r'MT5 ticket=(\d+)', trade.get("notes", ""))
                if m:
                    mt5_ticket = int(m.group(1))
                    logger.info("Parsed mt5_ticket=%s from notes for trade %s", mt5_ticket, trade_id[:8])
            if mt5_ticket:
                try:
                    deal = await fetch_deal_by_position(mt5_ticket)
                    if deal:
                        exit_price = float(deal["price"])
                        estimated_pnl = float(deal.get("profit", 0)) + \
                                        float(deal.get("swap", 0)) + \
                                        float(deal.get("commission", 0))
                        logger.info("Got actual close from MT5 history: price=%.5f pnl=%.2f",
                                    exit_price, estimated_pnl)
                except Exception as e:
                    logger.warning("MT5 history lookup failed for ticket %s: %s", mt5_ticket, e)

            # Fallback: estimate from current quote if history lookup failed
            if exit_price == entry_price:
                try:
                    quotes = await fetch_quotes([symbol])
                    q = quotes.get(symbol, {})
                    if q:
                        bid = float(q.get("bid") or q.get("last") or entry_price)
                        ask = float(q.get("ask") or bid)
                        exit_price = (bid + ask) / 2.0
                        lot_size = float(trade.get("lotSize") or 0.01)
                        pips = _pips_profit(direction, entry_price, exit_price, symbol)
                        pip_value = 10.0 * lot_size
                        estimated_pnl = pips * pip_value
                except Exception as e:
                    logger.warning("Quote fallback failed for %s: %s", trade_id[:8], e)

            close_trade(trade_id, exit_price=exit_price, pnl=estimated_pnl)
            create_audit_log("TRADE_SYNCED_CLOSED", symbol, {
                "trade_id": trade_id,
                "reason": "Not found in MT5 positions",
                "exit_price": exit_price,
                "estimated_pnl": estimated_pnl,
            })

            # Post-trade analysis — write a lesson into Trade.notes
            try:
                original_reasoning = trade.get("notes") or ""
                lesson = await post_trade_analysis(
                    symbol, direction, entry_price, exit_price,
                    estimated_pnl, original_reasoning,
                )
                if lesson:
                    update_trade_notes(trade_id, lesson)
                    logger.info("Post-trade lesson saved for %s: %s", symbol, lesson[:80])
            except Exception as e:
                logger.warning("Post-trade analysis failed for %s: %s", symbol, e)

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
                    current_sl = be_sl  # update in memory for trailing check below
                    update_trade_sl(trade_id, be_sl)
                    create_audit_log("BREAKEVEN_SL_MOVE", symbol, {
                        "trade_id": trade_id,
                        "old_sl": current_sl,
                        "new_sl": be_sl,
                        "pips_profit": pips_profit,
                    })
                else:
                    logger.warning("Breakeven SL move failed %s: %s", symbol, result.get("error"))

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
                    update_trade_sl(trade_id, trail_sl)
                    create_audit_log("TRAILING_SL_MOVE", symbol, {
                        "trade_id": trade_id,
                        "old_sl": current_sl,
                        "new_sl": trail_sl,
                        "pips_profit": pips_profit,
                    })
                else:
                    logger.warning("Trailing SL move failed %s: %s", symbol, result.get("error"))


def _find_mt5_ticket(trade: dict, mt5_positions: list[dict]) -> Optional[int]:
    """
    Match a DB trade to an MT5 position.
    1. Primary: direct match by stored mt5Ticket (position ticket).
    2. Fallback: fuzzy match by normalized symbol + direction + entry price proximity.
       Uses from_mt5_symbol() to handle broker suffixes (e.g. XAUUSD+ → XAU/USD).
    Returns ticket number or None if not found.
    """
    # Primary: direct ticket match (reliable after position_ticket fix)
    stored_ticket = int(trade.get("mt5Ticket") or 0)
    if stored_ticket:
        for pos in mt5_positions:
            if int(pos.get("ticket", 0)) == stored_ticket:
                return stored_ticket

    # Fallback: fuzzy match (handles pre-fix trades or netting accounts)
    symbol    = trade["symbol"]   # canonical e.g. "XAU/USD"
    direction = trade["direction"]
    entry     = float(trade["entryPrice"])
    mt5_type  = 0 if direction == "BUY" else 1

    best_ticket: Optional[int] = None
    best_diff   = float("inf")

    for pos in mt5_positions:
        pos_symbol = from_mt5_symbol(pos.get("symbol", ""))  # normalise broker suffix
        if pos_symbol != symbol:
            continue
        if int(pos.get("type", -1)) != mt5_type:
            continue
        diff = abs(float(pos.get("price_open", 0)) - entry)
        if diff < best_diff:
            best_diff   = diff
            best_ticket = int(pos["ticket"])

    # Accept match only if entry prices are very close (within 20 pips)
    pip = PIP_SIZE.get(symbol, 0.0001)
    if best_ticket is not None and best_diff <= pip * 20:
        return best_ticket
    return None
