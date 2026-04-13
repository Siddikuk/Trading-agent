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
    MIN_TF_CONFLUENCE,
    ENTRY_TIMEFRAME,
    MAX_SL_PIPS,
    MAX_TP_PIPS,
    PIP_SIZE,
)
from database import (
    get_agent_state, update_agent_state,
    create_trade, create_signal, update_signal, create_audit_log,
    get_open_trades, get_recent_closed_trades,
)
from mt5_client import (
    ping_bridge, fetch_account_and_positions,
    fetch_all_candles, fetch_quotes, place_order, modify_position_sl,
)
from news import fetch_news
from signals import analyze_timeframe, calc_mtf_confluence, should_run_claude
from reasoning import analyse_with_claude, AIDecision
from economic_calendar import fetch_calendar, news_blackout_reason
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

    # ── 5b. Session filter — no new entries outside London/NY hours ──────────
    from datetime import datetime, timezone as _tz
    _utc_hour = datetime.now(_tz.utc).hour
    if not (7 <= _utc_hour < 20):
        logger.info(
            "Off-session (%02d:xx UTC) — trade management done, skipping new entries",
            _utc_hour,
        )
        update_agent_state({"lastScanAt": _now_str()})
        return summary

    # ── 6. Check if we can scan (max positions) ───────────────────────────────
    pos_check = check_max_positions(state)
    if not pos_check.passed:
        logger.info("Max positions reached — skipping scan: %s", pos_check.reason)
        update_agent_state({"lastScanAt": _now_str()})
        return summary

    # ── 7. Fetch candles, news, and economic calendar in parallel ─────────────
    logger.info("Fetching candles for %d symbols × %d timeframes…",
                len(watch_symbols), len(TIMEFRAMES))
    candles_all = await fetch_all_candles(symbols=watch_symbols)

    # Fetch news for all symbols concurrently (RSS, fast)
    news_tasks = {sym: asyncio.create_task(_fetch_news_safe(sym)) for sym in watch_symbols}
    news_by_sym: dict[str, list] = {}
    for sym, task in news_tasks.items():
        news_by_sym[sym] = await task

    # Fetch economic calendar (cached, 1 h TTL — never blocks on failure)
    loop = asyncio.get_event_loop()
    calendar_events = await loop.run_in_executor(None, fetch_calendar)
    # Write snapshot to DB so the dashboard (Vercel) can read it without calling ForexFactory
    if calendar_events:
        create_audit_log("CALENDAR_SNAPSHOT", None, {
            "events": [
                {
                    "title": e.title, "country": e.country, "impact": e.impact,
                    "event_utc": e.event_utc, "forecast": e.forecast, "previous": e.previous,
                }
                for e in calendar_events
            ]
        })

    # ── 8. Pre-filter: run mechanical analysis, discard low-confluence ─────────
    candidates: list[tuple[str, object]] = []   # (symbol, MTFAnalysis)

    for sym in watch_symbols:
        sym_check = check_symbol_position(sym)
        if not sym_check.passed:
            logger.info("Skip %s: %s", sym, sym_check.reason)
            summary["symbols_skipped"] += 1
            # Write HOLD signal so dashboard stays fresh even while a position is open
            create_signal(
                symbol=sym, direction="HOLD",
                confidence=0.0,
                entry_price=None, stop_loss=None, take_profit=None,
                strategy="AI-MTF", timeframe=timeframe,
                indicators={"skip_reason": sym_check.reason,
                            "reasoning": f"Monitoring open position — {sym_check.reason}"},
                executed=False,
            )
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
            reason = (
                f"Confluence too low: {mtf.confluence_count}/{mtf.total_tfs} TFs agree"
                if mtf.confluence_count < MIN_TF_CONFLUENCE
                else f"Mixed signals: {mtf.confluence_count}/{mtf.total_tfs} TFs split — no clear direction"
            )
            logger.info("Skip %s: %s", sym, reason)
            summary["symbols_skipped"] += 1
            # Write a HOLD signal so dashboard shows fresh data every scan
            entry_ind = mtf.tf_signals.get(ENTRY_TIMEFRAME)
            snap = dict(entry_ind.indicators) if entry_ind else {}
            snap["confluence"] = mtf.confluence_count
            snap["confluence_dir"] = mtf.confluence_direction
            snap["skip_reason"] = reason
            snap["reasoning"] = f"Pre-filter skipped: {reason}. Mechanical confidence {mtf.mechanical_confidence:.0f}%."
            create_signal(
                symbol=sym, direction="HOLD",
                confidence=mtf.mechanical_confidence,
                entry_price=None, stop_loss=None, take_profit=None,
                strategy="AI-MTF", timeframe=timeframe,
                indicators=snap, executed=False,
            )

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
            entry_ind_hint = mtf.tf_signals.get(ENTRY_TIMEFRAME)
            atr_hint = (entry_ind_hint.indicators.get("atr", current_price * 0.001)
                        if entry_ind_hint else current_price * 0.001)
            sl_hint = (mtf.stop_loss if (mtf.stop_loss and mtf.stop_loss > 0)
                       else current_price - atr_hint * 1.5)
            max_lots = calc_position_size(
                balance, risk_pct, current_price,
                sl_hint,
                sym, mtf.lot_multiplier,
            )
            recent_trades = get_recent_closed_trades(sym, limit=20)
            return await analyse_with_claude(
                sym, current_price, mtf, candles_by_tf,
                news_by_sym.get(sym, []),
                balance, risk_pct, max_lots,
                recent_trades=recent_trades,
                calendar_events=calendar_events,
                open_positions=mt5_positions,
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
        # Include Claude's reasoning so the dashboard can display it
        indicators_snapshot["reasoning"]   = decision.reasoning
        indicators_snapshot["skip_reason"] = decision.skip_reason
        indicators_snapshot["risk_reward"] = decision.risk_reward

        # Always write signal when Claude ran — even low-confidence HOLDs update the dashboard
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

        # ── News blackout gate ───────────────────────────────────────────────
        blackout = news_blackout_reason(sym, calendar_events)
        if blackout:
            logger.info("News blackout %s: %s", sym, blackout)
            create_audit_log("NEWS_BLACKOUT", sym, {"reason": blackout})
            continue

        # ── Execute trade ────────────────────────────────────────────────────
        # Re-check position gate — DB may have changed since pre-filter
        recheck = check_symbol_position(sym)
        if not recheck.passed:
            logger.info("Position gate (re-check) blocked %s: %s", sym, recheck.reason)
            continue

        # Fetch live price right before order — Claude may have taken 60+ seconds,
        # market could have moved significantly since entry_price was estimated.
        _pip     = PIP_SIZE.get(sym, 0.0001)
        _sl_pips = MAX_SL_PIPS.get(sym, MAX_SL_PIPS["default"])
        _tp_pips = MAX_TP_PIPS.get(sym, MAX_TP_PIPS["default"])
        try:
            live_quotes = await fetch_quotes([sym])
            q = live_quotes.get(sym, {})
            if q:
                # Use bid for SELL entry, ask for BUY entry
                live_price = float(
                    q.get("bid") if decision.direction == "SELL"
                    else q.get("ask") or q.get("bid") or decision.entry_price
                )
                logger.info(
                    "Live price for %s before order: %.5f (Claude had %.5f)",
                    sym, live_price, decision.entry_price,
                )
                decision.entry_price = live_price
        except Exception as _lp_err:
            logger.warning("Live price fetch failed for %s — using Claude entry: %s", sym, _lp_err)

        # Set SL/TP as fixed pip distances from live entry price
        if decision.direction == "BUY":
            decision.stop_loss   = decision.entry_price - _sl_pips * _pip
            decision.take_profit = decision.entry_price + _tp_pips * _pip
        else:
            decision.stop_loss   = decision.entry_price + _sl_pips * _pip
            decision.take_profit = decision.entry_price - _tp_pips * _pip

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
            ticket = order_result.get("position_ticket") or order_result.get("ticket")
            fill_price = float(order_result.get("price", decision.entry_price))

            # Post-fill SL adjustment — if market moved between our price fetch and
            # the actual fill, recalculate SL/TP from the real fill price.
            fill_sl_dist = abs(fill_price - decision.stop_loss) / _pip
            if fill_sl_dist < _sl_pips * 0.80:  # SL is less than 80% of intended distance
                if decision.direction == "BUY":
                    decision.stop_loss   = fill_price - _sl_pips * _pip
                    decision.take_profit = fill_price + _tp_pips * _pip
                else:
                    decision.stop_loss   = fill_price + _sl_pips * _pip
                    decision.take_profit = fill_price - _tp_pips * _pip
                logger.info(
                    "Fill slippage on %s: quoted=%.5f fill=%.5f (%.1f pips) "
                    "— adjusting SL to %.5f TP to %.5f",
                    sym, decision.entry_price, fill_price,
                    abs(fill_price - decision.entry_price) / _pip,
                    decision.stop_loss, decision.take_profit,
                )
                if ticket:
                    await modify_position_sl(
                        int(ticket), sym, decision.stop_loss, decision.take_profit
                    )

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
                       f"Conf={decision.confidence:.0f}% | R:R={rr:.2f}"),
                mt5_ticket=int(ticket) if ticket else 0,
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


