"""
agent.py — Main async orchestrator.
Runs the full scan cycle: perceive → circuit-break → trade-manage → scan → decide → act → log.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from config import (
    WATCH_SYMBOLS,
    TIMEFRAMES,
    MAX_CONCURRENT_CLAUDE,
    MIN_CONFIDENCE_TO_SIGNAL,
    ENTRY_TIMEFRAME,
)
from database import (
    get_agent_state, update_agent_state,
    create_trade, create_signal, update_signal, create_audit_log,
    get_open_trades,
)
from mt5_client import (
    ping_bridge, fetch_account_and_positions,
    fetch_all_candles, fetch_quotes, place_order,
)
from news import fetch_news
from signals import analyze_timeframe, calc_mtf_confluence, should_run_claude
from reasoning import analyse_with_claude, AIDecision
from risk import (
    calc_position_size, calc_risk_reward,
    check_daily_loss, check_drawdown, check_max_positions,
    check_symbol_position, check_confidence_and_rr,
    emergency_halt,
)
from trade_manager import manage_open_trades

logger = logging.getLogger(__name__)


# ─── Single scan cycle ────────────────────────────────────────────────────────

async def run_cycle() -> dict:
    """
    Execute one full scan cycle. Returns a summary dict for logging.
    """
    t_start = time.time()
    summary = {
        "started_at": t_start,
        "symbols_scanned": 0,
        "symbols_skipped": 0,
        "new_signals": 0,
        "new_trades": 0,
        "errors": [],
    }

    # ── 1. Read agent state from DB ──────────────────────────────────────────
    state = get_agent_state()
    if not state or not state.get("isRunning"):
        logger.debug("Agent not running — idle")
        return summary

    auto_trade = bool(state.get("autoTrade", False))
    balance    = float(state.get("balance") or 1000.0)
    risk_pct   = float(state.get("maxRiskPercent") or 2.0)
    timeframe  = str(state.get("timeframe") or ENTRY_TIMEFRAME)
    watch_syms_raw = str(state.get("watchSymbols") or ",".join(WATCH_SYMBOLS))
    watch_symbols  = [_normalize_symbol(s.strip()) for s in watch_syms_raw.split(",") if s.strip()]
    # Filter to symbols we support (must have a pip-size mapping or be slash format)
    watch_symbols  = [s for s in watch_symbols if s]

    # ── 2. Health check ──────────────────────────────────────────────────────
    if not await ping_bridge():
        logger.error("MT5 bridge unreachable — skipping cycle")
        update_agent_state({"mt5Connected": False})
        summary["errors"].append("Bridge unreachable")
        return summary

    # ── 3. Perceive — account + positions ────────────────────────────────────
    account, mt5_positions = await fetch_account_and_positions()
    if account:
        update_agent_state({
            "mt5Connected": True,
            "balance": float(account.get("balance", balance)),
        })
        balance = float(account.get("balance", balance))
    else:
        logger.warning("Could not fetch account — using DB balance %.2f", balance)
        update_agent_state({"mt5Connected": False})

    # ── 4. Circuit breakers ──────────────────────────────────────────────────
    daily_check = check_daily_loss(state)
    if not daily_check.passed:
        logger.warning("CIRCUIT BREAKER (daily loss): %s", daily_check.reason)
        update_agent_state({"isRunning": False})
        create_audit_log("CIRCUIT_BREAKER_DAILY_LOSS", details={"reason": daily_check.reason})
        summary["errors"].append(daily_check.reason)
        return summary

    if account:
        dd_check = check_drawdown(account, state)
        if not dd_check.passed:
            logger.critical("CIRCUIT BREAKER (drawdown): %s", dd_check.reason)
            await emergency_halt(dd_check.reason)
            summary["errors"].append(dd_check.reason)
            return summary

    # ── 5. Trade management ──────────────────────────────────────────────────
    await manage_open_trades(mt5_positions)

    # ── 6. Check if we can scan (max positions) ───────────────────────────────
    pos_check = check_max_positions(state)
    if not pos_check.passed:
        logger.info("Max positions reached — skipping scan: %s", pos_check.reason)
        update_agent_state({"lastScanAt": _now_str()})
        return summary

    # ── 7. Fetch all candles + news in parallel ───────────────────────────────
    logger.info("Fetching candles for %d symbols × %d timeframes…",
                len(watch_symbols), len(TIMEFRAMES))
    candles_all = await fetch_all_candles(symbols=watch_symbols)

    # Fetch news for all symbols concurrently (RSS, fast)
    news_tasks = {sym: asyncio.create_task(_fetch_news_safe(sym)) for sym in watch_symbols}
    news_by_sym: dict[str, list] = {}
    for sym, task in news_tasks.items():
        news_by_sym[sym] = await task

    # ── 8. Pre-filter: run mechanical analysis, discard low-confluence ─────────
    candidates: list[tuple[str, object]] = []   # (symbol, MTFAnalysis)

    for sym in watch_symbols:
        sym_check = check_symbol_position(sym)
        if not sym_check.passed:
            logger.debug("Skip %s: %s", sym, sym_check.reason)
            summary["symbols_skipped"] += 1
            continue

        tf_signals = {}
        for tf in TIMEFRAMES:
            candles = candles_all.get(sym, {}).get(tf, [])
            if len(candles) < 20:
                logger.warning("Insufficient candles %s/%s (%d)", sym, tf, len(candles))
                continue
            tf_signals[tf] = analyze_timeframe(sym, tf, candles)

        if not tf_signals:
            summary["symbols_skipped"] += 1
            continue

        mtf = calc_mtf_confluence(sym, tf_signals)
        logger.info(
            "MTF pre-filter %s: %d/%d %s conf=%.0f%%",
            sym, mtf.confluence_count, mtf.total_tfs,
            mtf.confluence_direction, mtf.mechanical_confidence,
        )

        if should_run_claude(mtf):
            candidates.append((sym, mtf))
        else:
            logger.info("Skip %s: confluence too low (%d/%d)",
                        sym, mtf.confluence_count, mtf.total_tfs)
            summary["symbols_skipped"] += 1

    summary["symbols_scanned"] = len(candidates)

    if not candidates:
        logger.info("No symbols passed pre-filter")
        update_agent_state({"lastScanAt": _now_str()})
        return summary

    # ── 9. Claude reasoning (max 2 concurrent) ───────────────────────────────
    logger.info("Running Claude on %d symbols…", len(candidates))
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_CLAUDE)

    async def _reason(sym: str, mtf) -> AIDecision:
        async with semaphore:
            candles_by_tf = candles_all.get(sym, {})
            current_price = _get_current_price(candles_by_tf)
            max_lots = calc_position_size(
                balance, risk_pct, current_price,
                current_price * 0.999,  # rough SL placeholder for max-lot calc
                sym, mtf.lot_multiplier,
            )
            return await analyse_with_claude(
                sym, current_price, mtf, candles_by_tf,
                news_by_sym.get(sym, []),
                balance, risk_pct, max_lots,
            )

    decisions = await asyncio.gather(
        *[_reason(sym, mtf) for sym, mtf in candidates],
        return_exceptions=True,
    )

    # ── 10. Act on decisions ──────────────────────────────────────────────────
    for (sym, mtf), decision in zip(candidates, decisions):
        if isinstance(decision, Exception):
            logger.error("Decision error %s: %s", sym, decision)
            summary["errors"].append(f"{sym}: {decision}")
            continue

        candles_by_tf = candles_all.get(sym, {})
        current_price = _get_current_price(candles_by_tf)
        entry_ind     = mtf.tf_signals.get(ENTRY_TIMEFRAME)
        indicators_snapshot = (
            dict(entry_ind.indicators) if entry_ind else {}
        )
        indicators_snapshot["confluence"] = mtf.confluence_count
        indicators_snapshot["confluence_dir"] = mtf.confluence_direction

        # Write signal regardless of trade decision (for dashboard visibility)
        if decision.confidence >= MIN_CONFIDENCE_TO_SIGNAL:
            sig_id = create_signal(
                symbol=sym,
                direction=decision.direction,
                confidence=decision.confidence,
                entry_price=decision.entry_price,
                stop_loss=decision.stop_loss,
                take_profit=decision.take_profit,
                strategy="AI-MTF",
                timeframe=timeframe,
                indicators=indicators_snapshot,
                executed=False,
            )
            summary["new_signals"] += 1
        else:
            sig_id = None

        # Audit every Claude decision
        create_audit_log("CLAUDE_DECISION", sym, {
            "direction":    decision.direction,
            "confidence":   decision.confidence,
            "should_trade": decision.should_trade,
            "skip_reason":  decision.skip_reason,
            "risk_reward":  decision.risk_reward,
            "reasoning":    decision.reasoning,
            "confluence":   f"{mtf.confluence_count}/{mtf.total_tfs}",
            "elapsed_ms":   decision.elapsed_ms,
        })

        if not decision.should_trade or decision.direction == "HOLD":
            logger.info("No trade %s: %s", sym, decision.skip_reason or "HOLD")
            continue

        if not auto_trade:
            logger.info("Signal only (autoTrade=off): %s %s %.0f%%",
                        decision.direction, sym, decision.confidence)
            continue

        # ── Execute trade ────────────────────────────────────────────────────
        rr = calc_risk_reward(decision.entry_price, decision.stop_loss, decision.take_profit)
        rr_check = check_confidence_and_rr(decision.confidence, rr)
        if not rr_check.passed:
            logger.info("Trade gate failed %s: %s", sym, rr_check.reason)
            continue

        lots = calc_position_size(
            balance, risk_pct,
            decision.entry_price, decision.stop_loss,
            sym, mtf.lot_multiplier,
        )

        logger.info(
            "Placing order: %s %s %.2f lots | SL=%.5f TP=%.5f | conf=%.0f%% rr=%.2f",
            decision.direction, sym, lots,
            decision.stop_loss, decision.take_profit,
            decision.confidence, rr,
        )

        order_result = await place_order(
            symbol=sym,
            direction=decision.direction,
            lots=lots,
            stop_loss=decision.stop_loss,
            take_profit=decision.take_profit,
            comment=f"AI-MTF {mtf.confluence_count}/{mtf.total_tfs}",
        )

        if order_result.get("success"):
            ticket = order_result.get("ticket")
            fill_price = float(order_result.get("price", decision.entry_price))

            trade_id = create_trade(
                symbol=sym,
                direction=decision.direction,
                lot_size=lots,
                entry_price=fill_price,
                stop_loss=decision.stop_loss,
                take_profit=decision.take_profit,
                strategy="AI-MTF",
                signal_id=sig_id,
                notes=(f"Confluence {mtf.confluence_count}/{mtf.total_tfs} | "
                       f"Conf={decision.confidence:.0f}% | R:R={rr:.2f} | "
                       f"MT5 ticket={ticket}"),
            )

            # Mark existing signal as executed (avoid duplicate DB row)
            if sig_id:
                update_signal(sig_id, executed=True, trade_id=trade_id)

            create_audit_log("TRADE_OPENED", sym, {
                "trade_id":  trade_id,
                "ticket":    ticket,
                "direction": decision.direction,
                "lots":      lots,
                "entry":     fill_price,
                "sl":        decision.stop_loss,
                "tp":        decision.take_profit,
                "confluence":f"{mtf.confluence_count}/{mtf.total_tfs}",
                "confidence":decision.confidence,
            })
            summary["new_trades"] += 1
            logger.info("Trade opened: %s ticket=%s", trade_id[:8], ticket)

        else:
            err = order_result.get("error", "Unknown error")
            logger.error("Order failed %s: %s", sym, err)
            create_audit_log("TRADE_FAILED", sym, {
                "direction": decision.direction, "lots": lots, "error": err,
            })
            summary["errors"].append(f"{sym} order: {err}")

    # ── 11. Update state ──────────────────────────────────────────────────────
    elapsed = time.time() - t_start
    update_agent_state({"lastScanAt": _now_str()})

    logger.info(
        "Cycle done in %.1fs | scanned=%d skipped=%d signals=%d trades=%d errors=%d",
        elapsed,
        summary["symbols_scanned"],
        summary["symbols_skipped"],
        summary["new_signals"],
        summary["new_trades"],
        len(summary["errors"]),
    )
    create_audit_log("SCAN_CYCLE_COMPLETE", details={
        **{k: v for k, v in summary.items() if k != "started_at"},
        "elapsed_s": round(elapsed, 1),
    })
    return summary


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _fetch_news_safe(symbol: str) -> list:
    """Fetch news in a thread (feedparser is sync)."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, fetch_news, symbol)
    except Exception as e:
        logger.warning("News fetch failed %s: %s", symbol, e)
        return []


