import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchCandles, fetchQuote } from '@/lib/market-data';
import { yahooSymbol, getAllIndicators, analyzeSymbol, combineSignals, calcPositionSize, calcRiskReward } from '@/lib/trading-engine';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbols, timeframe } = body;
    const symList = symbols || ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD'];
    const tf = timeframe || '1h';

    // Get agent state
    let agentState = await db.agentState.findUnique({ where: { id: 'main' } });
    if (!agentState || !agentState.isRunning || !agentState.autoTrade) {
      return NextResponse.json({ error: 'Agent not running or auto-trade disabled', scanned: 0, trades: 0 });
    }

    // Get recent trades for risk check
    const recentTrades = await db.trade.findMany({
      where: { status: 'CLOSED', closeTime: { gte: new Date(Date.now() - 86400000) } },
    });
    const dailyPnL = recentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const dailyLimit = agentState.dailyRiskLimit;
    const maxLoss = agentState.balance * (dailyLimit / 100);
    if (dailyPnL <= -maxLoss) {
      return NextResponse.json({ error: 'Daily risk limit reached — stopping', dailyPnL, maxLoss, scanned: 0, trades: 0 });
    }

    // Check for too many open positions
    const openCount = await db.trade.count({ where: { status: 'OPEN' } });
    if (openCount >= 5) {
      return NextResponse.json({ error: 'Max 5 open positions', openCount, scanned: 0, trades: 0 });
    }

    let newTrades = 0;
    const results: Record<string, unknown> = {};

    for (const displaySym of symList) {
      try {
        const sym = yahooSymbol(displaySym);

        // Skip if already have open position on this symbol
        const existingOpen = await db.trade.findFirst({ where: { symbol: displaySym, status: 'OPEN' } });
        if (existingOpen) {
          results[displaySym] = { skipped: 'Already have open position' };
          continue;
        }

        const candles = await fetchCandles(sym, tf);
        if (candles.length < 30) {
          results[displaySym] = { skipped: 'Insufficient data' };
          continue;
        }

        const indicators = getAllIndicators(candles);
        const price = candles[candles.length - 1].close;
        const signalResults = analyzeSymbol(displaySym, candles, tf);
        const combined = combineSignals(signalResults);

        if (!combined || combined.confidence < 60) {
          results[displaySym] = { skipped: `Low confidence: ${combined?.confidence || 0}%` };
          continue;
        }

        // Calculate position size
        const lotSize = calcPositionSize(
          agentState.balance,
          agentState.maxRiskPercent,
          combined.entryPrice,
          combined.stopLoss,
        );

        // Auto-execute trade
        const trade = await db.trade.create({
          data: {
            symbol: displaySym,
            direction: combined.direction,
            lotSize,
            entryPrice: combined.entryPrice,
            stopLoss: combined.stopLoss,
            takeProfit: combined.takeProfit,
            strategy: combined.strategy,
            status: 'OPEN',
            openTime: new Date(),
          },
        });

        // Save signal
        await db.signal.create({
          data: {
            symbol: displaySym,
            direction: combined.direction,
            confidence: combined.confidence,
            entryPrice: combined.entryPrice,
            stopLoss: combined.stopLoss,
            takeProfit: combined.takeProfit,
            strategy: combined.strategy,
            timeframe: tf,
            indicators: JSON.stringify(indicators),
            executed: true,
            tradeId: trade.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        const rr = calcRiskReward(combined.entryPrice, combined.stopLoss, combined.takeProfit);

        results[displaySym] = {
          action: 'TRADE_OPENED',
          tradeId: trade.id,
          direction: combined.direction,
          confidence: combined.confidence,
          entryPrice: combined.entryPrice,
          stopLoss: combined.stopLoss,
          takeProfit: combined.takeProfit,
          lotSize,
          riskReward: rr,
          reason: combined.reason,
        };
        newTrades++;
      } catch (e) {
        results[displaySym] = { error: String(e) };
      }

      // Rate limit: small delay between symbols
      await new Promise(r => setTimeout(r, 500));
    }

    // Update agent last scan
    await db.agentState.update({ where: { id: 'main' }, data: { lastScanAt: new Date() } });

    return NextResponse.json({
      success: true,
      scanned: symList.length,
      newTrades,
      dailyPnL,
      results,
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
