"""
reasoning.py — Claude API integration.
Builds multi-timeframe prompts, calls claude-sonnet-4-6, parses JSON decisions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Optional

import anthropic

from config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    CLAUDE_RETRY_ATTEMPTS,
    CLAUDE_RETRY_BACKOFF,
    TF_LABELS,
    ENTRY_TIMEFRAME,
    MIN_CONFIDENCE_TO_TRADE,
    MIN_RISK_REWARD,
    MAX_SL_PIPS,
    MAX_TP_PIPS,
    PIP_SIZE,
)
from indicators import analyze_price_action
from news import NewsArticle, format_news_for_prompt
from signals import MTFAnalysis, TFSignal

logger = logging.getLogger(__name__)

_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=120.0)


# ─── Decision output ──────────────────────────────────────────────────────────

@dataclass
class AIDecision:
    symbol: str
    direction: str          # "BUY" | "SELL" | "HOLD"
    confidence: float       # 0–100
    entry_price: float
    stop_loss: float
    take_profit: float
    reasoning: str
    sentiment_score: float  # -100 to 100
    should_trade: bool
    skip_reason: str = ""
    primary_timeframe: str = "H1"
    confluence_used: str = ""
    risk_reward: float = 0.0
    elapsed_ms: int = 0


# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = f"""You are an expert scalp trader specialising in forex and gold (XAU/USD).
You execute fast, precise trades using M5 price action, confirmed by M15 and H1 trend direction.

## Analysis Framework (always follow in this order)
1. H1 TREND DIRECTION: Establish the bias only — bullish or bearish? EMAs, MACD direction. Do NOT time entries on H1.
2. M15 SETUP: Is price at a key level (S/R, EMA, BB)? Is there a pullback or breakout forming?
3. M5 ENTRY TRIGGER: Pin bar, engulfing candle, EMA9 bounce, momentum shift. Entry is ONLY on M5.
4. NEWS CONTEXT: Check calendar — avoid new entries within 15 min of HIGH-impact releases.
5. SYNTHESIS: All three timeframes must agree. If ANY conflict → HOLD. Do not force entries.

## Hard Rules
- HOLD is the correct answer most of the time. Only trade A+ setups where everything aligns.
- Target 60-80 pips on XAU/USD, 20-40 pips on forex pairs — scalp, do not hold for big moves
- Stop loss: 30-40 pips on XAU/USD, 15-20 pips on forex — enough room for M5 noise
- Minimum confidence to trade: 65% — if you are not highly convinced, output HOLD
- Minimum Risk:Reward ratio: {MIN_RISK_REWARD}
- Never hold more than one position per symbol
- If M5 and M15 conflict → HOLD. These two must agree — they are the entry and confirmation.
- H1 is trend context only. A counter-H1 trade on strong M5+M15 alignment is acceptable but reduce confidence by 10-15 points.
- Account context: cent account with small balance — use provided lot size limits strictly

## ADX Guidance (not a hard block — use judgement)
- ADX < 15 on BOTH M15 AND H1: strong ranging signal → reduce confidence significantly
- ADX < 20 on one timeframe only: note it, but do not automatically HOLD if EMA alignment and MACD confirm direction clearly — early trends and breakouts naturally start with low ADX
- Strong EMA alignment (9>21>50 bullish or 9<21<50 bearish) + MACD confirmation can offset low ADX on a single timeframe

