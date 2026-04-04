"""
config.py — All constants, environment variable loading, and symbol/timeframe mappings.
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()


def _require_env(key: str) -> str:
    """Read a required env var and exit with a clear message if it's missing."""
    val = os.getenv(key, "").strip()
    if not val:
        print(
            f"FATAL: Required environment variable '{key}' is not set.\n"
            f"       Copy vps-agent/.env.example to vps-agent/.env and fill in all values.",
            file=sys.stderr,
        )
        sys.exit(1)
    return val


# ─── Claude API ───────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY: str = _require_env("ANTHROPIC_API_KEY")
CLAUDE_MODEL: str = "claude-sonnet-4-6"

# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL: str = _require_env("DATABASE_URL")

# ─── MT5 Bridge ───────────────────────────────────────────────────────────────
# Agent runs on the same VPS as the bridge — no Cloudflare tunnel needed.
MT5_BRIDGE_URL: str = os.getenv("MT5_BRIDGE_URL", "http://localhost:8080")
BRIDGE_TIMEOUT_S: int = 10   # seconds for regular requests
ORDER_TIMEOUT_S: int  = 15   # seconds for order/close requests

# ─── Agent timing ─────────────────────────────────────────────────────────────
SCAN_INTERVAL_MINUTES: int  = int(os.getenv("AGENT_SCAN_INTERVAL_MINUTES", "15"))
IDLE_POLL_SECONDS: int      = 60   # how often to check isRunning when stopped
BRIDGE_RETRY_LIMIT: int     = 3    # consecutive failures before halting

# ─── Symbols & timeframes ─────────────────────────────────────────────────────
WATCH_SYMBOLS: list[str] = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "XAU/USD"
]

# Broker suffixes stripped when converting MT5 symbol → canonical
_MT5_SUFFIXES = ('+', '.std', '.raw', '.r', '.m', '.i', '.pro', '.ecn', '-e', '.stp', '.t', '.n', '.c', '.sp')

# MT5 uses no slash; bridge expects this format
def to_mt5_symbol(symbol: str) -> str:
    return symbol.replace("/", "")

def from_mt5_symbol(mt5_sym: str) -> str:
    """Convert any broker MT5 symbol to canonical display form (e.g. EUR/USD)."""
    upper = mt5_sym.upper()
    # Strip broker suffix first
    for sfx in _MT5_SUFFIXES:
        if upper.endswith(sfx.upper()):
            upper = upper[:-len(sfx)]
            break
    pairs = {
        "EURUSD": "EUR/USD", "GBPUSD": "GBP/USD",
        "USDJPY": "USD/JPY", "USDCHF": "USD/CHF",
        "XAUUSD": "XAU/USD", "BTCUSD": "BTC/USD",
        "AUDUSD": "AUD/USD", "NZDUSD": "NZD/USD",
        "USDCAD": "USD/CAD", "GBPJPY": "GBP/JPY",
        "EURJPY": "EUR/JPY", "EURGBP": "EUR/GBP",
    }
    return pairs.get(upper, mt5_sym)

# Timeframes analysed per symbol (top-down order)
TIMEFRAMES: list[str] = os.getenv(
    "AGENT_TIMEFRAMES", "M15,H1,H4,D1"
).split(",")

# Labels shown in prompts / logs
TF_LABELS: dict[str, str] = {
    "M15": "15-Min",
    "H1":  "1-Hour",
    "H4":  "4-Hour",
    "D1":  "Daily",
}

# Candle counts to fetch per timeframe
TF_CANDLE_COUNT: dict[str, int] = {
    "M15": 200,
    "H1":  200,
    "H4":  200,
    "D1":  200,
}

# Identifies the "entry" timeframe (used for ATR-based SL/TP suggestions)
ENTRY_TIMEFRAME: str = "H1"

# ─── Multi-timeframe confluence ───────────────────────────────────────────────
MIN_TF_CONFLUENCE: int   = int(os.getenv("AGENT_MIN_TF_CONFLUENCE", "2"))
LOT_SCALE_3TF: float     = float(os.getenv("AGENT_LOT_SCALE_3TF", "1.5"))
LOT_SCALE_4TF: float     = float(os.getenv("AGENT_LOT_SCALE_4TF", "2.0"))

# ─── Risk defaults (overridden by AgentState DB record) ───────────────────────
DEFAULT_BALANCE: float          = 1000.0
DEFAULT_MAX_RISK_PCT: float     = 2.0    # % of balance per trade
DEFAULT_DAILY_RISK_LIMIT_PCT: float = 5.0   # % max daily loss
DEFAULT_MAX_DRAWDOWN_PCT: float = 15.0   # % drawdown before emergency halt
DEFAULT_MAX_POSITIONS: int      = 5

# ─── Position sizing ──────────────────────────────────────────────────────────
LOT_STEP: float    = 0.01
MIN_LOT: float     = 0.01
MAX_LOT: float     = float(os.getenv("AGENT_MAX_LOT", "0.10"))  # cent account default

