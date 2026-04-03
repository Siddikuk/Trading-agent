import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const allTrades = await db.trade.findMany({
      orderBy: { openTime: 'asc' },
    });

    const closedTrades = allTrades.filter(t => t.status === 'CLOSED' && t.pnl !== null);
    const openTrades = allTrades.filter(t => t.status === 'OPEN');

    // Basic stats
    const wins = closedTrades.filter(t => t.pnl! > 0);
    const losses = closedTrades.filter(t => t.pnl! <= 0);
    const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl!, 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

    // Avg win / avg loss
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl!, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl!, 0) / losses.length) : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Largest win / loss
    const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl!)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl!)) : 0;

    // Max consecutive wins / losses
    let maxConsWins = 0, maxConsLosses = 0, consWins = 0, consLosses = 0;
    for (const t of closedTrades) {
      if (t.pnl! > 0) { consWins++; consLosses = 0; maxConsWins = Math.max(maxConsWins, consWins); }
      else { consLosses++; consWins = 0; maxConsLosses = Math.max(maxConsLosses, consLosses); }
    }

    // Average trade duration
    const durations = closedTrades
      .filter(t => t.openTime && t.closeTime)
      .map(t => new Date(t.closeTime!).getTime() - new Date(t.openTime).getTime());
    const avgDuration = durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;

    // Daily P&L breakdown (last 30 days)
    const dailyPnL: Record<string, number> = {};
    for (const t of closedTrades) {
      if (t.closeTime && t.pnl !== null) {
        const day = new Date(t.closeTime).toISOString().split('T')[0];
        dailyPnL[day] = (dailyPnL[day] || 0) + t.pnl;
      }
    }
    const dailyBreakdown = Object.entries(dailyPnL)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, pnl]) => ({ date, pnl: Math.round(pnl * 100) / 100 }));

    // Equity curve
    const equityCurve: { date: string; equity: number }[] = [];
    let runningEquity = 0;
    for (const t of closedTrades) {
      if (t.pnl !== null) {
        runningEquity += t.pnl;
        const date = t.closeTime ? new Date(t.closeTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        equityCurve.push({ date, equity: Math.round(runningEquity * 100) / 100 });
      }
    }

    // Strategy performance
    const strategyStats: Record<string, { count: number; wins: number; pnl: number }> = {};
    for (const t of closedTrades) {
      const strat = t.strategy || 'Unknown';
      if (!strategyStats[strat]) strategyStats[strat] = { count: 0, wins: 0, pnl: 0 };
      strategyStats[strat].count++;
      if (t.pnl! > 0) strategyStats[strat].wins++;
      strategyStats[strat].pnl += t.pnl!;
    }
    const strategyBreakdown = Object.entries(strategyStats).map(([strategy, stats]) => ({
      strategy,
      trades: stats.count,
      winRate: stats.count > 0 ? Math.round((stats.wins / stats.count) * 100) : 0,
      pnl: Math.round(stats.pnl * 100) / 100,
    }));

    // Current exposure
    const currentExposure = openTrades.reduce((sum, t) => sum + (t.lotSize || 0.01), 0);

    return NextResponse.json({
      totalTrades: allTrades.length,
      closedTrades: closedTrades.length,
      openPositions: openTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Math.round(winRate * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      largestWin: Math.round(largestWin * 100) / 100,
      largestLoss: Math.round(largestLoss * 100) / 100,
      maxConsecutiveWins: maxConsWins,
      maxConsecutiveLosses: maxConsLosses,
      avgDurationMs: Math.round(avgDuration),
      dailyBreakdown,
      equityCurve,
      strategyBreakdown,
      currentExposure: Math.round(currentExposure * 100) / 100,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
