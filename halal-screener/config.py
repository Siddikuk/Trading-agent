# Zero-tolerance Halal screener configuration

# Entirely forbidden sectors
# Note: financedatabase uses 'Financials', yfinance uses 'Financial Services'
FORBIDDEN_SECTORS = {
    'Financials',
    'Financial Services',
}

# Forbidden industries within otherwise clean sectors
FORBIDDEN_INDUSTRIES = {
    'Tobacco',
    'Aerospace & Defense',  # weapons manufacturing
}

# Industries that need a keyword check on the company name/description
# (not fully forbidden — a "Beverages" company could be halal juice or haram alcohol)
BORDERLINE_INDUSTRIES = {
    'Beverages',
    'Hotels, Restaurants & Leisure',
}

# Keywords that make a company name/summary suspicious → gets rejected
FORBIDDEN_NAME_KEYWORDS = [
    'bank', 'bancorp', 'banque', 'banco',
    'insurance', 'insurer', 'assurance',
    'casino', 'gambling', 'gambl', 'lotter', 'bookie', 'bettin',
    'alcohol', 'brewery', 'brewer', 'distill', 'winery', 'winemaker',
    'beer', 'wine', 'spirits', 'whisky', 'whiskey', 'vodka', 'rum', 'gin',
    'tobacco', 'cigarette', 'cigar',
    'adult entertainment', 'pornograph', 'playboy',
    'pork', 'swine',
]

# Exchanges with reliable yfinance data coverage
# Format: exchange code as it appears in financedatabase
SUPPORTED_EXCHANGES = {
    # United States
    'NMS', 'NYQ', 'NGM', 'NCM', 'ASE', 'PCX',
    # United Kingdom
    'LSE',
    # Canada
    'TOR', 'VAN',
    # Australia
    'ASX',
    # Germany
    'XETRA', 'GER', 'FRA',
    # France
    'PAR',
    # Saudi Arabia
    'SAU',
    # Malaysia
    'KLS',
    # Indonesia
    'JKT',
    # UAE
    'DFM', 'ADX',
    # Qatar
    'QAT',
    # Turkey
    'IST',
    # India
    'NSI', 'BSE',
    # Japan (limited but available)
    'TKS',
    # Netherlands
    'AMS',
    # Sweden
    'STO',
    # Switzerland
    'SWX',
}

# Growth screening thresholds
MIN_REVENUE_GROWTH = 0.10       # 10% YoY minimum revenue growth
MIN_MARKET_CAP = 30_000_000     # $30M — not a micro/penny stock
MAX_MARKET_CAP = 20_000_000_000 # $20B — still room to grow significantly
MIN_GROSS_MARGIN = 0.0          # must be at least break-even gross profit

# Scoring weights (must sum to 100)
SCORE_WEIGHTS = {
    'revenue_growth':   30,  # biggest signal for early-stage growth
    'earnings_growth':  20,
    'gross_margin':     15,
    'market_cap_fit':   15,  # sweet spot: $200M–$3B
    'return_on_equity': 10,
    'cash_richness':    10,  # cash > debt is a great Halal signal
}