## Response Format
Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.
{{
  "direction": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 0-100>,
  "entry_price": <float>,
  "stop_loss": <float>,
  "take_profit": <float>,
  "reasoning": "<chain of thought — H1 trend, M15 setup, M5 trigger>",
  "sentiment_score": <integer -100 to 100>,
  "should_trade": <true | false>,
  "skip_reason": "<why HOLD — empty string if trading>",
  "primary_timeframe": "<which TF drove the entry decision>",
  "confluence_used": "<e.g. '3/3'>",
  "risk_reward": <float>
}}"""


# ─── Prompt builder ───────────────────────────────────────────────────────────

def _annotate_rsi(rsi: float) -> str:
    if rsi < 25:  return "⚠️ EXTREMELY OVERSOLD"
    if rsi < 30:  return "⚠️ OVERSOLD"
    if rsi < 40:  return "↓ Soft oversold"
    if rsi > 75:  return "⚠️ EXTREMELY OVERBOUGHT"
    if rsi > 70:  return "⚠️ OVERBOUGHT"
    if rsi > 60:  return "↑ Soft overbought"
    return "→ Neutral"


def _annotate_macd(hist: float) -> str:
    if hist > 0:  return "✓ Bullish"
    if hist < 0:  return "✗ Bearish"
    return "→ Neutral"


def _annotate_adx(adx: float) -> str:
    if adx > 40: return "🔥 Very strong trend"
    if adx > 25: return "✓ Strong trend"
    if adx > 15: return "→ Moderate trend"
    return "⚠️ Weak/ranging"


def _ema_alignment(ind: dict) -> str:
    e9, e21, e50, e200 = ind["ema9"], ind["ema21"], ind["ema50"], ind["ema200"]
    if e9 > e21 > e50 > e200: return "🟢 Full bullish (9>21>50>200)"
    if e9 < e21 < e50 < e200: return "🔴 Full bearish (9<21<50<200)"
    if e9 > e21 > e50:         return "🟡 Bullish (9>21>50)"
    if e9 < e21 < e50:         return "🟡 Bearish (9<21<50)"
    if e9 > e21:               return "↑ Short-term bullish (9>21)"
    if e9 < e21:               return "↓ Short-term bearish (9<21)"
    return "→ Mixed"


def _bb_position(price: float, upper: float, mid: float, lower: float) -> str:
    rng = upper - lower
    if rng == 0: return "→ Bands flat"
    pct = (price - lower) / rng * 100
    if pct >= 95:    return f"⚠️ AT/ABOVE upper ({pct:.0f}%)"
    if pct >= 75:    return f"↑ Upper half ({pct:.0f}%)"
    if pct <= 5:     return f"⚠️ AT/BELOW lower ({pct:.0f}%)"
    if pct <= 25:    return f"↓ Lower half ({pct:.0f}%)"
    return f"→ Mid-band ({pct:.0f}%)"


def _format_tf_block(tf: str, sig: TFSignal, candles: list) -> str:
    ind    = sig.indicators
    label  = TF_LABELS.get(tf, tf)
    mech   = f"{sig.direction} {sig.confidence:.0f}%"
    if tf == ENTRY_TIMEFRAME:
        mech += " ← PRIMARY"
    elif tf == "M15":
        mech += " ← CONFIRMS ENTRY"
    elif tf == "D1":
        mech += " ← MACRO BIAS"

    price_action = analyze_price_action(candles) if len(candles) >= 10 else "–"

    return f"""┌─ {tf} ({label}) {"─" * max(1, 46 - len(tf) - len(label))}┐
