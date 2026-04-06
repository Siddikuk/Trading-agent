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

_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
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
    Parse ForexFactory date ("Apr 10, 2025") + time ("8:30am") → UTC datetime.
    FF times are US Eastern (UTC-4 in summer, UTC-5 in winter).
    """
    try:
        clean_time = (time_str or "").strip().lower()
        if not clean_time or clean_time in ("all day", "tentative"):
            # Treat as early morning ET so it counts as "today"
            dt_naive = datetime.strptime(date_str, "%b %d, %Y").replace(hour=8)
        else:
            dt_naive = datetime.strptime(f"{date_str} {time_str}", "%b %d, %Y %I:%M%p")

        # Determine ET offset (DST: second Sunday Mar → first Sunday Nov = UTC-4)
        try:
            from zoneinfo import ZoneInfo
            et = ZoneInfo("America/New_York")
            dt = dt_naive.replace(tzinfo=et).astimezone(timezone.utc)
        except Exception:
            # Fallback: rough UTC-4 (EDT, valid ~Mar–Nov)
            dt = dt_naive.replace(tzinfo=timezone(timedelta(hours=-4))).astimezone(timezone.utc)

        return dt
    except Exception as e:
        logger.debug("Calendar time parse error (%s %s): %s", date_str, time_str, e)
        return None


def fetch_calendar() -> list[EconomicEvent]:
    """
    Return upcoming high/medium impact events for this week.
    Results cached for 1 hour. Returns [] on any network/parse error.
    """
    global _cache

    now = time.time()
    if _cache and (now - _cache[0]) < _CACHE_TTL:
        return _cache[1]

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            _CALENDAR_URL,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=6, context=ctx) as resp:
            raw = json.loads(resp.read().decode())

        now_dt = datetime.now(timezone.utc)
        events: list[EconomicEvent] = []

        for item in raw:
            impact = (item.get("impact") or "").strip()
            if impact not in ("High", "Medium"):
                continue

            event_dt = _parse_event_time(
                item.get("date", ""), item.get("time", "")
            )
            if event_dt is None:
                continue

            minutes_away = int((event_dt - now_dt).total_seconds() / 60)
            # Keep: within next 24 h, or passed within last 1 h
            if minutes_away < -60 or minutes_away > 1440:
                continue

            events.append(EconomicEvent(
                title=item.get("title", ""),
                country=(item.get("country") or "").upper(),
                impact=impact,
                minutes_away=minutes_away,
                forecast=item.get("forecast") or "",
                previous=item.get("previous") or "",
            ))

        events.sort(key=lambda e: e.minutes_away)
        _cache = (now, events)
        logger.info("Economic calendar: %d upcoming high/medium events loaded", len(events))
        return events

    except Exception as exc:
        logger.warning("Economic calendar fetch failed (trading continues): %s", exc)
        return _cache[1] if _cache else []


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
