import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const trades = await db.trade.findMany({
      orderBy: { openTime: 'desc' },
      take: 50,
    });

    const stats = await db.trade.aggregate({
      _count: true,
      where: { status: 'CLOSED' },
      _avg: { pnl: true },
      _sum: { pnl: true },
    });

    const openTrades = trades.filter(t => t.status === 'OPEN');
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    const wins = closedTrades.filter(t => t.pnl && t.pnl > 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

    return NextResponse.json({
      trades,
      stats: {
        totalTrades: stats._count,
        openPositions: openTrades.length,
        closedPositions: closedTrades.length,
        wins: wins.length,
        losses: closedTrades.length - wins.length,
        winRate: Math.round(winRate * 100) / 100,
        totalPnL: stats._sum.pnl || 0,
        avgPnL: stats._avg.pnl ? Math.round(stats._avg.pnl * 100) / 100 : 0,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, direction, lotSize, entryPrice, stopLoss, takeProfit, strategy, signalId } = body;

    if (!symbol || !direction || !entryPrice) {
      return NextResponse.json({ error: 'symbol, direction, and entryPrice are required' }, { status: 400 });
    }

    const trade = await db.trade.create({
      data: {
        symbol,
        direction,
        lotSize: lotSize || 0.01,
        entryPrice: parseFloat(entryPrice),
        stopLoss: stopLoss ? parseFloat(stopLoss) : null,
        takeProfit: takeProfit ? parseFloat(takeProfit) : null,
        strategy: strategy || null,
        signalId: signalId || null,
        status: 'OPEN',
        openTime: new Date(),
      },
    });

    if (signalId) {
      await db.signal.update({ where: { id: signalId }, data: { executed: true, tradeId: trade.id } });
    }

    return NextResponse.json({ trade, success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
