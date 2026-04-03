import { NextResponse } from 'next/server';
import { fetchCandles } from '@/lib/market-data';
import { yahooSymbol, getAllIndicators } from '@/lib/trading-engine';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolParam = searchParams.get('symbol') || 'EUR/USD';
  const timeframe = searchParams.get('timeframe') || '1h';
  const limit = searchParams.get('limit');

  try {
    const sym = yahooSymbol(symbolParam);
    const candles = await fetchCandles(sym, timeframe, limit ? parseInt(limit) : undefined);
    if (candles.length === 0) {
      return NextResponse.json({ error: 'No candle data available', symbol: sym, timeframe }, { status: 502 });
    }

    const indicators = getAllIndicators(candles);

    return NextResponse.json({
      symbol: symbolParam,
      yahooSymbol: sym,
      timeframe,
      candleCount: candles.length,
      currentPrice: candles[candles.length - 1].close,
      indicators,
      candles: candles.map(c => ({
        time: c.time,
        open: +c.open.toFixed(5),
        high: +c.high.toFixed(5),
        low: +c.low.toFixed(5),
        close: +c.close.toFixed(5),
        volume: c.volume,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
