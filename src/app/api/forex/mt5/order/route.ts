// MT5 Order API — Proxy to bridge /api/mt5/order
import { NextResponse } from 'next/server';
import { getBridgeUrl, sendMT5Order } from '@/lib/mt5-provider';

export async function POST(req: Request) {
  if (!getBridgeUrl()) {
    return NextResponse.json(
      { error: 'MT5 bridge not configured' },
      { status: 502 }
    );
  }
  try {
    const body = await req.json();
    if (!body.symbol || body.type === undefined || !body.lots) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, type, lots' },
        { status: 400 }
      );
    }
    const result = await sendMT5Order({
      symbol: body.symbol,
      type: body.type,
      lots: body.lots,
      price: body.price,
      sl: body.sl ?? 0,
      tp: body.tp ?? 0,
      comment: body.comment,
      magic: body.magic,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
