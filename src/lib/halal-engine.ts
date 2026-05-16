// Halal-stock scoring + £-allocation engine.
//
// Inputs are pre-fetched daily candles for each universe asset. The engine
// computes a 0-100 conviction score that blends trend, momentum, and
// mean-reversion, then sizes positions in GBP against the user's budget
// using a fractional-share allocator (Trading 212 supports £1 minimums).
//
// Selling logic is rule-based on the user's actual cost basis: stop-loss,
// take-profit, RSI exhaustion, and trend break. The user pulls the
// trigger — we just label every position BUY / ADD / HOLD / TRIM / SELL.

import { Candle, calcRSI, calcSMA, calcEMA, calcMACD, calcATR } from './trading-engine';
import { HalalAsset, priceToGBP } from './halal-stocks';

export type Action = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'TRIM' | 'SELL' | 'AVOID';

export interface AssetSnapshot {
  asset: HalalAsset;
  priceNative: number;     // last close in native currency
  priceCurrency: string;   // actual quote currency reported by Yahoo
  priceGBP: number;        // converted to GBP
  changePct1d: number;     // % change vs previous close
  rsi: number;
  sma20: number;
  sma50: number;
  ema9: number;
  macdHist: number;
  atrPct: number;          // ATR as % of price — used to size stops
  pctFrom52wHigh: number;  // negative number, e.g. -12 means 12% below high
  momentum20d: number;     // % change over 20 trading days
  score: number;           // 0-100 conviction
  action: Action;
  reasons: string[];
}

export interface Holding {
  yahoo: string;
  units: number;       // fractional shares
  avgPriceGBP: number; // user's GBP cost basis per unit (post-FX)
}

export interface HoldingVerdict {
  yahoo: string;
  units: number;
  avgPriceGBP: number;
  currentPriceGBP: number;
  valueGBP: number;
  pnlGBP: number;
  pnlPct: number;
  action: Action;
  // unitsToSell only set when action is TRIM or SELL
  unitsToSell?: number;
  proceedsGBP?: number;
  reasons: string[];
}

export interface AllocationPick {
  yahoo: string;
  ticker: string;
  name: string;
  amountGBP: number;
  estUnits: number;
  priceGBP: number;
  score: number;
  reasons: string[];
}

export interface GamePlan {
  asOf: string;
  budgetGBP: number;
  cashAvailableGBP: number;
  fxGbpPerUsd: number;
  snapshots: AssetSnapshot[];
  buyPlan: AllocationPick[];
  holdingsVerdict: HoldingVerdict[];
  portfolioValueGBP: number;
  portfolioPnlGBP: number;
  portfolioPnlPct: number;
  warnings: string[];
}

// ----------------------- Scoring -----------------------

