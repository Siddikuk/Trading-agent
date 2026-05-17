"""
Builds a pre-filtered global stock universe using financedatabase.
This stage uses NO live API calls — it's purely a static filter.
The goal is to reduce 160k+ global stocks down to a few thousand
clean candidates worth checking with yfinance.
"""

import financedatabase as fd
import pandas as pd
from config import (
    FORBIDDEN_SECTORS, FORBIDDEN_INDUSTRIES,
    BORDERLINE_INDUSTRIES, FORBIDDEN_NAME_KEYWORDS,
    SUPPORTED_EXCHANGES,
)


def _has_forbidden_keyword(text: str) -> bool:
    if not isinstance(text, str):
        return False
    text_lower = text.lower()
    return any(kw in text_lower for kw in FORBIDDEN_NAME_KEYWORDS)


def get_candidate_tickers(max_per_country: int = 500) -> list[str]:
    """
    Returns a list of ticker symbols that have passed the static pre-filter:
    - Not in a forbidden sector or industry
    - No forbidden keywords in company name or summary
    - On a supported exchange (good yfinance coverage)
    """
    print("  Loading financedatabase equity universe...")
    equities = fd.Equities()
    df = equities.select()

    initial_count = len(df)
    print(f"  Total global equities in database: {initial_count:,}")

    # 1. Remove forbidden sectors
    df = df[~df['sector'].isin(FORBIDDEN_SECTORS)]
    print(f"  After removing forbidden sectors: {len(df):,}")

    # 2. Remove forbidden industries
    df = df[~df['industry'].isin(FORBIDDEN_INDUSTRIES)]
    print(f"  After removing forbidden industries: {len(df):,}")

    # 3. For borderline industries, check the company name for forbidden keywords
    borderline_mask = df['industry'].isin(BORDERLINE_INDUSTRIES)
    borderline_df = df[borderline_mask]
    borderline_clean = borderline_df[
        ~borderline_df['name'].apply(_has_forbidden_keyword) &
        ~borderline_df['summary'].apply(_has_forbidden_keyword)
    ]
    df = pd.concat([df[~borderline_mask], borderline_clean])
    print(f"  After cleaning borderline industries: {len(df):,}")

    # 4. Remove any remaining companies with forbidden keywords in their name
    df = df[~df['name'].apply(_has_forbidden_keyword)]
    print(f"  After keyword filter on company names: {len(df):,}")

    # 5. Only keep exchanges with good yfinance coverage
    df = df[df['exchange'].isin(SUPPORTED_EXCHANGES)]
    print(f"  After filtering to supported exchanges: {len(df):,}")

    # 6. Remove rows with no name (data quality)
    df = df[df['name'].notna() & (df['name'] != '')]

    # 7. Limit per country to avoid over-indexing on one market
    # (e.g., US has 23k stocks — we don't need all of them)
    if max_per_country:
        # Prefer Large Cap > Mid Cap > Small Cap for data quality
        cap_order = {'Large Cap': 0, 'Mid Cap': 1, 'Small Cap': 2, 'Micro Cap': 3}
        df['_cap_rank'] = df['market_cap'].map(cap_order).fillna(4)
        df = df.sort_values('_cap_rank')
        df = (
            df.groupby('country', group_keys=False)
            .apply(lambda g: g.head(max_per_country))
        )
        df = df.drop(columns=['_cap_rank'])
        print(f"  After capping {max_per_country} stocks per country: {len(df):,}")

    tickers = df.index.tolist()
    print(f"\n  Final candidate universe: {len(tickers):,} stocks")
    return tickers
