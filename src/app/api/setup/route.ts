// Auto-setup database tables on first visit
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const url = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
    if (!url) {
      return NextResponse.json({ error: 'No database URL configured' }, { status: 500 });
    }
    const sql = neon(url);

    // Create each table separately using .query() for raw SQL
    await sql.query(`
      CREATE TABLE IF NOT EXISTS "Trade" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "symbol" TEXT NOT NULL,
        "direction" TEXT NOT NULL,
        "lotSize" REAL NOT NULL,
        "entryPrice" REAL NOT NULL,
        "stopLoss" REAL,
        "takeProfit" REAL,
        "exitPrice" REAL,
        "pnl" REAL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "signalId" TEXT,
        "strategy" TEXT,
        "openTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "closeTime" DATETIME,
        "notes" TEXT
      )
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS "Signal" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "symbol" TEXT NOT NULL,
        "direction" TEXT NOT NULL,
        "confidence" REAL NOT NULL,
        "entryPrice" REAL NOT NULL,
        "stopLoss" REAL NOT NULL,
        "takeProfit" REAL NOT NULL,
        "strategy" TEXT NOT NULL,
        "timeframe" TEXT NOT NULL,
        "indicators" TEXT NOT NULL,
        "executed" BOOLEAN NOT NULL DEFAULT false,
        "tradeId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" DATETIME
      )
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS "AgentState" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
        "isRunning" BOOLEAN NOT NULL DEFAULT false,
        "autoTrade" BOOLEAN NOT NULL DEFAULT false,
        "balance" REAL NOT NULL DEFAULT 1000,
        "currency" TEXT NOT NULL DEFAULT 'USD',
        "maxRiskPercent" REAL NOT NULL DEFAULT 2,
        "maxDrawdownPercent" REAL NOT NULL DEFAULT 10,
        "dailyRiskLimit" REAL NOT NULL DEFAULT 5,
        "strategies" TEXT NOT NULL DEFAULT 'RSI,MACD,Bollinger',
        "watchSymbols" TEXT NOT NULL DEFAULT 'EURUSD=X,GBPUSD=X,USDJPY=X,XAUUSD=X,BTCUSD=X',
        "timeframe" TEXT NOT NULL DEFAULT '1h',
        "mt5Connected" BOOLEAN NOT NULL DEFAULT false,
        "lastScanAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS "PriceAlert" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "symbol" TEXT NOT NULL,
        "condition" TEXT NOT NULL,
        "price" REAL NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "triggered" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "triggeredAt" DATETIME
      )
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS "WatchlistGroup" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "symbols" TEXT NOT NULL,
        "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default agent state if not exists
    await sql.query(`
      INSERT INTO "AgentState" ("id")
      SELECT 'main'
      WHERE NOT EXISTS (SELECT 1 FROM "AgentState" WHERE "id" = 'main')
    `);

    return NextResponse.json({ success: true, message: 'Database tables created successfully' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
