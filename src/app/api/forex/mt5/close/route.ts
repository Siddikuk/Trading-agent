// MT5 Close API — Proxy to bridge /api/mt5/close
import { NextResponse } from 'next/server';
import { getEffectiveBridgeUrl, closeMT5Position, restoreBridgeUrlFromDB } from '@/lib/mt5-provider';

export async function POST(req: Request) {
  let url = getEffectiveBridgeUrl(req);
  if (!url) url = await restoreBridgeUrlFromDB();

  if (!url) {
    return NextResponse.json({ error: 'MT5 bridge not configured' }, { status: 502 });
  }
  try {
    const body = await req.json();
    const ticket = body.ticket ?? undefined;
    const symbol = body.symbol ?? undefined;
    if (!ticket && !symbol) {
      return NextResponse.json({ error: 'Must provide ticket or symbol' }, { status: 400 });
    }
    const result = await closeMT5Position(ticket, symbol, url);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