│ RSI: {ind['rsi']:.1f} [{_annotate_rsi(ind['rsi'])}]
│ MACD: Hist={ind['macd_hist']:+.5f} [{_annotate_macd(ind['macd_hist'])}] | Line={ind['macd_line']:.5f}
│ EMA: {_ema_alignment(ind)}
│ Bollinger: {_bb_position(sig.entry_price, ind['bb_upper'], ind['bb_mid'], ind['bb_lower'])}
│ ADX: {ind['adx']:.1f} [{_annotate_adx(ind['adx'])}] | ATR: {ind['atr']:.5f}
│ Stoch K/D: {ind['stoch_k']:.1f}/{ind['stoch_d']:.1f}
│ Price Action: {price_action}
│ Mechanical: {mech}
└{"─" * 52}┘"""


def _build_trade_history_section(trades: list[dict]) -> str:
    """Format recent closed trades as a prompt section for Claude."""
    if not trades:
        return ""

    def _resolve_pnl(t: dict) -> float:
        """Return stored pnl if non-zero; otherwise infer sign from entry/exit prices."""
        pnl = float(t.get("pnl") or 0)
        if pnl != 0:
            return pnl
        entry = float(t.get("entryPrice") or 0)
        exit_ = float(t.get("exitPrice") or 0)
        direction = t.get("direction", "")
        if entry and exit_ and entry != exit_:
            return entry - exit_ if direction == "SELL" else exit_ - entry
        return 0.0

    resolved_pnls = [_resolve_pnl(t) for t in trades]
    if not any(p != 0 for p in resolved_pnls):
        return ""   # no useful history — skip section entirely

    lines = ["## RECENT TRADE HISTORY (use to improve decisions)"]

    for t in trades[:5]:
        pnl = _resolve_pnl(t)
        stored_pnl = float(t.get("pnl") or 0)
        if pnl > 0:
            pnl_str = f"${stored_pnl:+.2f}" if stored_pnl != 0 else "(profitable — exact $ not stored)"
            outcome = f"WIN {pnl_str}"
        elif pnl < 0:
            pnl_str = f"${stored_pnl:+.2f}" if stored_pnl != 0 else "(loss — exact $ not stored)"
            outcome = f"LOSS {pnl_str}"
        else:
            outcome = "CLOSED (outcome unknown)"
        ind = t.get("indicators") or {}
        rr = ind.get("risk_reward", "?")
        raw_reasoning = ind.get("reasoning", t.get("notes") or "")
        short_reasoning = (raw_reasoning[:150] + "…") if len(raw_reasoning) > 150 else raw_reasoning
        lines.append(
            f"  {t['symbol']} {t['direction']} | {outcome} | "
            f"R:R={rr} | {short_reasoning}"
        )

    # Win rate from resolved P&L (stored or inferred from price move)
    wins   = sum(1 for p in resolved_pnls if p > 0)
    losses = sum(1 for p in resolved_pnls if p < 0)
    total  = wins + losses
    buy_w  = sum(1 for t, p in zip(trades, resolved_pnls) if t["direction"] == "BUY" and p > 0)
    buy_t  = sum(1 for t in trades if t["direction"] == "BUY")
    sell_w = sum(1 for t, p in zip(trades, resolved_pnls) if t["direction"] == "SELL" and p > 0)
    sell_t = sum(1 for t in trades if t["direction"] == "SELL")

    lines.append(
        f"  Win rate: {wins}/{total} ({100*wins//total if total else 0}%) | "
        f"BUY {buy_w}/{buy_t} | SELL {sell_w}/{sell_t}"
    )
    return "\n".join(lines)


async def post_trade_analysis(
    symbol: str,
    direction: str,
    entry_price: float,
    exit_price: float,
    pnl: float,
    original_reasoning: str,
) -> str:
    """
    Run a short Claude call after a trade closes to extract a 2-3 sentence lesson.
    Returns the lesson text, or empty string on failure.
    """
    outcome = "profitable" if pnl > 0 else "a loss"
    prompt = (
        f"A {direction} trade on {symbol} just closed as {outcome}. "
        f"Entry: {entry_price:.5f} | Exit: {exit_price:.5f} | P&L: {pnl:+.2f}\n\n"
        f"Original reasoning at entry:\n{original_reasoning[:400]}\n\n"
        f"Write exactly 2-3 sentences: what went right or wrong, and what to watch for "
        f"next time trading {symbol}. Be specific about indicators or market conditions."
    )
    try:
        raw = await _call_claude(prompt)
        return raw.strip()
    except Exception as e:
        logger.warning("post_trade_analysis failed for %s: %s", symbol, e)
        return ""


def build_prompt(
    symbol: str,
    current_price: float,
    mtf: MTFAnalysis,
    candles_by_tf: dict[str, list],
    news: list[NewsArticle],
    balance: float,
    risk_pct: float,
    max_lots: float,
    recent_trades: list[dict] | None = None,
    calendar_events: list | None = None,
    open_positions: list[dict] | None = None,
) -> str:
    entry_ind = mtf.tf_signals.get(ENTRY_TIMEFRAME)
    atr       = entry_ind.indicators["atr"] if entry_ind else current_price * 0.001

    tf_blocks = []
    for tf in ["D1", "H4", "H1", "M15"]:
        if tf in mtf.tf_signals:
            candles = candles_by_tf.get(tf, [])
            tf_blocks.append(_format_tf_block(tf, mtf.tf_signals[tf], candles))

    confluence_str = f"{mtf.confluence_count}/{mtf.total_tfs} {mtf.confluence_direction}"
    news_str       = format_news_for_prompt(news)

    # Scalper SL/TP: tighter ATR multipliers, capped by hard pip limits
    pip      = PIP_SIZE.get(symbol, 0.0001)
    max_sl   = MAX_SL_PIPS.get(symbol, MAX_SL_PIPS["default"]) * pip
    max_tp   = MAX_TP_PIPS.get(symbol, MAX_TP_PIPS["default"]) * pip

    suggested_sl_buy  = max(current_price - atr * 0.8, current_price - max_sl)
    suggested_sl_sell = min(current_price + atr * 0.8, current_price + max_sl)
    suggested_tp_buy  = min(current_price + atr * 1.6, current_price + max_tp)
    suggested_tp_sell = max(current_price - atr * 1.6, current_price - max_tp)

    history_section = _build_trade_history_section(recent_trades or [])
    history_block   = f"\n{history_section}\n" if history_section else ""

    # Open positions block — always show so Claude knows the current exposure
    open_block = ""
    if open_positions:
        lines = ["## OPEN POSITIONS (live broker state)"]
        for p in open_positions:
            from config import from_mt5_symbol
            pos_sym   = from_mt5_symbol(p.get("symbol", ""))
            direction = "BUY" if int(p.get("type", 0)) == 0 else "SELL"
            entry     = float(p.get("price_open", 0))
            cur       = float(p.get("price_current", entry))
            profit    = float(p.get("profit", 0))
            ticket    = p.get("ticket", "?")
            lines.append(
                f"  {pos_sym} {direction} | entry={entry:.5f} current={cur:.5f} "
                f"| P&L={profit:+.2f} | ticket={ticket}"
            )
        open_block = "\n" + "\n".join(lines) + "\n"

    # Economic calendar block
    cal_block = ""
    if calendar_events is not None:
        from economic_calendar import filter_for_symbol, format_for_prompt
        sym_events = filter_for_symbol(symbol, calendar_events)
        cal_str = format_for_prompt(sym_events)
        cal_block = f"\nECONOMIC CALENDAR (high/medium impact, next 24h):\n{cal_str}\n"

    return f"""Symbol: {symbol} | Price: {current_price:.5f} | MTF Confluence: {confluence_str}
