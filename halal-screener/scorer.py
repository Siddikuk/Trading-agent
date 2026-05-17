"""
Scores Halal-filtered stocks by growth potential (0–100).
Higher = more likely to be an early-stage high-growth company.
"""

from config import SCORE_WEIGHTS, MIN_MARKET_CAP, MAX_MARKET_CAP


def _score_revenue_growth(growth: float | None) -> float:
    """30 points. Rewards strong positive growth, penalises negative."""
    if growth is None:
        return 5.0  # neutral — data missing
    if growth >= 0.50:   return 30.0  # 50%+ growth → full marks
    if growth >= 0.30:   return 24.0
    if growth >= 0.20:   return 20.0
    if growth >= 0.10:   return 15.0
    if growth >= 0.0:    return 10.0
    return 0.0  # negative growth


def _score_earnings_growth(growth: float | None) -> float:
    """20 points."""
    if growth is None:
        return 5.0
    if growth >= 0.50:   return 20.0
    if growth >= 0.30:   return 16.0
    if growth >= 0.15:   return 12.0
    if growth >= 0.0:    return 8.0
    return 0.0


def _score_gross_margin(margin: float | None) -> float:
    """15 points. High margins = pricing power = sustainable growth."""
    if margin is None:
        return 4.0
    if margin >= 0.70:   return 15.0  # SaaS/software-like margins
    if margin >= 0.50:   return 12.0
    if margin >= 0.35:   return 9.0
    if margin >= 0.20:   return 6.0
    if margin >= 0.0:    return 3.0
    return 0.0  # negative gross margin


def _score_market_cap_fit(market_cap: float | None) -> float:
    """
    15 points. Sweet spot for early-stage growth: $200M–$3B.
    Too small = risky, too large = less room to 10x.
    """
    if market_cap is None:
        return 3.0
    if market_cap < MIN_MARKET_CAP:
        return 0.0
    if 200_000_000 <= market_cap <= 3_000_000_000:
        return 15.0   # perfect sweet spot
    if 100_000_000 <= market_cap < 200_000_000:
        return 10.0
    if 3_000_000_000 < market_cap <= 10_000_000_000:
        return 8.0
    if market_cap > 10_000_000_000:
        return 4.0
    return 5.0


def _score_roe(roe: float | None) -> float:
    """10 points. Return on equity — how efficiently they use shareholder money."""
    if roe is None:
        return 2.0
    if roe >= 0.25:      return 10.0
    if roe >= 0.15:      return 7.0
    if roe >= 0.05:      return 4.0
    if roe >= 0.0:       return 2.0
    return 0.0


def _score_cash_richness(total_cash: float | None, market_cap: float | None) -> float:
    """
    10 points. Cash as % of market cap — companies with lots of cash and zero
    debt are exceptionally strong from a Halal and financial health perspective.
    """
    if total_cash is None or market_cap is None or market_cap <= 0:
        return 2.0
    ratio = total_cash / market_cap
    if ratio >= 0.30:    return 10.0  # 30%+ of market cap is cash → exceptional
    if ratio >= 0.15:    return 7.0
    if ratio >= 0.05:    return 4.0
    return 2.0


def calculate_growth_score(stock: dict) -> float:
    """Returns a total score 0–100 for a Halal-filtered stock."""
    score = 0.0
    score += _score_revenue_growth(stock.get('revenueGrowth'))
    score += _score_earnings_growth(stock.get('earningsGrowth'))
    score += _score_gross_margin(stock.get('grossMargins'))
    score += _score_market_cap_fit(stock.get('marketCap'))
    score += _score_roe(stock.get('returnOnEquity'))
    score += _score_cash_richness(stock.get('totalCash'), stock.get('marketCap'))
    return round(score, 1)
