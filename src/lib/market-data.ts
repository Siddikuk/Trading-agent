// Market data fetching — Yahoo Finance with MT5 dual provider support
import { Candle, TIMEFRAME_CANDLE_LIMITS } from './trading-engine';
import {
  isMT5Connected, fetchMT5Quotes, fetchMT5Candles,
  toMT5Symbol, mt5QuoteToYahooFormat, isMT5Quote,
  type MT5CompatibleQuote,
} from './mt5-provider';

interface YahooQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  previousClose: number;
  shortName: string;
}

// Extended quote that may carry MT5 source info
export type FetchQuoteResult = YahooQuote | MT5CompatibleQuote;

interface YahooChartResult {
  timestamp: number[];
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

const CACHE = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30000; // 30s for quotes, 60s for candles

async function fetchWithCache<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < ttl) return cached.data as T;
  const data = await fetcher();
  CACHE.set(key, { data, ts: Date.now() });
  return data;
}

export async function fetchQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    // Try MT5 first
    if (await isMT5Connected()) {
      const mt5Quotes = await fetchMT5Quotes([symbol]);
      if (mt5Quotes && mt5Quotes.length > 0) {
        const converted = mt5QuoteToYahooFormat(mt5Quotes[0]);
        return converted;
      }
    }
  } catch {
    // MT5 failed, fall through to Yahoo
  }

  try {
    const data = await fetchWithCache(`quote_${symbol}`, CACHE_TTL, async () => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });

    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    return {
      regularMarketPrice: meta.regularMarketPrice,
      regularMarketChange: meta.regularMarketChange ?? meta.regularMarketPrice - meta.previousClose,
      regularMarketChangePercent: meta.regularMarketChangePercent ?? 0,
      regularMarketVolume: meta.regularMarketVolume ?? 0,
      previousClose: meta.previousClose ?? meta.chartPreviousClose,
      shortName: meta.symbol,
    };
  } catch (e) {
    console.error(`Failed to fetch quote for ${symbol}:`, e);
    return null;
  }
}

// Check if MT5 was used for the last quote fetch
export async function isDataSourceMT5(): Promise<boolean> {
  return await isMT5Connected();
}

export async function fetchCandles(symbol: string, timeframe: string, limit?: number): Promise<Candle[]> {
  // Try MT5 first
  try {
    if (await isMT5Connected()) {
      const candleLimit = limit ?? TIMEFRAME_CANDLE_LIMITS[timeframe] ?? 200;
      const mt5Candles = await fetchMT5Candles(symbol, timeframe, candleLimit);
      if (mt5Candles && mt5Candles.length > 0) {
        return mt5Candles;
      }
    }
  } catch {
    // MT5 failed, fall through to Yahoo
  }

  // Fallback to Yahoo
  try {
    const candleLimit = limit ?? TIMEFRAME_CANDLE_LIMITS[timeframe] ?? 200;
    const rangeMap: Record<string, Record<string, string>> = {
      '5m': { range: '5d', interval: '5m' },
      '15m': { range: '10d', interval: '15m' },
      '1h': { range: '30d', interval: '1h' },
      '4h': { range: '60d', interval: '1h' }, // use 1h, later aggregate
      '1d': { range: '1y', interval: '1d' },
    };
    const cfg = rangeMap[timeframe] ?? rangeMap['1h'];

    const data = await fetchWithCache(`candles_${symbol}_${timeframe}`, 60000, async () => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${cfg.range}&interval=${cfg.interval}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });

    const chartResult = data?.chart?.result?.[0];
    if (!chartResult) return [];

    // Yahoo Finance API: OHLC data may be directly on result or nested under indicators.quote[0]
    let timestamps = chartResult.timestamp || [];
    let opens: (number | null)[] = chartResult.open || [];
    let highs: (number | null)[] = chartResult.high || [];
    let lows: (number | null)[] = chartResult.low || [];
    let closes: (number | null)[] = chartResult.close || [];
    let volumes: (number | null)[] = chartResult.volume || [];

    // If direct arrays are empty, try indicators.quote[0] format
    if (opens.length === 0 && chartResult.indicators?.quote?.[0]) {
      const quote = chartResult.indicators.quote[0];
      opens = quote.open || [];
      highs = quote.high || [];
      lows = quote.low || [];
      closes = quote.close || [];
      volumes = quote.volume || [];
    }

    if (timestamps.length === 0 || opens.length === 0) return [];

    // For 4h — aggregate 1h candles into 4h
    if (timeframe === '4h') {
      const aggregated = aggregateTo4h(timestamps, opens, highs, lows, closes, volumes);
      timestamps = aggregated.timestamps;
      opens = aggregated.opens;
      highs = aggregated.highs;
      lows = aggregated.lows;
      closes = aggregated.closes;
      volumes = aggregated.volumes;
    }

    const candles: Candle[] = [];
    const startIdx = Math.max(0, timestamps.length - candleLimit);
    const maxIdx = Math.min(timestamps.length, opens.length, closes.length);
    for (let i = startIdx; i < maxIdx; i++) {
      if (opens[i] == null || closes[i] == null) continue;
      candles.push({
        time: timestamps[i] * 1000,
        open: opens[i]!,
        high: highs[i] ?? opens[i]!,
        low: lows[i] ?? opens[i]!,
        close: closes[i]!,
        volume: volumes[i] ?? 0,
      });
    }
    return candles;
  } catch (e) {
    console.error(`Failed to fetch candles for ${symbol} ${timeframe}:`, e);
    return [];
  }
}

