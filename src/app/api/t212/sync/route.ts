import { NextResponse } from 'next/server';
import { syncFromT212 } from '@/lib/t212';

// POST /api/t212/sync
// Body: { apiKeyId: string, apiSecret: string, isDemo?: boolean }
//
// Proxies the user's Trading 212 credentials to T212's read-only endpoints
// (account summary + positions), maps positions back to our halal universe,
// and returns the result. The key ID and secret are never logged, persisted,
// or echoed back. They exist only in memory for the duration of this request.

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

  const { apiKeyId, apiSecret, isDemo } = body as {
    apiKeyId?: unknown; apiSecret?: unknown; isDemo?: unknown;
  };

  if (typeof apiKeyId !== 'string' || apiKeyId.length < 4) {
    return NextResponse.json(
      { error: 'apiKeyId is required (copy from T212 → Settings → API Generated Keys → API KEY ID)' },
      { status: 400 },
    );
  }
  if (typeof apiSecret !== 'string' || apiSecret.length < 8) {
    return NextResponse.json(
      { error: 'apiSecret is required (the SECRET KEY shown once at creation — you have to regenerate if you lost it)' },
      { status: 400 },
    );
  }

  try {
    const result = await syncFromT212(apiKeyId, apiSecret, isDemo === true);
    return NextResponse.json(result);
  } catch (e) {
    // Redact both credentials from anything error-shaped that might leak them.
    const raw = String(e instanceof Error ? e.message : e);
    const msg = raw.replace(apiKeyId, '<redacted>').replace(apiSecret, '<redacted>');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