export function scoreAsset(
  asset: HalalAsset,
  candles: Candle[],
  gbpPerUsd: number,
  priceCurrency: string,
): AssetSnapshot {
  const closes = candles.map(c => c.close);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? last;

  const rsi = calcRSI(closes, 14);
  const sma20Arr = calcSMA(closes, 20);
  const sma50Arr = calcSMA(closes, 50);
  const sma20 = sma20Arr[sma20Arr.length - 1] ?? last;
  const sma50 = sma50Arr[sma50Arr.length - 1] ?? last;
  const ema9Arr = calcEMA(closes, 9);
  const ema9 = ema9Arr[ema9Arr.length - 1] ?? last;
  const macd = calcMACD(closes);
  const atr = calcATR(candles, 14);
  const atrPct = (atr / last) * 100;

  const high52w = Math.max(...closes.slice(-252));
  const pctFrom52wHigh = ((last - high52w) / high52w) * 100;

  const idx20 = closes.length - 21;
  const momentum20d = idx20 >= 0 ? ((last - closes[idx20]) / closes[idx20]) * 100 : 0;

  // ---- score components, each 0-25 ----
  let trendScore = 0;
  if (sma20 > sma50) trendScore += 15;             // bullish trend
  if (last > sma20) trendScore += 5;
  if (last > ema9) trendScore += 5;

  let momentumScore = 0;
  if (macd.histogram > 0) momentumScore += 10;
  if (momentum20d > 0) momentumScore += Math.min(15, momentum20d);

  let valueScore = 0;
  // mean reversion: reward being well below 52w high but only if not in freefall
  if (pctFrom52wHigh < -10 && pctFrom52wHigh > -35) valueScore += 10;
  if (pctFrom52wHigh < -5 && pctFrom52wHigh > -10) valueScore += 5;

  let rsiScore = 0;
  if (rsi < 30) rsiScore += 25;               // strong oversold
  else if (rsi < 45) rsiScore += 18;          // accumulation zone
  else if (rsi < 55) rsiScore += 12;          // neutral, fine to buy
  else if (rsi < 65) rsiScore += 6;
  else if (rsi < 75) rsiScore -= 5;           // getting hot
  else rsiScore -= 15;                        // overbought, avoid fresh buys

  // ETFs get a small stability bonus — less single-name risk in an ISA
  const etfBonus = asset.type === 'ETF' ? 5 : 0;

  let score = Math.max(0, Math.min(100, trendScore + momentumScore + valueScore + rsiScore + etfBonus));

  // ---- reasons & action ----
  const reasons: string[] = [];
  if (sma20 > sma50) reasons.push(`Uptrend — SMA20 above SMA50`);
  else reasons.push(`Downtrend — SMA20 below SMA50`);
  if (rsi < 30) reasons.push(`RSI ${rsi.toFixed(0)} — deeply oversold, classic buy zone`);
  else if (rsi > 75) reasons.push(`RSI ${rsi.toFixed(0)} — overbought, wait for a pullback`);
  else reasons.push(`RSI ${rsi.toFixed(0)} — ${rsi < 50 ? 'cooling' : 'warming'}`);
  if (pctFrom52wHigh < -15) reasons.push(`${pctFrom52wHigh.toFixed(0)}% below 52-week high — discount`);
  if (macd.histogram > 0) reasons.push(`MACD bullish (momentum building)`);
  else reasons.push(`MACD bearish (momentum fading)`);

  let action: Action;
  if (rsi > 78 && pctFrom52wHigh > -3) action = 'AVOID';
  else if (score >= 75) action = 'STRONG_BUY';
  else if (score >= 55) action = 'BUY';
  else if (score >= 35) action = 'HOLD';
  else action = 'AVOID';

  return {
    asset,
    priceNative: last,
    priceCurrency,
    priceGBP: priceToGBP(last, priceCurrency, gbpPerUsd),
    changePct1d: ((last - prev) / prev) * 100,
    rsi, sma20, sma50, ema9,
    macdHist: macd.histogram,
    atrPct,
    pctFrom52wHigh,
    momentum20d,
    score,
    action,
    reasons,
  };
}

// ----------------------- Allocation -----------------------

// Spread `budget` across the top picks. Score-weighted, but bounded so a
// single name never gets more than half the budget and every pick gets at
// least £5 (T212 supports £1 fractional but smaller is rounding noise).
export function allocateBudget(
  snapshots: AssetSnapshot[],
  budgetGBP: number,
  maxPicks = 4,
): AllocationPick[] {
  if (budgetGBP <= 0) return [];

  const eligible = snapshots
    .filter(s => s.action === 'STRONG_BUY' || s.action === 'BUY')
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPicks);

  if (eligible.length === 0) return [];

  // Tilt toward higher scores, but soften so the lowest-ranked pick still gets something.
  const weights = eligible.map(s => Math.pow(s.score, 1.25));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const maxPerPick = Math.max(budgetGBP * 0.5, budgetGBP / eligible.length);

  // First pass: weighted share, capped at maxPerPick.
  const raw = weights.map(w => Math.min((w / wSum) * budgetGBP, maxPerPick));
  // Redistribute any leftover from capping back to the others, proportionally.
  let allocated = raw.reduce((a, b) => a + b, 0);
  let leftover = budgetGBP - allocated;
  if (leftover > 0.01) {
    for (let i = 0; i < raw.length && leftover > 0.01; i++) {
      const room = maxPerPick - raw[i];
      if (room > 0) {
        const add = Math.min(room, leftover);
        raw[i] += add;
        leftover -= add;
      }
    }
  }

  // Round to pennies; absorb rounding drift into the top pick.
  const rounded = raw.map(r => Math.round(r * 100) / 100);
  const diff = +(budgetGBP - rounded.reduce((a, b) => a + b, 0)).toFixed(2);
  if (rounded.length > 0) rounded[0] = +(rounded[0] + diff).toFixed(2);

  return eligible.map((s, i) => ({
    yahoo: s.asset.yahoo,
    ticker: s.asset.ticker,
    name: s.asset.name,
    amountGBP: rounded[i],
    estUnits: +(rounded[i] / s.priceGBP).toFixed(4),
    priceGBP: s.priceGBP,
    score: s.score,
    reasons: s.reasons.slice(0, 3),
  }));
}