function aggregateTo4h(
  timestamps: number[], opens: (number|null)[], highs: (number|null)[],
  lows: (number|null)[], closes: (number|null)[], volumes: (number|null)[]
) {
  const aggTimestamps: number[] = [];
  const aggOpens: (number|null)[] = [];
  const aggHighs: (number|null)[] = [];
  const aggLows: (number|null)[] = [];
  const aggCloses: (number|null)[] = [];
  const aggVolumes: (number|null)[] = [];

  for (let i = 0; i < timestamps.length; i += 4) {
    const groupOpen = opens[i];
    const groupClose = closes[Math.min(i + 3, timestamps.length - 1)];
    const groupHighs = highs.slice(i, i + 4).filter(h => h != null).map(h => h!);
    const groupLows = lows.slice(i, i + 4).filter(l => l != null).map(l => l!);
    const groupVol = volumes.slice(i, i + 4).filter(v => v != null).reduce((a, v) => a + v!, 0);

    aggTimestamps.push(timestamps[i]);
    aggOpens.push(groupOpen);
    aggHighs.push(groupHighs.length > 0 ? Math.max(...groupHighs) : groupOpen);
    aggLows.push(groupLows.length > 0 ? Math.min(...groupLows) : groupOpen);
    aggCloses.push(groupClose);
    aggVolumes.push(groupVol);
  }

  return { timestamps: aggTimestamps, opens: aggOpens, highs: aggHighs, lows: aggLows, closes: aggCloses, volumes: aggVolumes };
}

export async function fetchMultipleQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const results = new Map<string, YahooQuote>();

  // Try MT5 first for all symbols
  try {
    if (await isMT5Connected()) {
      const mt5Quotes = await fetchMT5Quotes(symbols);
      if (mt5Quotes && mt5Quotes.length > 0) {
        // Match MT5 quotes back to the original symbol keys
        for (const mt5Q of mt5Quotes) {
          // Find the original display symbol that maps to this MT5 symbol
          for (const sym of symbols) {
            if (toMT5Symbol(sym) === mt5Q.symbol) {
              results.set(sym, mt5QuoteToYahooFormat(mt5Q));
              break;
            }
          }
        }
        // If we got quotes for all symbols, return early
        if (results.size >= symbols.length) return results;
        // Otherwise, continue to Yahoo for missing symbols
        const missingSymbols = symbols.filter(s => !results.has(s));
        if (missingSymbols.length === 0) return results;
        const yahooResults = await fetchYahooMultipleQuotes(missingSymbols);
        for (const [sym, quote] of yahooResults.entries()) {
          results.set(sym, quote);
        }
        return results;
      }
    }
  } catch {
    // MT5 failed, fall through to Yahoo
  }

  // Fallback: fetch from Yahoo
  return await fetchYahooMultipleQuotes(symbols);
}

async function fetchYahooMultipleQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const results = new Map<string, YahooQuote>();
  const promises = symbols.map(async (sym) => {
    const quote = await fetchYahooQuoteDirect(sym);
    if (quote) results.set(sym, quote);
  });
  await Promise.allSettled(promises);
  return results;
}

// Direct Yahoo fetch without MT5 check (used internally for fallback)
async function fetchYahooQuoteDirect(symbol: string): Promise<YahooQuote | null> {
  try {
    const data = await fetchWithCache(`quote_${symbol}`, CACHE_TTL, async () => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      regularMarketPrice: meta.regularMarketPrice,
      regularMarketChange: meta.regularMarketChange ?? meta.regularMarketPrice - meta.previousClose,
      regularMarketChangePercent: meta.regularMarketChangePercent ?? 0,
      regularMarketVolume: meta.regularMarketVolume ?? 0,
      previousClose: meta.previousClose ?? meta.chartPreviousClose,
      shortName: meta.symbol,
    };
  } catch (e) {
    console.error(`Failed to fetch quote for ${symbol}:`, e);
    return null;
  }
}