# ─── Trade decision gates (hardcoded — not user-configurable) ─────────────────
MIN_CONFIDENCE_TO_TRADE: int    = 60    # Claude confidence threshold
MIN_RISK_REWARD: float          = 2.0   # Minimum R:R ratio
MIN_CONFIDENCE_TO_SIGNAL: int   = 50    # Write to DB even if not trading

# ─── Trade management (breakeven / trailing) ─────────────────────────────────
BREAKEVEN_TRIGGER_PIPS: float   = 20.0  # move SL to entry after this many pips profit
TRAILING_TRIGGER_PIPS: float    = 40.0  # trail SL after this many pips profit
TRAILING_OFFSET_PIPS: float     = 10.0  # trail SL this many pips behind entry

# Pip size per symbol (used for profit/pips calculations)
PIP_SIZE: dict[str, float] = {
    "EUR/USD": 0.0001,
    "GBP/USD": 0.0001,
    "USD/JPY": 0.01,
    "USD/CHF": 0.0001,
    "XAU/USD": 0.1,     # Gold — 1 pip = $0.10 per lot
    "AUD/USD": 0.0001,
    "NZD/USD": 0.0001,
    "USD/CAD": 0.0001,
    "GBP/JPY": 0.01,
    "EUR/JPY": 0.01,
    "EUR/GBP": 0.0001,
    "BTC/USD": 1.0,     # Bitcoin — 1 pip = $1
}

# ─── Claude reasoning ─────────────────────────────────────────────────────────
MAX_CONCURRENT_CLAUDE: int  = int(os.getenv("AGENT_MAX_CONCURRENT_CLAUDE", "2"))
CLAUDE_RETRY_ATTEMPTS: int  = 3
CLAUDE_RETRY_BACKOFF: list[int] = [5, 10, 20]   # seconds

# ─── News ─────────────────────────────────────────────────────────────────────
NEWS_CACHE_TTL_SECONDS: int = 300   # 5 minutes
NEWS_MAX_ARTICLES: int      = 6
NEWS_MAX_AGE_HOURS: int     = 24

RSS_FEEDS: list[str] = [
    "https://feeds.reuters.com/reuters/businessNews",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    "https://www.marketwatch.com/rss/topstories",
    "https://www.forexlive.com/feed/news",
    "https://www.investing.com/rss/news.rss",
    "https://www.fxstreet.com/rss/news",
]

# Source credibility tiers
TIER1_DOMAINS: set[str] = {
    "reuters.com", "bloomberg.com", "cnbc.com", "wsj.com",
    "ft.com", "economist.com", "forexlive.com", "fxstreet.com",
}
TIER2_DOMAINS: set[str] = {
    "yahoo.com", "marketwatch.com", "investing.com",
    "cnn.com", "barrons.com", "businessinsider.com",
}
JUNK_DOMAINS: set[str] = {
    "wikipedia.org", "reddit.com", "quora.com", "youtube.com",
}
JUNK_TITLE_PATTERNS: list[str] = [
    "how to trade", "forex for beginners", "sign up", "open account",
    "best broker", "low spreads", "award winning", "join now",
]

# Symbol-specific news keywords for relevance filtering
SYMBOL_KEYWORDS: dict[str, list[str]] = {
    "EUR/USD": ["euro", "eur", "ecb", "european central bank", "eurozone",
                "dollar", "usd", "fed", "federal reserve"],
    "GBP/USD": ["pound", "gbp", "sterling", "bank of england", "boe",
                "dollar", "usd", "fed"],
    "USD/JPY": ["yen", "jpy", "bank of japan", "boj", "dollar",
                "usd", "fed", "japan"],
    "USD/CHF": ["franc", "chf", "swiss national bank", "snb", "dollar",
                "usd", "fed", "switzerland"],
    "XAU/USD": ["gold", "xau", "bullion", "precious metal",
                "dollar", "usd", "fed", "inflation"],
    "AUD/USD": ["australian dollar", "aud", "reserve bank of australia", "rba",
                "australia", "dollar", "usd", "fed", "china", "commodities"],
    "NZD/USD": ["new zealand dollar", "nzd", "reserve bank of new zealand", "rbnz",
                "new zealand", "dollar", "usd", "fed"],
    "USD/CAD": ["canadian dollar", "cad", "bank of canada", "boc",
                "canada", "oil", "crude", "dollar", "usd", "fed"],
    "GBP/JPY": ["pound", "gbp", "sterling", "bank of england", "boe",
                "yen", "jpy", "bank of japan", "boj", "japan"],
    "EUR/JPY": ["euro", "eur", "ecb", "eurozone", "european central bank",
                "yen", "jpy", "bank of japan", "boj", "japan"],
    "EUR/GBP": ["euro", "eur", "ecb", "eurozone",
                "pound", "gbp", "sterling", "bank of england", "boe", "brexit"],
    "BTC/USD": ["bitcoin", "btc", "crypto", "cryptocurrency",
                "dollar", "usd", "digital asset", "blockchain"],
}
