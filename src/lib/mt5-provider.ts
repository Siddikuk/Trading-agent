// MT5 Bridge Provider — Core abstraction layer for MT5 data
// Proxies all requests through the in-memory bridge URL stored via config API

import { Candle } from './trading-engine';

// ==================== TYPES ====================

export interface MT5Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  change: number;
  changePercent: number;
  spread: number;
  digits: number;
  timestamp: number;
}

export interface MT5Account {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  currency: string;
  profit: number;
}

export interface MT5Position {
  ticket: number;
  symbol: string;
  type: number; // 0=BUY, 1=SELL
  lots: number;
  price_open: number;
  price_current: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  comment: string;
  time_open: number;
  time_update: number;
}

export interface MT5Deal {
  ticket: number;
  symbol: string;
  type: number;
  lots: number;
  price_open: number;
  price_close: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
  time_open: number;
  time_close: number;
}

export interface MT5OrderRequest {
  symbol: string;
  type: number; // 0=BUY, 1=SELL
  lots: number;
  price?: number;
  sl: number;
  tp: number;
  comment?: string;
  magic?: number;
}

export interface MT5OrderResult {
  success: boolean;
  ticket?: number;
  price?: number;
  error?: string;
}

export interface MT5CloseResult {
  success: boolean;
  ticket?: number;
  price?: number;
  profit?: number;
  error?: string;
}

// ==================== IN-MEMORY BRIDGE URL STORE ====================

let bridgeUrl: string | null = null;
let connectionStatus: { connected: boolean; lastCheck: number } = {
  connected: false,
  lastCheck: 0,
};
const CONNECTION_CACHE_TTL = 30000; // 30 seconds

export function setBridgeUrl(url: string | null): void {
  bridgeUrl = url;
  // Reset connection status when URL changes
  connectionStatus = { connected: false, lastCheck: 0 };
}

export function getBridgeUrl(): string | null {
  return bridgeUrl;
}

/** Extract bridge URL from request header (fallback for hot-reload resilience) */
export function getBridgeUrlFromRequest(req: Request): string | null {
  // Check for custom header sent by the client
  const headerUrl = req.headers.get('x-mt5-bridge-url');
  if (headerUrl && (headerUrl.startsWith('http://') || headerUrl.startsWith('https://'))) {
    // Also save it to in-memory store so subsequent requests work
    if (headerUrl !== bridgeUrl) {
      bridgeUrl = headerUrl;
    }
    return headerUrl;
  }
  return bridgeUrl;
}

/** Get effective bridge URL — checks request header first, then in-memory */
export function getEffectiveBridgeUrl(req: Request): string | null {
  return getBridgeUrlFromRequest(req) || bridgeUrl;
}

// ==================== SYMBOL MAPPING ====================

