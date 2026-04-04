// MT5 Positions API — Proxy to bridge /api/mt5/positions
import { NextResponse } from 'next/server';
import { getEffectiveBridgeUrl, fetchMT5Positions } from '@/lib/mt5-provider';

export async function GET(req: Request) {
  const url = getEffectiveBridgeUrl(req);
  if (!url) {
    return NextResponse.json(
      { error: 'MT5 bridge not configured' },
      { status: 502 }
    );
  }
  try {
    const positions = await fetchMT5Positions(url);
    if (positions === null) {
      return NextResponse.json(
        { error: 'MT5 bridge not reachable' },
        { status: 502 }
      );
    }
    return NextResponse.json({ positions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
