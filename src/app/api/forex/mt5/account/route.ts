// MT5 Account API — Proxy to bridge /api/mt5/account
import { NextResponse } from 'next/server';
import { getEffectiveBridgeUrl, fetchMT5Account, restoreBridgeUrlFromDB } from '@/lib/mt5-provider';

export async function GET(req: Request) {
  let url = getEffectiveBridgeUrl(req);

  // Cold start: restore from DB if in-memory is empty
  if (!url) {
    url = await restoreBridgeUrlFromDB();
  }

  if (!url) {
    return NextResponse.json({ error: 'MT5 bridge not configured' }, { status: 502 });
  }
  try {
    const account = await fetchMT5Account(url);
    if (!account) {
      return NextResponse.json({ error: 'MT5 bridge not reachable' }, { status: 502 });
    }
    return NextResponse.json(account);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
