"""
news.py — RSS news fetcher with source-credibility scoring, symbol filtering, and TTL cache.
Ported and extended from src/lib/ai-agent.ts news logic.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

import feedparser

from config import (
    RSS_FEEDS,
    TIER1_DOMAINS,
    TIER2_DOMAINS,
    JUNK_DOMAINS,
    JUNK_TITLE_PATTERNS,
    SYMBOL_KEYWORDS,
    NEWS_CACHE_TTL_SECONDS,
    NEWS_MAX_ARTICLES,
    NEWS_MAX_AGE_HOURS,
)

logger = logging.getLogger(__name__)


@dataclass
class NewsArticle:
    title: str
    snippet: str
    source: str
    published: str      # ISO string
    published_ts: float # unix timestamp for sorting
    score: int          # 0-100 source credibility
    tier: str           # "HIGH" | "MED" | "LOW"


# ─── Source credibility ───────────────────────────────────────────────────────

def _score_source(url: str) -> tuple[int, str]:
    """Return (score 0-100, tier label)."""
    try:
        domain = urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return 0, "LOW"

    if domain in JUNK_DOMAINS:
        return 0, "LOW"

    for t1 in TIER1_DOMAINS:
        if domain == t1 or domain.endswith("." + t1):
            return 90, "HIGH"

    for t2 in TIER2_DOMAINS:
        if domain == t2 or domain.endswith("." + t2):
            return 70, "MED"

    # Unknown domain: check for finance keywords in domain name
    finance_strong = ["forex", "fx", "trading", "invest", "finance", "market", "gold"]
    finance_moderate = ["news", "economic", "bank", "money", "fund"]
    for kw in finance_strong:
        if kw in domain:
            return 55, "MED"
    for kw in finance_moderate:
        if kw in domain:
            return 40, "LOW"

    return 20, "LOW"


def _is_junk(title: str, snippet: str) -> bool:
    text = (title + " " + snippet).lower()
    return any(pat in text for pat in JUNK_TITLE_PATTERNS)


def _is_relevant(title: str, snippet: str, symbol: str) -> bool:
    keywords = SYMBOL_KEYWORDS.get(symbol, [])
    if not keywords:
        return True  # no filter defined, accept all
    text = (title + " " + snippet).lower()
    return any(kw in text for kw in keywords)


# ─── In-memory cache ──────────────────────────────────────────────────────────
# {cache_key: (articles, cached_at_ts)}
_cache: dict[str, tuple[list[NewsArticle], float]] = {}


def _cache_key(symbol: str) -> str:
    return "news_" + hashlib.md5(symbol.encode()).hexdigest()[:8]


def _get_cached(symbol: str) -> Optional[list[NewsArticle]]:
    key = _cache_key(symbol)
    if key in _cache:
        articles, cached_at = _cache[key]
        if time.time() - cached_at < NEWS_CACHE_TTL_SECONDS:
            return articles
    return None


def _set_cached(symbol: str, articles: list[NewsArticle]) -> None:
    _cache[_cache_key(symbol)] = (articles, time.time())


# ─── Fetcher ──────────────────────────────────────────────────────────────────

def _parse_timestamp(entry: Any) -> float:
    """Extract unix timestamp from a feedparser entry."""
    import email.utils
    try:
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            return float(time.mktime(entry.published_parsed))
        if hasattr(entry, "published") and entry.published:
            parsed = email.utils.parsedate_to_datetime(entry.published)
            return parsed.timestamp()
    except Exception:
        pass
    return time.time()  # fallback: treat as now


def _fetch_rss_all() -> list[dict]:
    """Fetch and parse all RSS feeds. Returns raw entry dicts."""
    all_entries: list[dict] = []
    for feed_url in RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:20]:  # cap per feed
                all_entries.append({
                    "title":   getattr(entry, "title", ""),
                    "snippet": getattr(entry, "summary", "") or getattr(entry, "description", ""),
                    "link":    getattr(entry, "link", feed_url),
                    "ts":      _parse_timestamp(entry),
                })
        except Exception as e:
            logger.warning("RSS parse failed %s: %s", feed_url, e)
    return all_entries


def fetch_news(symbol: str) -> list[NewsArticle]:
    """
    Fetch and filter news for a given symbol.
    Results cached for NEWS_CACHE_TTL_SECONDS.
    """
    cached = _get_cached(symbol)
    if cached is not None:
        return cached

    raw_entries = _fetch_rss_all()

    cutoff_ts = time.time() - NEWS_MAX_AGE_HOURS * 3600
    seen_titles: set[str] = set()
    articles: list[NewsArticle] = []

    for e in raw_entries:
        title   = e["title"].strip()
        snippet = e["snippet"].strip()
        ts      = e["ts"]
        link    = e["link"]

        # Age filter
        if ts < cutoff_ts:
            continue

        # Junk filter
        if _is_junk(title, snippet):
            continue

        # Symbol relevance filter
        if not _is_relevant(title, snippet, symbol):
            continue

        # Dedup by title prefix
        title_key = title.lower()[:60]
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)

        score, tier = _score_source(link)
        if score == 0:
            continue

        articles.append(NewsArticle(
            title=title,
            snippet=snippet[:300],
            source=link,
            published=_ts_to_str(ts),
            published_ts=ts,
            score=score,
            tier=tier,
        ))

    # Sort by score desc, then recency
    articles.sort(key=lambda a: (a.score, a.published_ts), reverse=True)
    result = articles[:NEWS_MAX_ARTICLES]

    _set_cached(symbol, result)
    logger.debug("News for %s: %d articles", symbol, len(result))
    return result


def _ts_to_str(ts: float) -> str:
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    age_h = (time.time() - ts) / 3600
    if age_h < 1:
        return f"{int(age_h * 60)}min ago"
    if age_h < 24:
        return f"{int(age_h)}h ago"
    return dt.strftime("%b %d")


def format_news_for_prompt(articles: list[NewsArticle]) -> str:
    """Format news list into prompt-ready string."""
    if not articles:
        return "No recent news found."
    lines: list[str] = []
    for a in articles:
        badge = "🔴" if a.tier == "HIGH" else ("🟡" if a.tier == "MED" else "⚪")
        lines.append(f"{badge} [{a.source.split('/')[2] if '/' in a.source else a.source}] "
                     f"{a.title} — {a.published}")
    return "\n".join(lines)
