"""
signals.py — Mechanical signal generation strategies + Multi-Timeframe confluence scorer.
Ported from src/lib/trading-engine.ts — all strategy logic preserved and extended.

Each strategy returns a SignalResult with direction, confidence, and reasons.
combineSignals() merges results from one timeframe.
calc_mtf_confluence() aggregates across all timeframes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from indicators import Candle, IndicatorValues, get_all_indicators
from config import (
    MIN_TF_CONFLUENCE,
    LOT_SCALE_3TF,
    LOT_SCALE_4TF,
    TIMEFRAMES,
    TF_LABELS,
)


# ─── Data structures ──────────────────────────────────────────────────────────

@dataclass
class SignalResult:
    direction: str          # "BUY" | "SELL" | "HOLD"
    confidence: float       # 0–100
    entry_price: float
    stop_loss: float
    take_profit: float
    reasons: list[str] = field(default_factory=list)
    strategy: str = ""


@dataclass
class TFSignal:
    """Signal for a single timeframe."""
    timeframe: str
    direction: str          # "BUY" | "SELL" | "HOLD"
    confidence: float
    entry_price: float
    stop_loss: float
    take_profit: float
    indicators: IndicatorValues
    reasons: list[str] = field(default_factory=list)


@dataclass
class MTFAnalysis:
    """Aggregated multi-timeframe analysis result."""
    symbol: str
    tf_signals: dict[str, TFSignal]     # keyed by TF string e.g. "H1"
    confluence_direction: str           # dominant direction across TFs
    confluence_count: int               # how many TFs agree
    total_tfs: int
    confidence_bonus: float             # added to Claude confidence
    lot_multiplier: float               # scaling factor
    mechanical_direction: str           # same as confluence_direction
    mechanical_confidence: float        # weighted average confidence of agreeing TFs
    entry_price: float
    stop_loss: float
    take_profit: float


# ─── Individual strategies ────────────────────────────────────────────────────

def _rsi_strategy(price: float, ind: IndicatorValues, candles: list[Candle]) -> Optional[SignalResult]:
    rsi  = ind["rsi"]
    atr  = ind["atr"] or (price * 0.001)
    macd = ind["macd_hist"]

    if rsi < 30:
        conf = min(90.0, 50.0 + (30 - rsi) * 2.0)
        reasons = [f"RSI {rsi:.1f} — oversold (<30)"]
        if macd > 0:
            conf = min(90.0, conf + 10.0)
            reasons.append("MACD histogram bullish — confirms RSI buy")
        sl = price - atr * 1.5
        tp = price + atr * 2.5
        return SignalResult("BUY", conf, price, sl, tp, reasons, "RSI")

    if rsi > 70:
        conf = min(90.0, 50.0 + (rsi - 70) * 2.0)
        reasons = [f"RSI {rsi:.1f} — overbought (>70)"]
        if macd < 0:
            conf = min(90.0, conf + 10.0)
            reasons.append("MACD histogram bearish — confirms RSI sell")
        sl = price + atr * 1.5
        tp = price - atr * 2.5
        return SignalResult("SELL", conf, price, sl, tp, reasons, "RSI")

    # Soft RSI signals with MACD confirmation
    if rsi < 40 and macd > 0:
        sl = price - atr * 1.5
        tp = price + atr * 2.5
        return SignalResult("BUY", 52.0, price, sl, tp,
                            [f"RSI {rsi:.1f} soft oversold + bullish MACD"], "RSI")

    if rsi > 60 and macd < 0:
        sl = price + atr * 1.5
        tp = price - atr * 2.5
        return SignalResult("SELL", 52.0, price, sl, tp,
                            [f"RSI {rsi:.1f} soft overbought + bearish MACD"], "RSI")

    return None


def _macd_strategy(price: float, ind: IndicatorValues, candles: list[Candle]) -> Optional[SignalResult]:
    line   = ind["macd_line"]
    signal = ind["macd_signal"]
    hist   = ind["macd_hist"]
    rsi    = ind["rsi"]
    atr    = ind["atr"] or (price * 0.001)

    conf = 55.0
    reasons: list[str] = []

    if hist > 0 and line < signal:
        # Bullish crossover forming
        reasons = ["MACD bullish crossover (histogram positive, line below signal)"]
        if rsi > 50:
            conf += 10.0
            reasons.append(f"RSI {rsi:.1f} confirms bullish momentum")
        if line > 0 and signal > 0:
            conf += 5.0
            reasons.append("Both MACD lines above zero — strong bull zone")
        sl = price - atr * 1.5
        tp = price + atr * 3.0
        return SignalResult("BUY", min(85.0, conf), price, sl, tp, reasons, "MACD")

    if hist < 0 and line > signal:
        # Bearish crossover forming
        reasons = ["MACD bearish crossover (histogram negative, line above signal)"]
        if rsi < 50:
            conf += 10.0
            reasons.append(f"RSI {rsi:.1f} confirms bearish momentum")
        if line < 0 and signal < 0:
            conf += 5.0
            reasons.append("Both MACD lines below zero — strong bear zone")
        sl = price + atr * 1.5
        tp = price - atr * 3.0
        return SignalResult("SELL", min(85.0, conf), price, sl, tp, reasons, "MACD")

    # Strong trend confirmation (both lines same side, histogram expanding)
    if line > 0 and signal > 0 and hist > 0:
        sl = price - atr * 1.5
        tp = price + atr * 3.0
        return SignalResult("BUY", 65.0, price, sl, tp,
                            ["MACD strong bullish — both lines above zero"], "MACD")

    if line < 0 and signal < 0 and hist < 0:
        sl = price + atr * 1.5
        tp = price - atr * 3.0
        return SignalResult("SELL", 65.0, price, sl, tp,
                            ["MACD strong bearish — both lines below zero"], "MACD")

    return None


def _bollinger_strategy(price: float, ind: IndicatorValues, candles: list[Candle]) -> Optional[SignalResult]:
    upper  = ind["bb_upper"]
    mid    = ind["bb_mid"]
    lower  = ind["bb_lower"]
    rsi    = ind["rsi"]
    atr    = ind["atr"] or (price * 0.001)
    band_w = upper - lower

    if band_w == 0:
        return None

    if price <= lower:
        conf = 60.0
        reasons = [f"Price at/below lower Bollinger Band ({lower:.5f})"]
        if rsi < 35:
            conf += 10.0
            reasons.append(f"RSI {rsi:.1f} also oversold — strong buy confluence")
        sl = lower - atr * 0.5
        tp = mid + band_w * 0.5
        return SignalResult("BUY", min(85.0, conf), price, sl, tp, reasons, "Bollinger")

    if price >= upper:
        conf = 60.0
        reasons = [f"Price at/above upper Bollinger Band ({upper:.5f})"]
        if rsi > 65:
            conf += 10.0
            reasons.append(f"RSI {rsi:.1f} also overbought — strong sell confluence")
        sl = upper + atr * 0.5
        tp = mid - band_w * 0.5
        return SignalResult("SELL", min(85.0, conf), price, sl, tp, reasons, "Bollinger")

    # Near lower band with oversold RSI
    if price < mid and rsi < 40:
        sl = lower - atr * 0.5
        tp = mid
        return SignalResult("BUY", 52.0, price, sl, tp,
                            [f"Price below mid-Bollinger, RSI {rsi:.1f} soft oversold"], "Bollinger")

    # Near upper band with overbought RSI
    if price > mid and rsi > 60:
        sl = upper + atr * 0.5
        tp = mid
        return SignalResult("SELL", 52.0, price, sl, tp,
                            [f"Price above mid-Bollinger, RSI {rsi:.1f} soft overbought"], "Bollinger")

    return None


def _trend_strategy(price: float, ind: IndicatorValues, candles: list[Candle]) -> Optional[SignalResult]:
    ema9   = ind["ema9"]
    ema21  = ind["ema21"]
    ema50  = ind["ema50"]
    ema200 = ind["ema200"]
    adx    = ind["adx"]
    atr    = ind["atr"] or (price * 0.001)

    adx_mult = 1.2 if adx > 25 else 0.8

    if ema9 > ema21:
        conf = 45.0
        reasons = [f"EMA9 ({ema9:.5f}) > EMA21 ({ema21:.5f}) — bullish crossover"]
        if ema9 > ema50:
            conf = 65.0
            reasons.append(f"EMA9 > EMA50 ({ema50:.5f}) — intermediate uptrend")
        if ema9 > ema21 > ema50 > ema200:
            conf = 80.0
            reasons.append("Full EMA alignment 9>21>50>200 — strong bull trend")
        conf = min(90.0, conf * adx_mult)
        reasons.append(f"ADX {adx:.1f} ({'strong' if adx > 25 else 'weak'} trend)")
        sl = price - atr * 2.0
        tp = price + atr * 3.0
        return SignalResult("BUY", conf, price, sl, tp, reasons, "Trend")

    if ema9 < ema21:
        conf = 45.0
        reasons = [f"EMA9 ({ema9:.5f}) < EMA21 ({ema21:.5f}) — bearish crossover"]
        if ema9 < ema50:
            conf = 65.0
            reasons.append(f"EMA9 < EMA50 ({ema50:.5f}) — intermediate downtrend")
        if ema9 < ema21 < ema50 < ema200:
            conf = 80.0
            reasons.append("Full EMA alignment 9<21<50<200 — strong bear trend")
        conf = min(90.0, conf * adx_mult)
        reasons.append(f"ADX {adx:.1f} ({'strong' if adx > 25 else 'weak'} trend)")
        sl = price + atr * 2.0
        tp = price - atr * 3.0
        return SignalResult("SELL", conf, price, sl, tp, reasons, "Trend")

    return None


def _candle_momentum_signal(
    price: float, ind: "IndicatorValues", candles: list["Candle"]
) -> Optional["SignalResult"]:
    """
    Detects sustained directional momentum by counting candle direction.
    Fires when 4 of the last 5 candles agree — captures fast trend continuation
    that RSI/BB miss because those strategies are mean-reversion biased.
    """
    if len(candles) < 5:
        return None
    recent = candles[-5:]
    atr = ind["atr"] or price * 0.001
    bearish = sum(1 for c in recent if c["close"] < c["open"])
    bullish = sum(1 for c in recent if c["close"] > c["open"])
    if bearish >= 4:
        return SignalResult("SELL", 68.0, price,
                            price + atr * 1.5, price - atr * 2.5,
                            [f"{bearish}/5 bearish candles — sustained downward momentum"],
                            "CandleMomentum")
    if bullish >= 4:
        return SignalResult("BUY", 68.0, price,
                            price - atr * 1.5, price + atr * 2.5,
                            [f"{bullish}/5 bullish candles — sustained upward momentum"],
                            "CandleMomentum")
    return None


# ─── Per-timeframe signal combiner ───────────────────────────────────────────

def combine_signals(results: list[SignalResult], price: float, atr: float) -> SignalResult:
    """
    Merge multiple strategy outputs into a single consensus signal.
    Dominant direction = whichever direction has more signals.
    Confidence = average of agreeing signals × (0.5 + weight × 0.5).
    """
    valid = [r for r in results if r is not None]
    if not valid:
        sl = price - atr * 1.5
        tp = price + atr * 2.5
        return SignalResult("HOLD", 0.0, price, sl, tp, ["No mechanical signals"], "None")

    buys  = [r for r in valid if r.direction == "BUY"]
    sells = [r for r in valid if r.direction == "SELL"]

    dominant = buys if len(buys) >= len(sells) else sells
    direction = "BUY" if dominant is buys else "SELL"

    if not dominant:
        sl = price - atr * 1.5
        tp = price + atr * 2.5
        return SignalResult("HOLD", 0.0, price, sl, tp, ["Conflicting signals"], "None")

    weight = len(dominant) / len(valid)
    avg_conf = sum(r.confidence for r in dominant) / len(dominant)
    final_conf = avg_conf * (0.5 + weight * 0.5)

    # Use prices from the highest-confidence signal in dominant group
    best = max(dominant, key=lambda r: r.confidence)
    all_reasons = [f"[{r.strategy}] " + "; ".join(r.reasons) for r in dominant]

    return SignalResult(
        direction=direction,
        confidence=min(90.0, final_conf),
        entry_price=best.entry_price,
        stop_loss=best.stop_loss,
        take_profit=best.take_profit,
        reasons=all_reasons,
        strategy=",".join(r.strategy for r in dominant),
    )


def analyze_timeframe(
    symbol: str,
    timeframe: str,
    candles: list[Candle],
) -> TFSignal:
    """Run all 4 strategies on a single timeframe and return a TFSignal."""
    ind   = get_all_indicators(candles)
    price = candles[-1]["close"] if candles else 0.0
    atr   = ind["atr"] or price * 0.001

    raw_signals = [
        _rsi_strategy(price, ind, candles),
        _macd_strategy(price, ind, candles),
        _bollinger_strategy(price, ind, candles),
        _trend_strategy(price, ind, candles),
        _candle_momentum_signal(price, ind, candles),
    ]

    combined = combine_signals([s for s in raw_signals if s is not None], price, atr)

    return TFSignal(
        timeframe=timeframe,
        direction=combined.direction,
        confidence=combined.confidence,
        entry_price=combined.entry_price,
        stop_loss=combined.stop_loss,
        take_profit=combined.take_profit,
        indicators=ind,
        reasons=combined.reasons,
    )


# ─── Multi-timeframe confluence scorer ───────────────────────────────────────

def calc_mtf_confluence(
    symbol: str,
    tf_signals: dict[str, TFSignal],  # keyed by TF e.g. "H1"
) -> MTFAnalysis:
    """
    Aggregate TF signals into a confluence score.
    Returns MTFAnalysis with direction, confidence bonus, and lot multiplier.
    """
    valid_sigs = {
        tf: sig for tf, sig in tf_signals.items()
        if sig.direction in ("BUY", "SELL")
    }

    total = len(tf_signals)

    # M5 is the entry timeframe — its direction takes priority over a majority vote.
    # When M5 has a clear signal, other TFs are counted as confirming or opposing.
    # This prevents M15/H1 mean-reversion lag from overriding a correct M5 momentum signal.
    m5_sig = tf_signals.get("M5")
    if m5_sig and m5_sig.direction in ("BUY", "SELL"):
        dominant_dir   = m5_sig.direction
        confluence_cnt = sum(1 for s in valid_sigs.values() if s.direction == dominant_dir)
    else:
        # No M5 signal — fall back to majority vote across all TFs
        buy_count  = sum(1 for s in valid_sigs.values() if s.direction == "BUY")
        sell_count = sum(1 for s in valid_sigs.values() if s.direction == "SELL")
        if buy_count > sell_count:
            dominant_dir   = "BUY"
            confluence_cnt = buy_count
        elif sell_count > buy_count:
            dominant_dir   = "SELL"
            confluence_cnt = sell_count
        else:
            dominant_dir   = "HOLD"
            confluence_cnt = 0

    # Confidence bonus and lot multiplier based on confluence
    if confluence_cnt >= total:  # 4/4
        confidence_bonus = 25.0
        lot_multiplier   = LOT_SCALE_4TF
    elif confluence_cnt == total - 1:  # 3/4
        confidence_bonus = 15.0
        lot_multiplier   = LOT_SCALE_3TF
    else:  # 2/4 or less
        confidence_bonus = 0.0
        lot_multiplier   = 1.0

    # Weighted-average confidence from agreeing TFs
    agreeing = [s for s in valid_sigs.values() if s.direction == dominant_dir]
    mech_conf = (
        sum(s.confidence for s in agreeing) / len(agreeing)
        if agreeing else 0.0
    )

    # Use M5 prices for entry — M5 is the entry timeframe, not H1
    entry_tf = tf_signals.get("M5") or (agreeing[0] if agreeing else None)
    if entry_tf:
        entry_price = entry_tf.entry_price
        stop_loss   = entry_tf.stop_loss
        take_profit = entry_tf.take_profit
    else:
        entry_price = stop_loss = take_profit = 0.0

    return MTFAnalysis(
        symbol=symbol,
        tf_signals=tf_signals,
        confluence_direction=dominant_dir,
        confluence_count=confluence_cnt,
        total_tfs=total,
        confidence_bonus=confidence_bonus,
        lot_multiplier=lot_multiplier,
        mechanical_direction=dominant_dir,
        mechanical_confidence=mech_conf,
        entry_price=entry_price,
        stop_loss=stop_loss,
        take_profit=take_profit,
    )


def should_run_claude(mtf: MTFAnalysis) -> bool:
    """Pre-filter: only run expensive Claude API call if minimum confluence met."""
    return (
        mtf.confluence_count >= MIN_TF_CONFLUENCE
        and mtf.confluence_direction != "HOLD"
    )
