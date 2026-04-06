import { NextResponse } from 'next/server';

const CALENDAR_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

// In-memory cache: [fetchedAtMs, events]
let _cache: [number, CalendarEvent[]] | null = null;
const CACHE_TTL_MS = 3_600_000; // 1 hour

export interface CalendarEvent {
  title: string;
  country: string;
  impact: string;      // "High" | "Medium"
  minutesAway: number; // >0 future, <0 just passed
  forecast: string;
  previous: string;
  eventTime: string;   // ISO string
}

export async function GET() {
  const now = Date.now();
  if (_cache && now - _cache[0] < CACHE_TTL_MS) {
    return NextResponse.json({ events: _cache[1] });
  }

  const raw: Record<string, unknown>[] = [];
  for (const url of CALENDAR_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) raw.push(...data);
      }
    } catch {
      // silent — never block the dashboard
    }
  }

  const nowMs = Date.now();
  const events: CalendarEvent[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const impact = ((item.impact as string) || '').trim();
    if (impact !== 'High' && impact !== 'Medium') continue;

    // ForexFactory API returns ISO 8601: "2026-04-06T10:00:00-04:00"
    let eventMs: number;
    try {
      eventMs = new Date(item.date as string).getTime();
      if (isNaN(eventMs)) continue;
    } catch {
      continue;
    }

    const minutesAway = Math.round((eventMs - nowMs) / 60_000);
    // Keep: within next 48h or passed within last 1h
    if (minutesAway < -60 || minutesAway > 2880) continue;

    const country = ((item.country as string) || '').toUpperCase();
    const title = (item.title as string) || '';
    const key = `${title}|${country}|${Math.floor(minutesAway / 5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      title,
      country,
      impact,
      minutesAway,
      forecast: (item.forecast as string) || '',
      previous: (item.previous as string) || '',
      eventTime: new Date(eventMs).toISOString(),
    });
  }

  events.sort((a, b) => a.minutesAway - b.minutesAway);
  _cache = [now, events];
  return NextResponse.json({ events });
}
