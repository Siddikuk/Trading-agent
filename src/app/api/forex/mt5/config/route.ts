// MT5 Config API — GET returns config + health, POST saves bridge URL
import { NextResponse } from 'next/server';
import { setBridgeUrl, getBridgeUrl, isMT5Connected } from '@/lib/mt5-provider';

export async function GET() {
  const url = getBridgeUrl();
  const connected = url ? await isMT5Connected() : false;
  return NextResponse.json({
    bridgeUrl: url,
    connected,
    lastCheck: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = body.url;

    // Handle disconnect (null URL)
    if (url === null || url === undefined) {
      setBridgeUrl(null);
      return NextResponse.json({ success: true, bridgeUrl: null, connected: false });
    }

    const trimmed = String(url).trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Bridge URL is required' }, { status: 400 });
    }
    // Basic validation
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return NextResponse.json({ error: 'Bridge URL must start with http:// or https://' }, { status: 400 });
    }
    // Store the URL
    setBridgeUrl(trimmed);
    // Test the connection (this is server-side, so no HTTPS restrictions)
    const connected = await isMT5Connected();
    return NextResponse.json({
      success: true,
      bridgeUrl: trimmed,
      connected,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