Account: Balance ${balance:.2f} | Max Risk: {risk_pct:.1f}% | Max Lots: {max_lots:.2f}

{chr(10).join(tf_blocks)}

NEWS & SENTIMENT ({len(news)} articles, last 24h):
{news_str}
{cal_block}{open_block}{history_block}
SCALP GUIDANCE (based on {ENTRY_TIMEFRAME} ATR={atr:.5f}):
BUY scenario  → SL: {suggested_sl_buy:.5f}  TP: {suggested_tp_buy:.5f}
SELL scenario → SL: {suggested_sl_sell:.5f}  TP: {suggested_tp_sell:.5f}
Max lot for {risk_pct:.1f}% risk: {max_lots:.2f}
SL cap: {MAX_SL_PIPS.get(symbol, MAX_SL_PIPS["default"]):.0f} pips | TP cap: {MAX_TP_PIPS.get(symbol, MAX_TP_PIPS["default"]):.0f} pips — do not exceed these

Respond in JSON only."""


# ─── Claude API call ──────────────────────────────────────────────────────────

async def _call_claude(prompt: str) -> str:
    """
    Call Claude API in a thread (anthropic SDK is sync).
    Retries up to CLAUDE_RETRY_ATTEMPTS with exponential backoff on 429/overload.
    """
    loop = asyncio.get_event_loop()

    def _sync_call() -> str:
        for attempt in range(CLAUDE_RETRY_ATTEMPTS):
            try:
                msg = _client.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=4000,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": prompt}],
                )
                # Adaptive thinking may prepend thinking blocks — extract the text block
                text = next(
                    (b.text for b in msg.content if hasattr(b, "text") and b.type == "text"),
                    "",
                )
                if not text:
                    raise RuntimeError("Claude returned no text block")
                return text
            except anthropic.RateLimitError:
                wait = CLAUDE_RETRY_BACKOFF[min(attempt, len(CLAUDE_RETRY_BACKOFF) - 1)]
                logger.warning("Claude rate limited, waiting %ds (attempt %d)", wait, attempt + 1)
                time.sleep(wait)
            except anthropic.APIStatusError as e:
                if e.status_code in (503, 529):
                    wait = CLAUDE_RETRY_BACKOFF[min(attempt, len(CLAUDE_RETRY_BACKOFF) - 1)]
                    logger.warning("Claude overloaded (%d), waiting %ds", e.status_code, wait)
                    time.sleep(wait)
                elif e.status_code == 402 or (
                    e.status_code == 400 and "credit balance is too low" in str(e)
                ):
                    logger.error(
                        "CREDITS EXHAUSTED — Claude API returned %d. "
                        "Top up at console.anthropic.com → Plans & Billing.",
                        e.status_code,
                    )
                    raise  # don't retry — credits won't come back on retry
                else:
                    raise
        raise RuntimeError(f"Claude API failed after {CLAUDE_RETRY_ATTEMPTS} attempts")

    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _sync_call),
            timeout=150,  # 2.5 min hard ceiling — SDK timeout is 2 min
        )
    except asyncio.TimeoutError:
        logger.error("Claude API call timed out after 150s — skipping this symbol")
        raise RuntimeError("Claude API timeout")


# ─── JSON parsing ─────────────────────────────────────────────────────────────

def _parse_decision(raw: str, symbol: str, current_price: float) -> AIDecision:
    """Extract and validate JSON from Claude's response."""
    # Strip markdown code fences if present
    text = raw.strip()
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        text = match.group(1)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Claude JSON parse error: %s\nRaw: %s", e, raw[:500])
        return _fallback(symbol, current_price, "JSON parse error")

    direction = str(data.get("direction", "HOLD")).upper()
    if direction not in ("BUY", "SELL", "HOLD"):
        direction = "HOLD"

    confidence   = float(data.get("confidence") or 0)
    entry_price  = float(data.get("entry_price") or current_price)
    stop_loss    = float(data.get("stop_loss") or 0)
    take_profit  = float(data.get("take_profit") or 0)
    reasoning    = str(data.get("reasoning") or "")
    sentiment    = float(data.get("sentiment_score") or 0)
    should_trade = bool(data.get("should_trade", False))
    skip_reason  = str(data.get("skip_reason") or "")
    primary_tf   = str(data.get("primary_timeframe") or ENTRY_TIMEFRAME)
    confluence   = str(data.get("confluence_used") or "")
    rr           = float(data.get("risk_reward") or 0)

    # Validate prices are sensible
    if direction in ("BUY", "SELL"):
        if stop_loss <= 0 or take_profit <= 0:
            logger.warning("Invalid SL/TP from Claude (zero/negative) — overriding to HOLD")
            return _fallback(symbol, current_price, "Invalid SL/TP values")
        # Enforce correct SL/TP direction — prevents reversed logic from executing real orders
        if direction == "BUY" and not (stop_loss < entry_price < take_profit):
            logger.warning(
                "BUY SL/TP wrong side: entry=%.5f SL=%.5f TP=%.5f — HOLD",
                entry_price, stop_loss, take_profit,
            )
            return _fallback(symbol, current_price, "BUY SL/TP not below/above entry")
        if direction == "SELL" and not (take_profit < entry_price < stop_loss):
            logger.warning(
                "SELL SL/TP wrong side: entry=%.5f SL=%.5f TP=%.5f — HOLD",
                entry_price, stop_loss, take_profit,
            )
            return _fallback(symbol, current_price, "SELL SL/TP not above/below entry")
        if rr == 0 and stop_loss > 0 and take_profit > 0:
            risk   = abs(entry_price - stop_loss)
            reward = abs(entry_price - take_profit)
            rr = reward / risk if risk > 0 else 0.0

    # Final gate: enforce min confidence and R:R
    if should_trade and direction != "HOLD":
        if confidence < MIN_CONFIDENCE_TO_TRADE:
            should_trade = False
            skip_reason  = f"Confidence {confidence:.0f}% below gate {MIN_CONFIDENCE_TO_TRADE}%"
        if rr < MIN_RISK_REWARD:
            should_trade = False
            skip_reason  = f"R:R {rr:.2f} below gate {MIN_RISK_REWARD}"

    return AIDecision(
        symbol=symbol,
        direction=direction,
        confidence=confidence,
        entry_price=entry_price,
        stop_loss=stop_loss,
        take_profit=take_profit,
        reasoning=reasoning,
        sentiment_score=sentiment,
        should_trade=should_trade,
        skip_reason=skip_reason,
        primary_timeframe=primary_tf,
        confluence_used=confluence,
        risk_reward=rr,
    )


