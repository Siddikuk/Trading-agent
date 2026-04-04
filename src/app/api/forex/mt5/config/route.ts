// MT5 Config API — GET returns config + health, POST saves bridge URL
// Persists bridge URL to database so it survives Vercel serverless cold starts
import { NextResponse } from 'next/server';
import { setBridgeUrl, getBridgeUrl, isMT5Connected } from '@/lib/mt5-provider';
import { db } from '@/lib/db';

const BRIDGE_URL_KEY = 'mt5_bridge_url';

async function saveBridgeUrlToDB(url: string | null): Promise<void> {
  try {
    if (url) {
      await db.setting.upsert({
        where: { key: BRIDGE_URL_KEY },
        create: { key: BRIDGE_URL_KEY, value: url },
        update: { value: url },
      });
    } else {
      await db.setting.delete({ where: { key: BRIDGE_URL_KEY } }).catch(() => {});
    }
  } catch (e) {
    console.error('[MT5 Config] Failed to save to DB:', e);
  }
}

async function loadBridgeUrlFromDB(): Promise<string | null> {
  try {
    const setting = await db.setting.findUnique({ where: { key: BRIDGE_URL_KEY } });
    return setting?.value || null;
  } catch (e) {
    console.error('[MT5 Config] Failed to load from DB:', e);
    return null;
  }
}

export async function GET() {
  let url = getBridgeUrl();

  // If in-memory is empty (cold start on Vercel), try loading from DB
  if (!url) {
    url = await loadBridgeUrlFromDB();
    if (url) {
      setBridgeUrl(url);
      console.log('[MT5 Config] Restored bridge URL from DB:', url);
    }
  }

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
      await saveBridgeUrlToDB(null);
      return NextResponse.json({ success: true, bridgeUrl: null, connected: false });
    }

    const trimmed = String(url).trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Bridge URL is required' }, { status: 400 });
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return NextResponse.json({ error: 'Bridge URL must start with http:// or https://' }, { status: 400 });
    }

    // Store in-memory AND database
    setBridgeUrl(trimmed);
    await saveBridgeUrlToDB(trimmed);

    // Test the connection
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