# Known broker suffixes stripped before symbol lookup
_KNOWN_SUFFIXES = (
    '+', '.std', '.raw', '.r', '.m', '.i', '.pro',
    '.ecn', '-e', '.stp', '.t', '.n', '.c', '.sp',
)

# Symbol format map — handles Yahoo Finance (=X), MT5 bare, display (slash),
# and all common broker suffix variants. Add new rows here for any new pair.
def _variants(base: str, canonical: str) -> dict[str, str]:
    """Return a dict with bare + all suffix variants mapped to canonical."""
    sfx = ('+', '.std', '.raw', '.r', '.m', '.i', '.pro', '.ecn', '-e', '.stp', '.t', '.n', '.c', '.sp')
    d: dict[str, str] = {base: canonical}
    for s in sfx:
        d[base + s.upper()] = canonical
    return d

_SYMBOL_CANONICAL: dict[str, str] = {
    # Yahoo Finance formats
    "EURUSD=X": "EUR/USD", "GBPUSD=X": "GBP/USD",
    "USDJPY=X": "USD/JPY", "USDCHF=X": "USD/CHF",
    "XAUUSD=X": "XAU/USD", "GC=F": "XAU/USD",
    "BTCUSD=X": "BTC/USD", "BTC-USD": "BTC/USD",
    "AUDUSD=X": "AUD/USD", "NZDUSD=X": "NZD/USD",
    "USDCAD=X": "USD/CAD", "GBPJPY=X": "GBP/JPY",
    "EURJPY=X": "EUR/JPY", "EURGBP=X": "EUR/GBP",
    # Slash formats
    "EUR/USD": "EUR/USD", "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY", "USD/CHF": "USD/CHF",
    "XAU/USD": "XAU/USD", "BTC/USD": "BTC/USD",
    "AUD/USD": "AUD/USD", "NZD/USD": "NZD/USD",
    "USD/CAD": "USD/CAD", "GBP/JPY": "GBP/JPY",
    "EUR/JPY": "EUR/JPY", "EUR/GBP": "EUR/GBP",
}

