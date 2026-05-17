"""
Zero-tolerance Halal filter using live yfinance data.
A stock passes ONLY if:
  1. Total interest-bearing debt = 0 (confirmed)
  2. Interest income = 0 (confirmed or not reported)
  3. Business activity is clean (second check using live sector/industry)
"""

import yfinance as yf
import pandas as pd
from config import FORBIDDEN_SECTORS, FORBIDDEN_INDUSTRIES, FORBIDDEN_NAME_KEYWORDS


def _has_forbidden_keyword(text: str) -> bool:
    if not isinstance(text, str):
        return False
    text_lower = text.lower()
    return any(kw in text_lower for kw in FORBIDDEN_NAME_KEYWORDS)


def _get_interest_income(ticker_obj: yf.Ticker) -> float:
    """Extract interest income from income statement. Returns 0 if not found."""
    try:
        financials = ticker_obj.financials  # annual income statement
        if financials is None or financials.empty:
            return 0.0

        # yfinance uses different key names depending on version
        interest_keys = [
            'Interest Income', 'Net Interest Income',
            'Interest And Dividend Income', 'InterestIncome',
        ]
        for key in interest_keys:
            if key in financials.index:
                val = financials.loc[key].iloc[0]  # most recent year
                if pd.notna(val):
                    return float(val)
    except Exception:
        pass
    return 0.0


def _get_financial_debt(ticker_obj: yf.Ticker) -> float:
    """
    Returns only interest-bearing financial debt (loans, bonds, credit facilities).
    Excludes operating lease obligations, which are permissible under Sharia
    (renting office space or equipment is not a ribā transaction).
    """
    try:
        bs = ticker_obj.balance_sheet
        if bs is None or bs.empty:
            return 0.0

        def _val(key) -> float:
            if key in bs.index:
                v = bs.loc[key].iloc[0]
                return float(v) if pd.notna(v) else 0.0
            return 0.0

        # Best case: yfinance reports 'Long Term Debt' separately (excludes leases)
        if 'Long Term Debt' in bs.index:
            long_term = _val('Long Term Debt')
        else:
            # Fallback: subtract capital lease obligations from the combined line
            lt_combined = _val('Long Term Debt And Capital Lease Obligation')
            lt_lease    = _val('Long Term Capital Lease Obligation')
            long_term   = max(0.0, lt_combined - lt_lease)

        # Current portion: financial debt only (subtract current lease portion)
        current_combined = _val('Current Debt And Capital Lease Obligation')
        current_lease    = _val('Current Capital Lease Obligation')
        current_financial = max(0.0, current_combined - current_lease)

        return long_term + current_financial

    except Exception:
        return 0.0


def check_halal_zero_tolerance(ticker_symbol: str) -> dict | None:
    """
    Fetches live data for a ticker and applies zero-tolerance Halal checks.
    Returns a dict with stock data if it passes, or None if it fails.
    """
    try:
        t = yf.Ticker(ticker_symbol)
        info = t.info

        # Skip if no useful data returned (yfinance returns minimal dict for unknown tickers)
        if not info or info.get('quoteType') not in ('EQUITY', 'ETF'):
            return None

        # Must have a real company name
        name = info.get('longName') or info.get('shortName', '')
        if not name:
            return None

        # Require minimum data quality — skip stocks yfinance has no real data for
        if not info.get('sector') and not info.get('marketCap'):
            return None

        # --- Business activity check (live data) ---
        sector = info.get('sector', '') or ''
        industry = info.get('industry', '') or ''

        if sector in FORBIDDEN_SECTORS:
            return None
        if industry in FORBIDDEN_INDUSTRIES:
            return None
        if _has_forbidden_keyword(name):
            return None
        if _has_forbidden_keyword(info.get('longBusinessSummary', '')):
            return None

        # --- Zero-tolerance debt check (financial debt only, not operating leases) ---
        financial_debt = _get_financial_debt(t)
        if financial_debt > 0:
            return None  # any interest-bearing financial debt = rejected

        # --- Interest income check (max 1% of revenue — requires purification) ---
        interest_income = _get_interest_income(t)
        total_revenue = info.get('totalRevenue') or 0
        if interest_income > 0 and total_revenue > 0:
            interest_ratio = interest_income / total_revenue
            from config import MAX_INTEREST_INCOME_RATIO
            if interest_ratio > MAX_INTEREST_INCOME_RATIO:
                return None  # too much interest income — rejected
        elif interest_income > 0 and total_revenue == 0:
            return None  # has interest income but no real business revenue

        # --- Passed all checks — collect data for scoring ---
        return {
            'ticker': ticker_symbol,
            'name': name,
            'sector': sector,
            'industry': industry,
            'country': info.get('country', 'N/A'),
            'currency': info.get('currency', 'N/A'),
            'exchange': info.get('exchange', 'N/A'),
            'marketCap': info.get('marketCap'),
            'currentPrice': info.get('currentPrice') or info.get('regularMarketPrice'),
            'revenueGrowth': info.get('revenueGrowth'),
            'earningsGrowth': info.get('earningsGrowth'),
            'grossMargins': info.get('grossMargins'),
            'operatingMargins': info.get('operatingMargins'),
            'returnOnEquity': info.get('returnOnEquity'),
            'totalCash': info.get('totalCash'),
            'totalRevenue': info.get('totalRevenue'),
            'totalDebt': financial_debt,
            'interestIncome': interest_income,
            'interestIncomeRatio': round(interest_income / total_revenue, 4) if total_revenue > 0 else 0,
            'purificationRequired': interest_income > 0,
            'trailingPE': info.get('trailingPE'),
            'forwardPE': info.get('forwardPE'),
            'website': info.get('website', ''),
            'summary': (info.get('longBusinessSummary', '') or '')[:200],
        }

    except Exception:
        return None
