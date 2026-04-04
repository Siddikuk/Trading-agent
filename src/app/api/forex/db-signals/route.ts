import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Returns the most recent signal per symbol (from DB only — no live scan)
export async function GET() {
  try {
    const recent = await db.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Keep only the most recent signal per symbol
    const bySymbol = new Map<string, typeof recent[number]>();
    for (const sig of recent) {
      if (!bySymbol.has(sig.symbol)) {
        bySymbol.set(sig.symbol, sig);
      }
    }

    return NextResponse.json({ signals: Array.from(bySymbol.values()) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
