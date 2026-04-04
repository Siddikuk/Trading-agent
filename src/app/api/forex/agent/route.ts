import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    let state = await db.agentState.findUnique({ where: { id: 'main' } });
    if (!state) {
      state = await db.agentState.create({ data: { id: 'main' } });
    }
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { isRunning, autoTrade, balance, maxRiskPercent, maxDrawdownPercent, dailyRiskLimit, strategies, watchSymbols, timeframe, mt5Connected } = body;

    const state = await db.agentState.upsert({
      where: { id: 'main' },
      update: {
        ...(isRunning !== undefined && { isRunning }),
        ...(autoTrade !== undefined && { autoTrade }),
        ...(balance !== undefined && { balance: parseFloat(balance) }),
        ...(maxRiskPercent !== undefined && { maxRiskPercent: parseFloat(maxRiskPercent) }),
        ...(maxDrawdownPercent !== undefined && { maxDrawdownPercent: parseFloat(maxDrawdownPercent) }),
        ...(dailyRiskLimit !== undefined && { dailyRiskLimit: parseFloat(dailyRiskLimit) }),
        ...(strategies !== undefined && { strategies: typeof strategies === 'string' ? strategies : strategies.join(',') }),
        ...(watchSymbols !== undefined && { watchSymbols: typeof watchSymbols === 'string' ? watchSymbols : watchSymbols.join(',') }),
        ...(timeframe !== undefined && { timeframe }),
        ...(mt5Connected !== undefined && { mt5Connected }),
        lastScanAt: new Date(),
      },
      create: {
        id: 'main',
        ...(isRunning !== undefined && { isRunning }),
        ...(autoTrade !== undefined && { autoTrade }),
        ...(balance !== undefined && { balance: parseFloat(balance) }),
        ...(maxRiskPercent !== undefined && { maxRiskPercent: parseFloat(maxRiskPercent) }),
        ...(maxDrawdownPercent !== undefined && { maxDrawdownPercent: parseFloat(maxDrawdownPercent) }),
        ...(dailyRiskLimit !== undefined && { dailyRiskLimit: parseFloat(dailyRiskLimit) }),
        ...(strategies !== undefined && { strategies: typeof strategies === 'string' ? strategies : strategies.join(',') }),
        ...(watchSymbols !== undefined && { watchSymbols: typeof watchSymbols === 'string' ? watchSymbols : watchSymbols.join(',') }),
        ...(timeframe !== undefined && { timeframe }),
        ...(mt5Connected !== undefined && { mt5Connected }),
      },
    });

    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
