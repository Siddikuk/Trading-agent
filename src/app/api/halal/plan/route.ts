import { NextResponse } from 'next/server';
import { fetchCandlesWithMeta, fetchQuote } from '@/lib/market-data';
import { HALAL_UNIVERSE, findAsset } from '@/lib/halal-stocks';
import {
  scoreAsset, allocateBudget, evaluateHolding,
  type GamePlan, type Holding, type AssetSnapshot,
} from '@/lib/halal-engine';

// One year of daily candles is enough for 52-week metrics + 50-day SMAs.
const TIMEFRAME = '1d';
const CANDLE_LIMIT = 260;

async function getGbpPerUsd(): Promise<number> {
  // Yahoo symbol for GBP/USD spot — meta.regularMarketPrice = USD per 1 GBP.
  // We want GBP per 1 USD, so invert.
  try {
    const q = await fetchQuote('GBPUSD=X');
    if (q && q.regularMarketPrice > 0) return 1 / q.regularMarketPrice;
  } catch { /* fall through */ }
  return 0.79; // sensible fallback
}

async function buildPlan(budgetGBP: number, holdings: Holding[], certifiedOnly: boolean): Promise<GamePlan> {
  const warnings: string[] = [];
  const fxGbpPerUsd = await getGbpPerUsd();

  // Fetch candles for every asset in parallel — Yahoo handles this fine
  // and our market-data layer caches for 60s. We still score the whole
  // universe so the Universe tab can show every asset's signal; the
  // certifiedOnly filter only affects which assets get £ allocations.
  const results = await Promise.all(
    HALAL_UNIVERSE.map(async (asset) => {
      try {
        const { candles, currency } = await fetchCandlesWithMeta(asset.yahoo, TIMEFRAME, CANDLE_LIMIT);
        if (candles.length < 60) {
          warnings.push(`${asset.ticker}: insufficient history (${candles.length} candles)`);
          return null;
        }
        return scoreAsset(asset, candles, fxGbpPerUsd, currency);
      } catch (e) {
        warnings.push(`${asset.ticker}: fetch failed (${String(e).slice(0, 60)})`);
        return null;
      }
    })
  );

  const snapshots: AssetSnapshot[] = results.filter((s): s is AssetSnapshot => s !== null);

  // Evaluate user's existing holdings first — sell decisions free up cash.
  const holdingsVerdict = holdings.map((h) => {
    const snap = snapshots.find(s => s.asset.yahoo === h.yahoo);
    if (!snap) {
      // Asset isn't in our universe anymore — treat as a manual hold.
      return {
        yahoo: h.yahoo,
        units: h.units,
        avgPriceGBP: h.avgPriceGBP,
        currentPriceGBP: h.avgPriceGBP,
        valueGBP: +(h.units * h.avgPriceGBP).toFixed(2),
        pnlGBP: 0, pnlPct: 0,
        action: 'HOLD' as const,
        reasons: ['Asset not in current universe — held at cost'],
      };
    }
    return evaluateHolding(h, snap);
  });

  const portfolioValueGBP = +holdingsVerdict.reduce((sum, v) => sum + v.valueGBP, 0).toFixed(2);
  const portfolioCostGBP = +holdingsVerdict.reduce((sum, v) => sum + v.units * v.avgPriceGBP, 0).toFixed(2);
  const portfolioPnlGBP = +(portfolioValueGBP - portfolioCostGBP).toFixed(2);
  const portfolioPnlPct = portfolioCostGBP > 0
    ? +((portfolioPnlGBP / portfolioCostGBP) * 100).toFixed(2)
    : 0;

  // Cash available for fresh buys = stated cash budget + freed-up proceeds from SELL/TRIM
  const expectedSellProceeds = holdingsVerdict.reduce(
    (sum, v) => sum + (v.proceedsGBP ?? 0),
    0,
  );
  const cashAvailableGBP = +(budgetGBP + expectedSellProceeds).toFixed(2);

  // Don't recommend re-buying something we already hold and aren't selling.
  const heldYahoos = new Set(
    holdingsVerdict
      .filter(v => v.action === 'HOLD' || v.action === 'BUY' || v.action === 'TRIM')
      .map(v => v.yahoo)
  );
  let buyCandidates = snapshots.filter(s => !heldYahoos.has(s.asset.yahoo));
  // certifiedOnly: skip stocks that only pass quantitative Sharia screens
  // but aren't currently held in a major Islamic index.
  if (certifiedOnly) {
    buyCandidates = buyCandidates.filter(s => s.asset.status === 'certified');
  }

  const buyPlan = allocateBudget(buyCandidates, cashAvailableGBP, 4);

  return {
    asOf: new Date().toISOString(),
    budgetGBP,
    cashAvailableGBP,
    fxGbpPerUsd: +fxGbpPerUsd.toFixed(4),
    snapshots: snapshots.sort((a, b) => b.score - a.score),
    buyPlan,
    holdingsVerdict,
    portfolioValueGBP,
    portfolioPnlGBP,
    portfolioPnlPct,
    warnings,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const budget = parseFloat(searchParams.get('budget') || '50');
  const certifiedOnly = searchParams.get('certifiedOnly') === '1';
  try {
    const plan = await buildPlan(isFinite(budget) ? budget : 50, [], certifiedOnly);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const budget = typeof body.budget === 'number' && isFinite(body.budget) && body.budget >= 0
      ? body.budget : 50;
    const certifiedOnly = body.certifiedOnly === true;
    const rawHoldings = Array.isArray(body.holdings) ? body.holdings : [];

    const holdings: Holding[] = rawHoldings
      .map((h: unknown): Holding | null => {
        if (!h || typeof h !== 'object') return null;
        const o = h as Record<string, unknown>;
        const yahoo = typeof o.yahoo === 'string' ? o.yahoo : null;
        const units = typeof o.units === 'number' ? o.units : NaN;
        const avgPriceGBP = typeof o.avgPriceGBP === 'number' ? o.avgPriceGBP : NaN;
        if (!yahoo || !findAsset(yahoo) || !isFinite(units) || units <= 0 || !isFinite(avgPriceGBP) || avgPriceGBP <= 0) return null;
        return { yahoo, units, avgPriceGBP };
      })
      .filter((h: Holding | null): h is Holding => h !== null);

    const plan = await buildPlan(budget, holdings, certifiedOnly);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
