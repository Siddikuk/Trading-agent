// Trading 212 public API client — READ-ONLY.
//
// This module is server-only. The user's API key ID + secret are sent
// over from the client as part of a single sync request, used once to
// talk to T212, and dropped from memory when the request completes.
// We never persist or log either credential.
//
// Auth (current as of 2026):
//   T212 uses HTTP Basic Authentication with API_KEY_ID as the username
//   and API_SECRET as the password, base64-encoded:
//     Authorization: Basic base64(API_KEY_ID:API_SECRET)
//
// Endpoints used:
//   GET /equity/account/summary  -> cash + account totals
//   GET /equity/positions         -> current portfolio
//
// Currency note:
//   * Account-level numbers (availableToTrade, totalValue) are in the
//     account's primary currency, which is GBP for a UK ISA.
//   * Per-position averagePricePaid is in the INSTRUMENT's currency
//     (USD for AAPL, GBp for ISWD, USD for ISDUl, etc). We convert
//     these to GBP using the live FX rate plus the universe's currency
//     hint, mirroring how the halal plan engine handles prices.
//
// Rate limits are aggressive (~1 req per 30s on some endpoints). Each
// sync makes two calls; we expect the user to tap Sync no more than
// every few minutes.

import { findAssetByT212Ticker, priceToGBP } from './halal-stocks';
import { fetchQuote } from './market-data';

const LIVE_BASE = 'https://live.trading212.com/api/v0';
const DEMO_BASE = 'https://demo.trading212.com/api/v0';

export interface T212SyncResult {
  cashGBP: number;
  positions: Array<{
    yahoo: string;
    units: number;
    avgPriceGBP: number;
  }>;
  warnings: string[];
  account: {
    availableToTrade: number;
    totalValue: number;
    currency: string;
  };
}

interface T212AccountSummary {
  cash?: {
    availableToTrade?: number;
    inPies?: number;
    reservedForOrders?: number;
  };
  // Older field shape returned by some account types.
  availableToTrade?: number;
  free?: number;
  invested?: number;
  currency?: string;
  totalValue?: number;
}

interface T212Position {
  ticker?: string;
  instrument?: { ticker?: string };
  quantity: number;
  averagePricePaid?: number;
  averagePrice?: number; // legacy field name, fallback
  currentPrice?: number;
  ppl?: number;
}

function buildAuthHeader(keyId: string, secret: string): string {
  // T212 wants Basic auth: base64("<keyId>:<secret>").
  // Use Buffer (Node-only) since this module is server-side.
  const encoded = Buffer.from(`${keyId}:${secret}`).toString('base64');
  return `Basic ${encoded}`;
}

async function t212Get<T>(base: string, path: string, auth: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('T212 rejected the credentials (401/403). Check the API Key ID and Secret are pasted in the right fields and match the Live/Demo toggle.');
  }
  if (res.status === 429) {
    throw new Error('T212 rate limit hit (429). Wait a minute and try again — the API allows about one request every 30s.');
  }
  if (res.status === 404) {
    throw new Error(`T212 endpoint not found (404 on ${path}). T212 may have changed the path again — open an issue.`);
  }
  if (!res.ok) {
    throw new Error(`T212 returned HTTP ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

async function getGbpPerUsd(): Promise<number> {
  // Same helper the halal plan route uses. GBPUSD=X meta.regularMarketPrice
  // is USD per 1 GBP, so we invert to get GBP per 1 USD.
  try {
    const q = await fetchQuote('GBPUSD=X');
    if (q && q.regularMarketPrice > 0) return 1 / q.regularMarketPrice;
  } catch { /* fall through */ }
  return 0.79;
}

export async function syncFromT212(
  keyId: string,
  secret: string,
  isDemo: boolean,
): Promise<T212SyncResult> {
  const base = isDemo ? DEMO_BASE : LIVE_BASE;
  const auth = buildAuthHeader(keyId, secret);
  const warnings: string[] = [];

  // Cash + positions in parallel — independent endpoints.
  const [summary, positionsResp] = await Promise.all([
    t212Get<T212AccountSummary>(base, '/equity/account/summary', auth),
    t212Get<T212Position[]>(base, '/equity/positions', auth),
  ]);

  // availableToTrade is the canonical "free cash" field. Different account
  // types nest it differently — accept both shapes.
  const cashGBP =
    summary?.cash?.availableToTrade ??
    summary?.availableToTrade ??
    summary?.free ??
    0;

  const gbpPerUsd = await getGbpPerUsd();
  const positions: T212SyncResult['positions'] = [];

  for (const p of positionsResp) {
    const t212Ticker = p.instrument?.ticker ?? p.ticker;
    if (!t212Ticker) continue;

    const asset = findAssetByT212Ticker(t212Ticker);
    if (!asset) {
      warnings.push(`Position "${t212Ticker}" isn't in the halal universe — skipped from coach tracking (still in your T212 account).`);
      continue;
    }
    if (!isFinite(p.quantity) || p.quantity <= 0) continue;

    // averagePricePaid is in INSTRUMENT currency (USD / GBp / etc).
    // Convert to GBP using the universe's currency hint, which is now
    // corrected to the actual quote currency (ISDU/ISDE are USD, ISWD
    // is GBp, US stocks are USD).
    const avgNative = p.averagePricePaid ?? p.averagePrice ?? 0;
    if (!isFinite(avgNative) || avgNative <= 0) continue;
    const avgPriceGBP = priceToGBP(avgNative, asset.currency, gbpPerUsd);

    positions.push({
      yahoo: asset.yahoo,
      units: +p.quantity.toFixed(6),
      avgPriceGBP: +avgPriceGBP.toFixed(4),
    });
  }

  return {
    cashGBP: +cashGBP.toFixed(2),
    positions,
    warnings,
    account: {
      availableToTrade: +cashGBP.toFixed(2),
      totalValue: +(summary?.totalValue ?? 0).toFixed(2),
      currency: summary?.currency ?? 'GBP',
    },
  };
}
