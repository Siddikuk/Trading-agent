import { NextResponse } from 'next/server';
import { syncFromT212 } from '@/lib/t212';

// POST /api/t212/sync
// Body: { apiKey: string, isDemo?: boolean }
//
// Proxies the user's Trading 212 API key to T212's read-only endpoints
// (cash + portfolio), maps positions back to our halal universe, and
// returns the result. The API key is never logged, persisted, or echoed
// back. It exists only in memory for the duration of this request.

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Missing body' }, { status: 400 });
  }

  const { apiKey, isDemo } = body as { apiKey?: unknown; isDemo?: unknown };

  if (typeof apiKey !== 'string' || apiKey.length < 8) {
    return NextResponse.json(
      { error: 'apiKey is required (paste from T212 → Settings → API Generated Keys)' },
      { status: 400 },
    );
  }

  try {
    const result = await syncFromT212(apiKey, isDemo === true);
    return NextResponse.json(result);
  } catch (e) {
    // Strip the API key from anything error-shaped that might leak it.
    const msg = String(e instanceof Error ? e.message : e).replace(apiKey, '<redacted>');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