# Add bare + all suffix variants for each pair
for _base, _canonical in [
    ("EURUSD", "EUR/USD"), ("GBPUSD", "GBP/USD"),
    ("USDJPY", "USD/JPY"), ("USDCHF", "USD/CHF"),
    ("XAUUSD", "XAU/USD"), ("BTCUSD", "BTC/USD"),
    ("AUDUSD", "AUD/USD"), ("NZDUSD", "NZD/USD"),
    ("USDCAD", "USD/CAD"), ("GBPJPY", "GBP/JPY"),
    ("EURJPY", "EUR/JPY"), ("EURGBP", "EUR/GBP"),
]:
    _SYMBOL_CANONICAL.update(_variants(_base, _canonical))


def _normalize_symbol(raw: str) -> str:
    """Normalise any broker symbol format to display format (e.g. EUR/USD).

    Handles: EURUSD, EURUSD+, EURUSD.std, EURUSD.raw, EUR/USD, EURUSD=X, etc.
    """
    upper = raw.upper()
    if upper in _SYMBOL_CANONICAL:
        return _SYMBOL_CANONICAL[upper]
    # Fallback: strip broker suffix and retry
    for sfx in _KNOWN_SUFFIXES:
        if upper.endswith(sfx.upper()):
            base = upper[:-len(sfx)]
            if base in _SYMBOL_CANONICAL:
                return _SYMBOL_CANONICAL[base]
    return raw