def _fallback(symbol: str, price: float, reason: str) -> AIDecision:
    return AIDecision(
        symbol=symbol,
        direction="HOLD",
        confidence=0,
        entry_price=price,
        stop_loss=0,
        take_profit=0,
        reasoning=f"Fallback HOLD: {reason}",
        sentiment_score=0,
        should_trade=False,
        skip_reason=reason,
    )


# ─── Public entry point ───────────────────────────────────────────────────────

async def analyse_with_claude(
    symbol: str,
    current_price: float,
    mtf: MTFAnalysis,
    candles_by_tf: dict[str, list],
    news: list[NewsArticle],
    balance: float,
    risk_pct: float,
    max_lots: float,
    recent_trades: list[dict] | None = None,
    calendar_events: list | None = None,
    open_positions: list[dict] | None = None,
) -> AIDecision:
    """
    Build the multi-TF prompt, call Claude, parse the decision.
    Returns AIDecision. Never raises — returns HOLD on any error.
    """
    t0 = time.time()
    prompt = build_prompt(
        symbol, current_price, mtf,
        candles_by_tf, news,
        balance, risk_pct, max_lots,
        recent_trades=recent_trades,
        calendar_events=calendar_events,
        open_positions=open_positions,
    )
    logger.debug("Claude prompt length: %d chars", len(prompt))

    try:
        raw = await _call_claude(prompt)
        decision = _parse_decision(raw, symbol, current_price)
    except Exception as e:
        logger.error("analyse_with_claude %s failed: %s", symbol, e)
        decision = _fallback(symbol, current_price, str(e))

    decision.elapsed_ms = int((time.time() - t0) * 1000)
    logger.info(
        "Claude %s → %s conf=%.0f%% rr=%.2f should_trade=%s (%dms)",
        symbol, decision.direction, decision.confidence,
        decision.risk_reward, decision.should_trade, decision.elapsed_ms,
    )
    return decision