// Convert our display format (e.g. "EUR/USD") to MT5 format (e.g. "EURUSD")
export function toMT5Symbol(symbol: string): string {
  // Handle both display format ("EUR/USD") and Yahoo format ("EURUSD=X")
  // Strip everything except alphanumeric chars: EUR/USD → EURUSD, EURUSD=X → EURUSD
  return symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

// Convert MT5 symbol back to our display format
export function fromMT5Symbol(mt5Symbol: string): string {
  // Common forex pairs: insert slash after first 3 chars
  const knownPairs: Record<string, string> = {
    EURUSD: 'EUR/USD',
    GBPUSD: 'GBP/USD',
    USDJPY: 'USD/JPY',
    AUDUSD: 'AUD/USD',
    USDCHF: 'USD/CHF',
    USDCAD: 'USD/CAD',
    NZDUSD: 'NZD/USD',
    XAUUSD: 'XAU/USD',
    BTCUSD: 'BTC/USD',
  };
  return knownPairs[mt5Symbol] || mt5Symbol;
}

// ==================== TIMEFRAME MAPPING ====================

// Map our app timeframes to the Python bridge's expected format
const TIMEFRAME_TO_BRIDGE: Record<string, string> = {
  '5m': 'M5',
  '15m': 'M15',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D1',
};

// ==================== CORE FUNCTIONS ====================

async function proxyToBridge<T>(path: string, explicitUrl?: string | null, options?: RequestInit): Promise<T | null> {
  const url = explicitUrl || bridgeUrl;
  if (!url) return null;
  try {
    const baseUrl = url.replace(/\/+$/, '');
    const fetchUrl = `${baseUrl}/api/mt5${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const res = await fetch(fetchUrl, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[MT5] Bridge returned ${res.status} for ${path}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`[MT5] Bridge proxy error for ${path}:`, e);
    return null;
  }
}

export async function isMT5Connected(): Promise<boolean> {
  // Use cached result if still valid
  if (connectionStatus.lastCheck > 0 && Date.now() - connectionStatus.lastCheck < CONNECTION_CACHE_TTL) {
    return connectionStatus.connected;
  }

  if (!bridgeUrl) {
    connectionStatus = { connected: false, lastCheck: Date.now() };
    return false;
  }

  const base = bridgeUrl.replace(/\/+$/, '');

  // Try /api/mt5/health first, fallback to /api/mt5/account (some bridge versions have health issues)
  const endpoints = ['/api/mt5/health', '/api/mt5/account'];

  for (const path of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${base}${path}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        connectionStatus = { connected: true, lastCheck: Date.now() };
        return true;
      }
    } catch {
      // Try next endpoint
    }
  }

  connectionStatus = { connected: false, lastCheck: Date.now() };
  return false;
}

export async function fetchMT5Quotes(symbols: string[]): Promise<MT5Quote[] | null> {
  // Convert display symbols to MT5 format
  const mt5Symbols = symbols.map(toMT5Symbol);
  const symbolParam = mt5Symbols.join(',');
  const data = await proxyToBridge<{ data: MT5Quote[] }>(`/quotes?symbols=${encodeURIComponent(symbolParam)}`);
  return data?.data ?? null;
}

export async function fetchMT5Candles(
  symbol: string,
  timeframe: string,
  count: number = 200
): Promise<Candle[] | null> {
  const mt5Symbol = toMT5Symbol(symbol);
  const mt5Timeframe = TIMEFRAME_TO_BRIDGE[timeframe] || 'H1';
  const data = await proxyToBridge<{
    candles: Array<{
      time: number; open: number; high: number; low: number;
      close: number; volume: number; tick_volume: number;
    }>;
  }>(`/candles?symbol=${encodeURIComponent(mt5Symbol)}&timeframe=${encodeURIComponent(mt5Timeframe)}&count=${count}`);

  if (!data?.candles) return null;

  // Convert MT5 candle format to our Candle format
  // MT5 returns time in unix seconds, we need unix ms
  return data.candles.map(c => ({
    time: c.time * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume || c.tick_volume,
  }));
}

export async function fetchMT5Account(explicitUrl?: string | null): Promise<MT5Account | null> {
  const data = await proxyToBridge<MT5Account>('/account', explicitUrl);
  return data;
}

export async function fetchMT5Positions(explicitUrl?: string | null): Promise<MT5Position[] | null> {
  const data = await proxyToBridge<{ positions: MT5Position[] }>('/positions', explicitUrl);
  return data?.positions ?? null;
}

export async function fetchMT5History(from: number, to: number): Promise<MT5Deal[] | null> {
  const data = await proxyToBridge<{ deals: MT5Deal[] }>(
    `/history?from=${from}&to=${to}`
  );
  return data?.deals ?? null;
}

export async function sendMT5Order(order: MT5OrderRequest, explicitUrl?: string | null): Promise<MT5OrderResult> {
  const url = explicitUrl || bridgeUrl;
  if (!url) {
    return { success: false, error: 'MT5 bridge not configured' };
  }
  try {
    const orderUrl = `${url.replace(/\/+$/, '')}/api/mt5/order`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s for orders
    const res = await fetch(orderUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await res.json();
  } catch (e) {
    return { success: false, error: `Bridge error: ${(e as Error).message}` };
  }
}

export async function closeMT5Position(ticket?: number, symbol?: string, explicitUrl?: string | null): Promise<MT5CloseResult> {
  const url = explicitUrl || bridgeUrl;
  if (!url) {
    return { success: false, error: 'MT5 bridge not configured' };
  }
  try {
    const closeUrl = `${url.replace(/\/+$/, '')}/api/mt5/close`;
    const body = ticket ? { ticket } : symbol ? { symbol, type: 'ALL' } : {};
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(closeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await res.json();
  } catch (e) {
    return { success: false, error: `Bridge error: ${(e as Error).message}` };
  }
}

// ==================== YAHOO COMPATIBILITY ====================
// Convert MT5Quote to a format compatible with YahooQuote interface

export interface MT5CompatibleQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  previousClose: number;
  shortName: string;
  _source: 'MT5'; // Tag to identify MT5 data
}

export function mt5QuoteToYahooFormat(quote: MT5Quote): MT5CompatibleQuote {
  return {
    regularMarketPrice: quote.last || (quote.bid + quote.ask) / 2,
    regularMarketChange: quote.change,
    regularMarketChangePercent: quote.changePercent,
    regularMarketVolume: 0, // MT5 quotes don't include volume
    previousClose: (quote.last || (quote.bid + quote.ask) / 2) - quote.change,
    shortName: fromMT5Symbol(quote.symbol),
    _source: 'MT5',
  };
}

export function isMT5Quote(q: unknown): q is MT5CompatibleQuote {
  return (q as MT5CompatibleQuote)?._source === 'MT5';
}
