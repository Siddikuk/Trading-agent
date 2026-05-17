"""
Halal Growth Stock Screener — Zero Tolerance Mode
Scans global stocks for Sharia-compliant high-growth opportunities.

Usage:
    python main.py              # full global scan
    python main.py --fast       # US-only, faster run for testing
    python main.py --top 30     # show top 30 results (default: 20)
"""

import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import pandas as pd
from tqdm import tqdm

from halal_filter import check_halal_zero_tolerance
from scorer import calculate_growth_score
from universe import get_candidate_tickers


CACHE_FILE = 'screener_cache.json'


def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f)


def format_market_cap(val) -> str:
    if val is None:
        return 'N/A'
    val = float(val)
    if val >= 1e9:
        return f'${val/1e9:.2f}B'
    if val >= 1e6:
        return f'${val/1e6:.0f}M'
    return f'${val:,.0f}'


def format_pct(val) -> str:
    if val is None:
        return 'N/A'
    return f'{float(val)*100:+.1f}%'


def print_report(stocks: list[dict], top_n: int):
    print()
    print('=' * 100)
    print(f'  HALAL GROWTH STOCKS — Zero Tolerance   |   {datetime.now().strftime("%d %b %Y %H:%M")}')
    print('=' * 100)

    if not stocks:
        print('  No stocks found matching all criteria.')
        return

    header = f"{'#':<4} {'Ticker':<12} {'Name':<32} {'Country':<14} {'Market Cap':<13} {'Rev Growth':<12} {'Earn Growth':<13} {'Margin':<10} {'Score'}"
    print(f'\n{header}')
    print('-' * 110)

    for i, s in enumerate(stocks[:top_n], 1):
        name = (s.get('name') or 'N/A')[:30]
        ticker = (s.get('ticker') or '')[:11]
        country = (s.get('country') or 'N/A')[:13]
        cap = format_market_cap(s.get('marketCap'))
        rev_g = format_pct(s.get('revenueGrowth'))
        earn_g = format_pct(s.get('earningsGrowth'))
        margin = format_pct(s.get('grossMargins'))
        score = s.get('score', 0)

        print(f'{i:<4} {ticker:<12} {name:<32} {country:<14} {cap:<13} {rev_g:<12} {earn_g:<13} {margin:<10} {score}/100')

    print()
    print(f'  Showing top {min(top_n, len(stocks))} of {len(stocks)} Halal-compliant growth stocks found.')
    print()

    # Detailed view for top 5
    print('=' * 100)
    print('  TOP 5 — DETAILED VIEW')
    print('=' * 100)
    for s in stocks[:5]:
        print(f"""
  {s.get('ticker')} — {s.get('name')}
  ─────────────────────────────────────────
  Country    : {s.get('country')}   |   Exchange: {s.get('exchange')}   |   Currency: {s.get('currency')}
  Sector     : {s.get('sector')}
  Industry   : {s.get('industry')}
  Market Cap : {format_market_cap(s.get('marketCap'))}
  Price      : {s.get('currentPrice')} {s.get('currency')}
  Rev Growth : {format_pct(s.get('revenueGrowth'))}   |   Earn Growth: {format_pct(s.get('earningsGrowth'))}
  Gross Margin: {format_pct(s.get('grossMargins'))}  |   ROE: {format_pct(s.get('returnOnEquity'))}
  Total Debt : ${s.get('totalDebt', 0):,.0f}  ✅  |   Interest Income: ${s.get('interestIncome', 0):,.0f}  ✅
  Score      : {s.get('score')}/100
  Website    : {s.get('website', 'N/A')}
  About      : {s.get('summary', 'N/A')}
""")