def _get_current_price(candles_by_tf: dict) -> float:
    """Get latest close price from the best available timeframe."""
    for tf in ["M15", "H1", "H4", "D1"]:
        candles = candles_by_tf.get(tf, [])
        if candles:
            return float(candles[-1]["close"])
    return 0.0


def _now_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# Symbol format map: handles Yahoo Finance (EURUSD=X), MT5 (EURUSD), and display (EUR/USD)
_SYMBOL_CANONICAL: dict[str, str] = {
    "EURUSD=X": "EUR/USD", "EURUSD": "EUR/USD",
    "GBPUSD=X": "GBP/USD", "GBPUSD": "GBP/USD",
    "USDJPY=X": "USD/JPY", "USDJPY": "USD/JPY",
    "USDCHF=X": "USD/CHF", "USDCHF": "USD/CHF",
    "XAUUSD=X": "XAU/USD", "XAUUSD": "XAU/USD",
    "GC=F":     "XAU/USD",
    "BTCUSD=X": "BTC/USD", "BTCUSD": "BTC/USD",
    "BTC-USD":  "BTC/USD",
}


def _normalize_symbol(raw: str) -> str:
    """Normalise any known symbol format to display format (EUR/USD)."""
    return _SYMBOL_CANONICAL.get(raw.upper(), raw)
