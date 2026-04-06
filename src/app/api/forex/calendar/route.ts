import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RawEvent {
  title: string;
  country: string;
  impact: string;
  event_utc: string;
  forecast: string;
  previous: string;
}

export async function GET() {
  try {
    // The VPS agent writes a CALENDAR_SNAPSHOT to the audit log each cycle.
    // We read the most recent one — no direct ForexFactory call needed from Vercel.
    const snapshot = await db.auditLog.findFirst({
      where: { action: 'CALENDAR_SNAPSHOT' },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot?.details) {
      return NextResponse.json({ events: [], source: 'no_snapshot' });
    }

    const data = JSON.parse(snapshot.details) as { events: RawEvent[] };
    const now = Date.now();

    const events = (data.events || [])
      .map(ev => {
        if (!ev.event_utc) return null;
        const eventMs = new Date(ev.event_utc).getTime();
        if (isNaN(eventMs)) return null;
        const minutesAway = Math.round((eventMs - now) / 60_000);
        // Keep within next 48h or passed within last 1h
        if (minutesAway < -60 || minutesAway > 2880) return null;
        return {
          title: ev.title || '',
          country: ev.country || '',
          impact: ev.impact || '',
          minutesAway,
          forecast: ev.forecast || '',
          previous: ev.previous || '',
          eventTime: ev.event_utc,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a as { minutesAway: number }).minutesAway - (b as { minutesAway: number }).minutesAway);

    const snapshotAgeMin = Math.round((now - new Date(snapshot.createdAt).getTime()) / 60_000);
    return NextResponse.json({ events, snapshotAgeMin });
  } catch (error) {
    return NextResponse.json({ events: [], error: String(error) });
  }
}
