// Trading 212 public API client — READ-ONLY.
//
// This module is server-only. The user's API key is sent over from the
// client as part of a single sync request, used once to talk to T212,
// and dropped from memory when the request completes. We never persist
// or log the key.
//
// API reference: https://t212public-api-docs.redoc.ly
//
// Auth: T212 uses raw token in the Authorization header (no "Bearer ").
// Account currency: ISA accounts return cash + position prices in GBP.
// Rate limits: aggressive (~1 req per 30s on some endpoints). Each sync
// makes two calls (cash + portfolio); we expect the user to tap Sync
// no more than every few minutes.

import { findAssetByT212Ticker } from './halal-stocks';

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
    free: number;
    invested: number;
    ppl: number;     // open P/L
    total: number;
  };
}

// Minimal shape of the T212 cash response we care about.
interface T212CashResp {
  free: number;        // available to invest
  invested: number;    // currently in positions
  ppl: number;         // open P/L
  result: number;
  total: number;
  blocked?: number | null;
}

interface T212Position {
  ticker: string;
  quantity: number;       // can be fractional
  averagePrice: number;   // in account currency (GBP for an ISA)
  currentPrice: number;
  ppl: number;
  fxPpl?: number | null;
  initialFillDate?: string;
  pieQuantity?: number;
}

async function t212Get<T>(base: string, path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: {
      // T212 expects the raw token here — no "Bearer ".
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('T212 rejected the API key (401/403). Check the key is correct and matches the Live/Demo toggle.');
  }
  if (res.status === 429) {
    throw new Error('T212 rate limit hit (429). Wait a minute and try again — the API allows about one request every 30s.');
  }
  if (!res.ok) {
    throw new Error(`T212 returned HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function syncFromT212(apiKey: string, isDemo: boolean): Promise<T212SyncResult> {
  const base = isDemo ? DEMO_BASE : LIVE_BASE;
  const warnings: string[] = [];

  // Cash + portfolio in parallel — saves a round-trip and the two
  // endpoints are independent.
  const [cash, portfolio] = await Promise.all([
    t212Get<T212CashResp>(base, '/equity/account/cash', apiKey),
    t212Get<T212Position[]>(base, '/equity/portfolio', apiKey),
  ]);

  const positions: T212SyncResult['positions'] = [];

  for (const p of portfolio) {
    const asset = findAssetByT212Ticker(p.ticker);
    if (!asset) {
      warnings.push(`Position "${p.ticker}" isn't in the halal universe — skipped from coach tracking (still in your T212 account).`);
      continue;
    }
    if (!isFinite(p.quantity) || p.quantity <= 0) continue;
    if (!isFinite(p.averagePrice) || p.averagePrice <= 0) continue;

    positions.push({
      yahoo: asset.yahoo,
      units: +p.quantity.toFixed(6),
      avgPriceGBP: +p.averagePrice.toFixed(4),
    });
  }

  return {
    cashGBP: +(cash.free ?? 0).toFixed(2),
    positions,
    warnings,
    account: {
      free: +(cash.free ?? 0).toFixed(2),
      invested: +(cash.invested ?? 0).toFixed(2),
      ppl: +(cash.ppl ?? 0).toFixed(2),
      total: +(cash.total ?? 0).toFixed(2),
    },
  };
}
