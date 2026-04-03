import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analyzeWithAI, type AIDecision } from '@/lib/ai-agent';
import { yahooSymbol } from '@/lib/trading-engine';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbols, timeframe } = body;
    const symList: string[] = symbols || ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'BTC/USD'];
    const tf = timeframe || '1h';

    // Get agent state
    let agentState = await db.agentState.findUnique({ where: { id: 'main' } });
    if (!agentState || !agentState.isRunning) {
      return NextResponse.json({
        error: 'Agent not running',
        scanned: 0,
        trades: 0,
        results: Object.fromEntries(symList.map(s => [s, { skipped: 'Agent not running' }])),
      });
    }

    // Risk checks
    const recentTrades = await db.trade.findMany({
      where: { status: 'CLOSED', closeTime: { gte: new Date(Date.now() - 86400000) } },
    });
    const dailyPnL = recentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const maxLoss = agentState.balance * (agentState.dailyRiskLimit / 100);
    if (dailyPnL <= -maxLoss) {
      return NextResponse.json({
        error: 'Daily risk limit reached — agent paused',
        dailyPnL: Math.round(dailyPnL * 100) / 100,
        maxLoss: Math.round(maxLoss * 100) / 100,
        scanned: 0, trades: 0,
        results: Object.fromEntries(symList.map(s => [s, { skipped: 'Daily risk limit reached' }])),
      });
    }

    const openCount = await db.trade.count({ where: { status: 'OPEN' } });
    const maxPositions = 5;
    if (openCount >= maxPositions) {
      return NextResponse.json({
        error: `Max ${maxPositions} open positions reached`,
        openCount, scanned: 0, trades: 0,
        results: Object.fromEntries(symList.map(s => [s, { skipped: 'Max positions reached' }])),
      });
    }

    let newTrades = 0;
    const results: Record<string, Record<string, unknown>> = {};

    for (const displaySym of symList) {
      try {
        // Skip if already have open position on this symbol
        const existingOpen = await db.trade.findFirst({ where: { symbol: displaySym, status: 'OPEN' } });
        if (existingOpen) {
          results[displaySym] = { skipped: 'Already have open position' };
          continue;
        }

        // AI ANALYSIS — this is the brain
        const decision: AIDecision = await analyzeWithAI(
          displaySym,
          tf,
          agentState.balance,
          agentState.maxRiskPercent,
          true // enable news
        );

        if (!decision.shouldTrade) {
          results[displaySym] = {
            action: 'HOLD',
            direction: decision.direction,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
            sentimentScore: decision.sentimentScore,
            skipReason: decision.skipReason,
          };
          continue;
        }

        // Auto-execute trade (only if autoTrade is enabled)
        if (!agentState.autoTrade) {
          results[displaySym] = {
            action: 'SIGNAL_ONLY',
            direction: decision.direction,
            confidence: decision.confidence,
            entryPrice: decision.entryPrice,
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
            lotSize: decision.lotSize,
            riskReward: decision.riskRewardRatio,
            reasoning: decision.reasoning,
            sentimentScore: decision.sentimentScore,
          };
          continue;
        }

        // Execute the trade
        const trade = await db.trade.create({
          data: {
            symbol: displaySym,
            direction: decision.direction,
            lotSize: decision.lotSize,
            entryPrice: decision.entryPrice,
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
            strategy: 'AI-Agent',
            status: 'OPEN',
            openTime: new Date(),
            notes: `AI reasoning: ${decision.reasoning.slice(0, 500)}`,
          },
        });

        // Save signal record
        await db.signal.create({
          data: {
            symbol: displaySym,
            direction: decision.direction,
            confidence: decision.confidence,
            entryPrice: decision.entryPrice,
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
            strategy: 'AI-Agent',
            timeframe: tf,
            indicators: JSON.stringify({ sentimentScore: decision.sentimentScore, riskReward: decision.riskRewardRatio }),
            executed: true,
            tradeId: trade.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });

        results[displaySym] = {
          action: 'TRADE_OPENED',
          tradeId: trade.id,
          direction: decision.direction,
          confidence: decision.confidence,
          entryPrice: decision.entryPrice,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
          lotSize: decision.lotSize,
          riskReward: decision.riskRewardRatio,
          reasoning: decision.reasoning,
          sentimentScore: decision.sentimentScore,
        };
        newTrades++;
      } catch (e) {
        console.error(`[Scan] Error for ${displaySym}:`, e);
        results[displaySym] = { error: String(e) };
      }
    }

    // Update agent last scan
    await db.agentState.update({ where: { id: 'main' }, data: { lastScanAt: new Date() } });

    return NextResponse.json({
      success: true,
      scanned: symList.length,
      newTrades,
      dailyPnL: Math.round(dailyPnL * 100) / 100,
      results,
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
