"""
indicators.py — Technical indicator calculations using numpy.
Ported from src/lib/trading-engine.ts — all formulas preserved exactly.
Called once per symbol per timeframe each scan cycle.
"""

from __future__ import annotations

import numpy as np
from typing import TypedDict


class Candle(TypedDict):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class IndicatorValues(TypedDict):
    rsi: float
    macd_line: float
    macd_signal: float
    macd_hist: float
    bb_upper: float
    bb_mid: float
    bb_lower: float
    ema9: float
    ema21: float
    ema50: float
    ema200: float
    atr: float
    adx: float
    stoch_k: float
    stoch_d: float
    vol_sma: float


# ─── Primitive calculations ───────────────────────────────────────────────────

def calc_sma(data: list[float], period: int) -> list[float]:
    if len(data) < period:
        return []
    arr = np.array(data, dtype=float)
    result: list[float] = []
    for i in range(period - 1, len(arr)):
        result.append(float(np.mean(arr[i - period + 1 : i + 1])))
    return result


def calc_ema(data: list[float], period: int) -> list[float]:
    if len(data) < period:
        return []
    arr = np.array(data, dtype=float)
    k = 2.0 / (period + 1)
    result: list[float] = [float(np.mean(arr[:period]))]
    for price in arr[period:]:
        result.append(float(price * k + result[-1] * (1 - k)))
    return result


def calc_rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    arr = np.array(closes, dtype=float)
    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    avg_gain = float(np.mean(gains[:period]))
    avg_loss = float(np.mean(losses[:period]))

    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100 - (100 / (1 + rs)))


def calc_macd(
    closes: list[float],
    fast: int = 12,
    slow: int = 26,
    signal_period: int = 9,
) -> tuple[float, float, float]:
    """Returns (macd_line, signal_line, histogram)."""
    if len(closes) < slow + signal_period:
        return 0.0, 0.0, 0.0

    ema_fast = calc_ema(closes, fast)
    ema_slow = calc_ema(closes, slow)

    # Align lengths — EMA fast is longer
    min_len = min(len(ema_fast), len(ema_slow))
    macd_series = [
        ema_fast[len(ema_fast) - min_len + i] - ema_slow[len(ema_slow) - min_len + i]
        for i in range(min_len)
    ]

    if len(macd_series) < signal_period:
        return 0.0, 0.0, 0.0

    signal_series = calc_ema(macd_series, signal_period)
    if not signal_series:
        return 0.0, 0.0, 0.0

    macd_line = macd_series[-1]
    signal_line = signal_series[-1]
    histogram = macd_line - signal_line
    return float(macd_line), float(signal_line), float(histogram)


def calc_bollinger(
    closes: list[float], period: int = 20, std_dev: float = 2.0
) -> tuple[float, float, float]:
    """Returns (upper, mid, lower)."""
    if len(closes) < period:
        price = closes[-1] if closes else 0.0
        return price, price, price
    arr = np.array(closes[-period:], dtype=float)
    mid = float(np.mean(arr))
    std = float(np.std(arr, ddof=0))
    return mid + std_dev * std, mid, mid - std_dev * std


def calc_atr(candles: list[Candle], period: int = 14) -> float:
    if len(candles) < 2:
        return 0.0
    true_ranges: list[float] = []
    for i in range(1, len(candles)):
        high = candles[i]["high"]
        low = candles[i]["low"]
        prev_close = candles[i - 1]["close"]
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        true_ranges.append(tr)
    if not true_ranges:
        return 0.0
    return float(np.mean(true_ranges[-period:]))


def calc_stochastic(
    candles: list[Candle], k_period: int = 14, d_period: int = 3
) -> tuple[float, float]:
    """Returns (K, D)."""
    if len(candles) < k_period:
        return 50.0, 50.0
    recent = candles[-k_period:]
    highs = [c["high"] for c in recent]
    lows = [c["low"] for c in recent]
    highest = max(highs)
    lowest = min(lows)
    close = candles[-1]["close"]
    if highest == lowest:
        return 50.0, 50.0
    k = ((close - lowest) / (highest - lowest)) * 100.0

    # Compute D as SMA of last d_period K values
    k_values: list[float] = []
    for j in range(d_period):
        idx_end = len(candles) - j
        if idx_end < k_period:
            break
        seg = candles[idx_end - k_period : idx_end]
        h = max(c["high"] for c in seg)
        lo = min(c["low"] for c in seg)
        cl = candles[idx_end - 1]["close"]
        k_values.append(((cl - lo) / (h - lo)) * 100.0 if h != lo else 50.0)

    d = float(np.mean(k_values)) if k_values else k
    return float(k), float(d)