def main():
    parser = argparse.ArgumentParser(description='Halal Growth Stock Screener')
    parser.add_argument('--fast', action='store_true', help='US-only fast mode (fewer stocks)')
    parser.add_argument('--top', type=int, default=20, help='Number of top results to show')
    parser.add_argument('--workers', type=int, default=8, help='Parallel workers for data fetching')
    parser.add_argument('--no-cache', action='store_true', help='Ignore cached results')
    parser.add_argument('--max-per-country', type=int, default=300, help='Max stocks per country')
    args = parser.parse_args()

    print()
    print('╔══════════════════════════════════════════════════════════╗')
    print('║      HALAL GROWTH STOCK SCREENER — Zero Tolerance        ║')
    print('║      No debt. No interest. Sharia-compliant only.        ║')
    print('╚══════════════════════════════════════════════════════════╝')
    print()

    start_time = time.time()

    # Step 1: Universe
    print('STEP 1 — Building global stock universe')
    print('─' * 50)
    if args.fast:
        import financedatabase as fd
        from config import FORBIDDEN_SECTORS, FORBIDDEN_INDUSTRIES, FORBIDDEN_NAME_KEYWORDS
        equities = fd.Equities()
        df = equities.select(country='United States')
        # Only major US exchanges — best yfinance coverage
        df = df[df['exchange'].isin({'NMS', 'NYQ', 'NGM', 'NCM'})]
        df = df[~df['sector'].isin(FORBIDDEN_SECTORS)]
        df = df[~df['industry'].isin(FORBIDDEN_INDUSTRIES)]
        # Prefer large/mid/small cap (better data quality) over micro cap
        cap_order = {'Large Cap': 0, 'Mid Cap': 1, 'Small Cap': 2, 'Micro Cap': 3}
        df['_r'] = df['market_cap'].map(cap_order).fillna(4)
        df = df.sort_values('_r').head(800)
        candidates = df.index.tolist()
        print(f'  Fast mode: {len(candidates)} US candidates (NYSE/NASDAQ only)')
    else:
        candidates = get_candidate_tickers(max_per_country=args.max_per_country)

    print()

    # Step 2: Halal filter + data fetch (with cache)
    print('STEP 2 — Fetching live data & applying zero-tolerance Halal filter')
    print('─' * 50)
    print('  Rules: total debt = $0  |  interest income = $0  |  clean business')
    print()

    cache = {} if args.no_cache else load_cache()
    results = []
    to_fetch = [t for t in candidates if t not in cache]
    cached_hits = [cache[t] for t in candidates if t in cache and cache[t] is not None]

    print(f'  Cached: {len(cached_hits)} | To fetch: {len(to_fetch)}')

    if to_fetch:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {executor.submit(check_halal_zero_tolerance, t): t for t in to_fetch}
            with tqdm(total=len(to_fetch), desc='  Screening', unit='stock') as pbar:
                for future in as_completed(futures):
                    ticker = futures[future]
                    result = future.result()
                    cache[ticker] = result  # cache even None results
                    if result is not None:
                        results.append(result)
                    pbar.update(1)

        save_cache(cache)

    results.extend(cached_hits)
    print(f'\n  ✅ {len(results)} stocks passed Halal zero-tolerance filter')

    if not results:
        print('\n  No stocks found. Try running with --no-cache or --fast to debug.')
        return

    # Step 3: Growth screening — remove weak growth stocks
    print()
    print('STEP 3 — Filtering for growth potential')
    print('─' * 50)
    from config import MIN_MARKET_CAP, MAX_MARKET_CAP, MIN_REVENUE_GROWTH
    growth_filtered = []
    for s in results:
        cap = s.get('marketCap') or 0
        rev_growth = s.get('revenueGrowth')
        if cap < MIN_MARKET_CAP or cap > MAX_MARKET_CAP:
            continue
        if rev_growth is not None and rev_growth < MIN_REVENUE_GROWTH:
            continue
        growth_filtered.append(s)

    print(f'  {len(growth_filtered)} stocks show growth potential')

    # Step 4: Score
    print()
    print('STEP 4 — Scoring by growth signals')
    print('─' * 50)
    for s in growth_filtered:
        s['score'] = calculate_growth_score(s)

    growth_filtered.sort(key=lambda x: x['score'], reverse=True)
    print(f'  Scoring complete. Top score: {growth_filtered[0]["score"] if growth_filtered else 0}/100')

    # Step 5: Report
    print()
    print_report(growth_filtered, top_n=args.top)

    # Save CSV
    df_out = pd.DataFrame(growth_filtered)
    csv_file = f'halal_results_{datetime.now().strftime("%Y%m%d_%H%M")}.csv'
    df_out.to_csv(csv_file, index=False)
    print(f'  Full results saved to: {csv_file}')

    elapsed = time.time() - start_time
    print(f'  Total time: {elapsed/60:.1f} minutes')
    print()


if __name__ == '__main__':
    main()
