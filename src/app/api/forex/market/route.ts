import { NextResponse } from 'next/server';
import { fetchQuote, fetchMultipleQuotes } from '@/lib/market-data';
import { DEFAULT_SYMBOLS, yahooSymbol } from '@/lib/trading-engine';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols');
  const single = searchParams.get('symbol');

  try {
    if (single) {
      const sym = yahooSymbol(single);
      const quote = await fetchQuote(sym);
      if (!quote) return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 502 });
      return NextResponse.json({ symbol: single, yahooSymbol: sym, ...quote });
    }

    // Keep the original display names (e.g. "EUR/USD") alongside Yahoo symbols (e.g. "EURUSD=X")
    const displaySymbols = symbolsParam
      ? symbolsParam.split(',').map(s => s.trim())
      : [...DEFAULT_SYMBOLS];

    const yahooSymbols = displaySymbols.map(s => yahooSymbol(s));
    const quotes = await fetchMultipleQuotes(yahooSymbols);

    // Build reverse lookup: yahoo symbol -> display symbol (prevents index misalignment if a fetch fails)
    const yahooToDisplay = new Map(yahooSymbols.map((ys, i) => [ys, displaySymbols[i]]));

    const results = Array.from(quotes.entries()).map(([sym, q]) => ({
      symbol: sym,
      displaySymbol: yahooToDisplay.get(sym) || sym,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      volume: q.regularMarketVolume,
      previousClose: q.previousClose,
    }));

    return NextResponse.json({ data: results, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
