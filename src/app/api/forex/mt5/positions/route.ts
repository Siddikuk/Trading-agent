// MT5 Positions API — Proxy to bridge /api/mt5/positions
import { NextResponse } from 'next/server';
import { getBridgeUrl, fetchMT5Positions } from '@/lib/mt5-provider';

export async function GET() {
  if (!getBridgeUrl()) {
    return NextResponse.json(
      { error: 'MT5 bridge not configured' },
      { status: 502 }
    );
  }
  try {
    const positions = await fetchMT5Positions();
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
