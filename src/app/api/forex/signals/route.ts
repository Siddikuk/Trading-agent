import { NextResponse } from 'next/server';
import { fetchCandles } from '@/lib/market-data';
import { yahooSymbol, getAllIndicators, analyzeSymbol, combineSignals } from '@/lib/trading-engine';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolParam = searchParams.get('symbol') || 'EUR/USD';
  const timeframe = searchParams.get('timeframe') || '1h';

  try {
    const sym = yahooSymbol(symbolParam);
    const candles = await fetchCandles(sym, timeframe);
    if (candles.length < 30) {
      return NextResponse.json({ error: 'Insufficient data for analysis', symbol: sym }, { status: 502 });
    }

    const indicators = getAllIndicators(candles);
    const price = candles[candles.length - 1].close;
    const results = analyzeSymbol(symbolParam, candles, timeframe);
    const combined = combineSignals(results);

    // Save signal to database
    if (combined && combined.confidence >= 50) {
      await db.signal.create({
        data: {
          symbol: symbolParam,
          direction: combined.direction,
          confidence: combined.confidence,
          entryPrice: combined.entryPrice,
          stopLoss: combined.stopLoss,
          takeProfit: combined.takeProfit,
          strategy: combined.strategy,
          timeframe,
          indicators: JSON.stringify(combined.indicators),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000), // 1 hour
        },
      });
    }

    // Return last 150 candles for chart display
    const chartCandles = candles.slice(-150).map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume || 0,
    }));

    return NextResponse.json({
      symbol: symbolParam,
      yahooSymbol: sym,
      timeframe,
      currentPrice: price,
      candles: chartCandles,
      indicators,
      strategyResults: results.map(r => ({
        strategy: r.signal?.strategy || 'None',
        direction: r.signal?.direction,
        confidence: r.signal?.confidence,
        reason: r.signal?.reason,
        hasSignal: !!r.signal,
      })),
      combinedSignal: combined ? {
        direction: combined.direction,
        confidence: combined.confidence,
        strategy: combined.strategy,
        entryPrice: combined.entryPrice,
        stopLoss: combined.stopLoss,
        takeProfit: combined.takeProfit,
        reason: combined.reason,
      } : null,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