// ----------------------- Holdings evaluation -----------------------

// Risk tuning. Tight enough for a £50 starter, generous enough to survive
// normal market noise (ATR-based stops would be smarter, but for a beginner
// fixed percentages are easier to reason about).
const STOP_LOSS_PCT = -8;
const TAKE_PROFIT_FULL = 25;
const TAKE_PROFIT_TRIM = 15;
const RSI_TRIM = 75;
const RSI_SELL = 82;

export function evaluateHolding(h: Holding, snap: AssetSnapshot): HoldingVerdict {
  const currentPriceGBP = snap.priceGBP;
  const valueGBP = h.units * currentPriceGBP;
  const costGBP = h.units * h.avgPriceGBP;
  const pnlGBP = valueGBP - costGBP;
  const pnlPct = h.avgPriceGBP > 0 ? ((currentPriceGBP - h.avgPriceGBP) / h.avgPriceGBP) * 100 : 0;

  const reasons: string[] = [];
  let action: Action = 'HOLD';
  let unitsToSell: number | undefined;

  if (pnlPct <= STOP_LOSS_PCT) {
    action = 'SELL';
    unitsToSell = h.units;
    reasons.push(`Stop-loss hit (${pnlPct.toFixed(1)}%) — exit to protect capital`);
  } else if (pnlPct >= TAKE_PROFIT_FULL) {
    action = 'SELL';
    unitsToSell = h.units;
    reasons.push(`Take-profit hit (+${pnlPct.toFixed(1)}%) — bank the gain`);
  } else if (snap.rsi >= RSI_SELL) {
    action = 'SELL';
    unitsToSell = h.units;
    reasons.push(`RSI ${snap.rsi.toFixed(0)} — extreme overbought, mean reversion likely`);
  } else if (pnlPct >= TAKE_PROFIT_TRIM || snap.rsi >= RSI_TRIM) {
    action = 'TRIM';
    unitsToSell = +(h.units * 0.5).toFixed(4);
    reasons.push(pnlPct >= TAKE_PROFIT_TRIM
      ? `+${pnlPct.toFixed(1)}% — trim half, let the rest ride`
      : `RSI ${snap.rsi.toFixed(0)} — trim half into strength`);
  } else if (snap.sma20 < snap.sma50 && snap.priceGBP < snap.sma20) {
    action = 'SELL';
    unitsToSell = h.units;
    reasons.push(`Trend broken — price below SMA20 with bearish crossover`);
  } else if (snap.action === 'STRONG_BUY' && pnlPct > -3) {
    action = 'BUY'; // re-rated as ADD opportunity
    reasons.push(`Setup re-rated to Strong Buy — consider adding`);
  } else {
    reasons.push(`On track (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%) — keep holding`);
  }

  return {
    yahoo: h.yahoo,
    units: h.units,
    avgPriceGBP: h.avgPriceGBP,
    currentPriceGBP,
    valueGBP: +valueGBP.toFixed(2),
    pnlGBP: +pnlGBP.toFixed(2),
    pnlPct: +pnlPct.toFixed(2),
    action,
    unitsToSell,
    proceedsGBP: unitsToSell !== undefined ? +(unitsToSell * currentPriceGBP).toFixed(2) : undefined,
    reasons,
  };
}
