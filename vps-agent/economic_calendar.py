"""
economic_calendar.py — Fetch upcoming high-impact economic events.
Uses the ForexFactory weekly JSON feed (unofficial but widely used).
Falls back silently if unavailable — never blocks trading on fetch errors.
"""

from __future__ import annotations

import json
import logging
import ssl
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

_CALENDAR_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]
_CACHE_TTL = 3600  # re-fetch at most once per hour
_cache: Optional[tuple[float, list]] = None  # (fetched_at, events)

# Which currency codes matter for each trading symbol
_SYMBOL_CURRENCIES: dict[str, list[str]] = {
    "XAU/USD": ["USD"],          # gold moves hard on all USD data
    "XAG/USD": ["USD"],
    "EUR/USD": ["EUR", "USD"],
    "GBP/USD": ["GBP", "USD"],
    "USD/JPY": ["USD", "JPY"],
    "USD/CHF": ["USD", "CHF"],
    "AUD/USD": ["AUD", "USD"],
    "NZD/USD": ["NZD", "USD"],
    "USD/CAD": ["USD", "CAD"],
    "GBP/JPY": ["GBP", "JPY"],
    "EUR/JPY": ["EUR", "JPY"],
    "EUR/GBP": ["EUR", "GBP"],
    "BTC/USD": ["USD"],          # crypto follows risk sentiment / USD strength
}

# How many minutes before/after a HIGH impact event to block new trades
NEWS_BLACKOUT_MINUTES = 30


@dataclass
class EconomicEvent:
    title: str
    country: str       # e.g. "USD", "EUR"
    impact: str        # "High", "Medium", "Low"
    minutes_away: int  # >0 = future, <0 = just passed
    forecast: str
    previous: str


def _parse_event_time(date_str: str, time_str: str) -> Optional[datetime]:
    """
    Parse ForexFactory datetime into UTC.
    The API now returns ISO 8601 in the date field: "2026-04-06T10:00:00-04:00"
    Falls back to legacy "Apr 06, 2026" + "10:00am" format just in case.
    """
    import re as _re

    try:
        date_str = (date_str or "").strip()

        # ── ISO 8601 with offset: "2026-04-06T10:00:00-04:00" ────────────────
        if "T" in date_str:
            m = _re.match(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})$", date_str)
            if m:
                naive = datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S")
                sign = 1 if m.group(2)[0] == "+" else -1
                h, mi = int(m.group(2)[1:3]), int(m.group(2)[4:6])
                offset = timedelta(hours=h * sign, minutes=mi * sign)
                return naive.replace(tzinfo=timezone(offset)).astimezone(timezone.utc)

        # ── Legacy: "Apr 06, 2026" + "10:00am" ───────────────────────────────
        clean_time = (time_str or "").strip().lower()
        if not clean_time or clean_time in ("all day", "tentative"):
            dt_naive = datetime.strptime(date_str, "%b %d, %Y").replace(hour=8)
        else:
            dt_naive = datetime.strptime(f"{date_str} {time_str.upper()}", "%b %d, %Y %I:%M%p")

        try:
            from zoneinfo import ZoneInfo
            et = ZoneInfo("America/New_York")
            return dt_naive.replace(tzinfo=et).astimezone(timezone.utc)
        except Exception:
            return dt_naive.replace(tzinfo=timezone(timedelta(hours=-4))).astimezone(timezone.utc)

    except Exception as e:
        logger.warning("Calendar time parse error (%s %s): %s", date_str, time_str, e)
        return None


def fetch_calendar() -> list[EconomicEvent]:
    """
    Return upcoming high/medium impact events for this week + next week.
    Fetches both URLs so weekend scans still see Monday's events.
    Results cached for 1 hour. Returns [] on any network/parse error.
    """
    global _cache

    now = time.time()
    if _cache and (now - _cache[0]) < _CACHE_TTL:
        return _cache[1]

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    raw_items: list[dict] = []
    for url in _CALENDAR_URLS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6, context=ctx) as resp:
                raw_items.extend(json.loads(resp.read().decode()))
        except Exception as exc:
            logger.debug("Calendar URL %s failed: %s", url, exc)

    if not raw_items:
        logger.warning("Economic calendar fetch failed (trading continues)")
        return _cache[1] if _cache else []

    now_dt = datetime.now(timezone.utc)
    events: list[EconomicEvent] = []

    for item in raw_items:
        impact = (item.get("impact") or "").strip()
        if impact not in ("High", "Medium"):
            continue

        event_dt = _parse_event_time(
            item.get("date", ""), item.get("time", "")
        )
        if event_dt is None:
            continue

        minutes_away = int((event_dt - now_dt).total_seconds() / 60)
        # Keep: within next 48 h (covers weekend → Monday), or passed within last 1 h
        if minutes_away < -60 or minutes_away > 2880:
            continue

        events.append(EconomicEvent(
            title=item.get("title", ""),
            country=(item.get("country") or "").upper(),
            impact=impact,
            minutes_away=minutes_away,
            forecast=item.get("forecast") or "",
            previous=item.get("previous") or "",
        ))

    # Deduplicate (same title + country + time can appear in both week JSONs)
    seen: set[tuple] = set()
    unique: list[EconomicEvent] = []
    for e in events:
        key = (e.title, e.country, e.minutes_away // 5)  # bucket by 5-min window
        if key not in seen:
            seen.add(key)
            unique.append(e)

    unique.sort(key=lambda e: e.minutes_away)
    _cache = (now, unique)
    logger.info("Economic calendar: %d upcoming high/medium events loaded (next 48h)", len(unique))
    return unique


def filter_for_symbol(
    symbol: str, events: list[EconomicEvent]
) -> list[EconomicEvent]:
    """Return events that are relevant to the given trading symbol."""
    currencies = _SYMBOL_CURRENCIES.get(symbol, ["USD"])
    return [e for e in events if e.country in currencies]


def format_for_prompt(events: list[EconomicEvent]) -> str:
    """Format a list of events as a compact prompt block."""
    if not events:
        return "None."

    lines = []
    for e in events[:6]:
        if e.minutes_away < 0:
            when = f"{abs(e.minutes_away)}min ago"
        elif e.minutes_away < 60:
            when = f"in {e.minutes_away}min ⚠️ HIGH VOLATILITY RISK"
        elif e.minutes_away < 120:
            h, m = divmod(e.minutes_away, 60)
            when = f"in {h}h {m}min"
        else:
            when = f"in ~{e.minutes_away // 60}h"

        extras = ""
        if e.forecast:
            extras += f" | Fcst: {e.forecast}"
        if e.previous:
            extras += f" | Prev: {e.previous}"

        lines.append(f"  [{e.impact}] {e.country} {e.title} — {when}{extras}")

    return "\n".join(lines)


def news_blackout_reason(
    symbol: str,
    events: list[EconomicEvent],
    window: int = NEWS_BLACKOUT_MINUTES,
) -> Optional[str]:
    """
    If a HIGH-impact event for this symbol is within ±window minutes,
    return a human-readable reason string. Otherwise return None (safe to trade).
    """
    relevant = filter_for_symbol(symbol, events)
    for e in relevant:
        if e.impact == "High" and abs(e.minutes_away) <= window:
            if e.minutes_away >= 0:
                return (
                    f"{e.country} {e.title} releasing in {e.minutes_away} min — "
                    f"trading paused to avoid news spike"
                )
            else:
                return (
                    f"{e.country} {e.title} released {abs(e.minutes_away)} min ago — "
                    f"still in volatility window"
                )
    return None