def calc_adx(candles: list[Candle], period: int = 14) -> float:
    """Average Directional Index — trend strength (>25 = strong trend)."""
    if len(candles) < period + 1:
        return 0.0

    plus_dm_list: list[float] = []
    minus_dm_list: list[float] = []
    tr_list: list[float] = []

    for i in range(1, len(candles)):
        high = candles[i]["high"]
        low = candles[i]["low"]
        prev_high = candles[i - 1]["high"]
        prev_low = candles[i - 1]["low"]
        prev_close = candles[i - 1]["close"]

        up_move = high - prev_high
        down_move = prev_low - low
        plus_dm_list.append(up_move if up_move > down_move and up_move > 0 else 0.0)
        minus_dm_list.append(down_move if down_move > up_move and down_move > 0 else 0.0)
        tr_list.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))

    def smooth(values: list[float]) -> list[float]:
        if len(values) < period:
            return []
        smoothed = [sum(values[:period])]
        for v in values[period:]:
            smoothed.append(smoothed[-1] - smoothed[-1] / period + v)
        return smoothed

    s_tr   = smooth(tr_list)
    s_plus = smooth(plus_dm_list)
    s_minus= smooth(minus_dm_list)

    if not s_tr or s_tr[-1] == 0:
        return 0.0

    plus_di  = 100 * s_plus[-1]  / s_tr[-1]
    minus_di = 100 * s_minus[-1] / s_tr[-1]
    dx_sum   = plus_di + minus_di
    if dx_sum == 0:
        return 0.0
    dx = 100 * abs(plus_di - minus_di) / dx_sum

    # Return the rolling average of last `period` DX values (simplified)
    dx_values: list[float] = []
    for k in range(-min(period, len(s_tr)), 0):
        _pdi = 100 * s_plus[k]  / s_tr[k] if s_tr[k] else 0.0
        _mdi = 100 * s_minus[k] / s_tr[k] if s_tr[k] else 0.0
        _sum = _pdi + _mdi
        dx_values.append(100 * abs(_pdi - _mdi) / _sum if _sum else 0.0)

    return float(np.mean(dx_values)) if dx_values else float(dx)


# ─── Price-action helpers ─────────────────────────────────────────────────────

def detect_candle_patterns(candles: list[Candle]) -> list[str]:
    """Detect common single/double candle patterns on the last 2 candles."""
    if len(candles) < 2:
        return []
    patterns: list[str] = []
    curr = candles[-1]
    prev = candles[-2]

    body = abs(curr["close"] - curr["open"])
    full_range = curr["high"] - curr["low"]
    if full_range == 0:
        return []

    upper_wick = curr["high"] - max(curr["close"], curr["open"])
    lower_wick = min(curr["close"], curr["open"]) - curr["low"]

    # Doji
    if body < full_range * 0.1:
        patterns.append("Doji")

    # Hammer (bullish reversal at bottom)
    if lower_wick > body * 2 and upper_wick < body * 0.5 and curr["close"] > curr["open"]:
        patterns.append("Hammer")

    # Shooting star (bearish reversal at top)
    if upper_wick > body * 2 and lower_wick < body * 0.5 and curr["close"] < curr["open"]:
        patterns.append("Shooting Star")

    # Bullish engulfing
    if (
        prev["close"] < prev["open"]  # previous bearish
        and curr["close"] > curr["open"]  # current bullish
        and curr["open"] < prev["close"]
        and curr["close"] > prev["open"]
    ):
        patterns.append("Bullish Engulfing")

    # Bearish engulfing
    if (
        prev["close"] > prev["open"]  # previous bullish
        and curr["close"] < curr["open"]  # current bearish
        and curr["open"] > prev["close"]
        and curr["close"] < prev["open"]
    ):
        patterns.append("Bearish Engulfing")

    return patterns


def analyze_price_action(candles: list[Candle]) -> str:
    """Return a short text summary of recent price action (last 10 candles)."""
    if len(candles) < 10:
        return "Insufficient candle data."
    recent = candles[-10:]
    closes = [c["close"] for c in recent]
    highs  = [c["high"]  for c in recent]
    lows   = [c["low"]   for c in recent]

    pct_change = (closes[-1] - closes[0]) / closes[0] * 100
    if pct_change > 0.1:
        trend = "BULLISH"
    elif pct_change < -0.1:
        trend = "BEARISH"
    else:
        trend = "SIDEWAYS"

    high_10 = max(highs)
    low_10  = min(lows)
    rng     = high_10 - low_10
    pos_pct = (closes[-1] - low_10) / rng * 100 if rng else 50.0

    momentum_4 = (closes[-1] - closes[-4]) / closes[-4] * 100
    patterns   = detect_candle_patterns(candles)
    pat_str    = ", ".join(patterns) if patterns else "No pattern"

    return (
        f"Trend(10): {trend} ({pct_change:+.3f}%) | "
        f"Range: {low_10:.5f}–{high_10:.5f} | "
        f"Price at {pos_pct:.0f}% of range | "
        f"Momentum(4): {momentum_4:+.3f}% | "
        f"Pattern: {pat_str}"
    )


# ─── Master function ──────────────────────────────────────────────────────────

def get_all_indicators(candles: list[Candle]) -> IndicatorValues:
    """Calculate every indicator in one shot. Cache the result for the cycle."""
    closes = [c["close"] for c in candles]
    volumes = [c["volume"] for c in candles]

    rsi = calc_rsi(closes)
    macd_line, macd_sig, macd_hist = calc_macd(closes)
    bb_upper, bb_mid, bb_lower = calc_bollinger(closes)
    atr  = calc_atr(candles)
    adx  = calc_adx(candles)
    k, d = calc_stochastic(candles)

    ema9_v   = calc_ema(closes, 9)
    ema21_v  = calc_ema(closes, 21)
    ema50_v  = calc_ema(closes, 50)
    ema200_v = calc_ema(closes, 200)
    vol_sma_v= calc_sma(volumes, 20)

    return IndicatorValues(
        rsi=rsi,
        macd_line=macd_line,
        macd_signal=macd_sig,
        macd_hist=macd_hist,
        bb_upper=bb_upper,
        bb_mid=bb_mid,
        bb_lower=bb_lower,
        ema9=ema9_v[-1]   if ema9_v   else closes[-1],
        ema21=ema21_v[-1] if ema21_v  else closes[-1],
        ema50=ema50_v[-1] if ema50_v  else closes[-1],
        ema200=ema200_v[-1]if ema200_v else closes[-1],
        atr=atr,
        adx=adx,
        stoch_k=k,
        stoch_d=d,
        vol_sma=vol_sma_v[-1] if vol_sma_v else 0.0,
    )
