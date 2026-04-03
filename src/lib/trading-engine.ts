// Core Trading Engine — Technical Indicators, Signal Generation, Market Analysis

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Signal {
  symbol: string;
  direction: 'BUY' | 'SELL';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  strategy: string;
  timeframe: string;
  indicators: Record<string, number | string>;
  reason: string;
}

export interface IndicatorValues {
  rsi?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHistogram?: number;
  bollingerUpper?: number;
  bollingerMiddle?: number;
  bollingerLower?: number;
  ema9?: number;
  ema21?: number;
  ema50?: number;
  ema200?: number;
  atr?: number;
  adx?: number;
  stochasticK?: number;
  stochasticD?: number;
  volumeSMA?: number;
}

// ==================== TECHNICAL INDICATORS ====================

export function calcSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

export function calcEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let ema = data[0];
  result.push(ema);
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  const gains: number[] = [];
  const losses: number[] = [];
  for (const change of changes) {
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9): { line: number; signal: number; histogram: number } {
  if (closes.length < slow + signal) return { line: 0, signal: 0, histogram: 0 };
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine: number[] = [];
  const startIdx = slow - 1;
  for (let i = startIdx; i < closes.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }
  const signalLine = calcEMA(macdLine, signal);
  const line = macdLine[macdLine.length - 1];
  const sig = signalLine[signalLine.length - 1];
  return { line, signal: sig, histogram: line - sig };
}

export function calcBollingerBands(closes: number[], period = 20, stdDev = 2): { upper: number; middle: number; lower: number } {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: middle + stdDev * std, middle, lower: middle - stdDev * std };
}

export function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

export function calcStochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: number; d: number } {
  if (candles.length < kPeriod) return { k: 50, d: 50 };
  const recent = candles.slice(-kPeriod);
  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  const close = recent[recent.length - 1].close;
  const k = high === low ? 50 : ((close - low) / (high - low)) * 100;
  return { k, d: k }; // Simplified — real D would need more data
}

export function calcADX(candles: Candle[], period = 14): number {
  if (candles.length < period * 2) return 25;
  let plusDMs: number[] = [];
  let minusDMs: number[] = [];
  let trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  const smoothTR = trs.slice(-period).reduce((a, b) => a + b, 0);
  const smoothPlusDM = plusDMs.slice(-period).reduce((a, b) => a + b, 0);
  const smoothMinusDM = minusDMs.slice(-period).reduce((a, b) => a + b, 0);
  const plusDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
  const minusDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
  const diSum = plusDI + minusDI;
  const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
  return dx;
}

export function getAllIndicators(candles: Candle[]): IndicatorValues {
  const closes = candles.map(c => c.close);
  const macd = calcMACD(closes);
  const bb = calcBollingerBands(closes);
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const stoch = calcStochastic(candles);
  const volumes = candles.map(c => c.volume || 0);
  return {
    rsi: calcRSI(closes),
    macdLine: macd.line,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    bollingerUpper: bb.upper,
    bollingerMiddle: bb.middle,
    bollingerLower: bb.lower,
    ema9: ema9[ema9.length - 1],
    ema21: ema21[ema21.length - 1],
    ema50: ema50.length > 0 ? ema50[ema50.length - 1] : undefined,
    ema200: ema200.length > 0 ? ema200[ema200.length - 1] : undefined,
    atr: calcATR(candles),
    adx: calcADX(candles),
    stochasticK: stoch.k,
    stochasticD: stoch.d,
    volumeSMA: volumes.length >= 20 ? calcSMA(volumes, 20).pop() : undefined,
  };
}

// ==================== SIGNAL GENERATION ====================

export interface SignalResult {
  signal: Signal | null;
  reasons: string[];
}

function generateRSISignal(symbol: string, indicators: IndicatorValues, price: number, atr: number, timeframe: string): SignalResult {
  const reasons: string[] = [];
  let direction: 'BUY' | 'SELL' | null = null;
  let confidence = 0;

  const rsi = indicators.rsi;
  if (rsi === undefined) return { signal: null, reasons: ['RSI unavailable'] };

  if (rsi < 30) {
    direction = 'BUY';
    confidence = Math.min(90, 50 + (30 - rsi) * 1.5);
    reasons.push(`RSI oversold at ${rsi.toFixed(1)}`);
  } else if (rsi > 70) {
    direction = 'SELL';
    confidence = Math.min(90, 50 + (rsi - 70) * 1.5);
    reasons.push(`RSI overbought at ${rsi.toFixed(1)}`);
  } else if (rsi < 40 && indicators.macdHistogram && indicators.macdHistogram > 0) {
    direction = 'BUY';
    confidence = 40;
    reasons.push(`RSI approaching oversold (${rsi.toFixed(1)}) with MACD bullish`);
  } else if (rsi > 60 && indicators.macdHistogram && indicators.macdHistogram < 0) {
    direction = 'SELL';
    confidence = 40;
    reasons.push(`RSI approaching overbought (${rsi.toFixed(1)}) with MACD bearish`);
  }

  if (!direction) return { signal: null, reasons: ['No RSI signal'] };

  const sl = direction === 'BUY'
    ? Math.round((price - atr * 1.5) * 100000) / 100000
    : Math.round((price + atr * 1.5) * 100000) / 100000;
  const tp = direction === 'BUY'
    ? Math.round((price + atr * 2.5) * 100000) / 100000
    : Math.round((price - atr * 2.5) * 100000) / 100000;

  return {
    signal: {
      symbol, direction, confidence: Math.round(confidence),
      entryPrice: price, stopLoss: sl, takeProfit: tp,
      strategy: 'RSI', timeframe, indicators: { rsi, atr },
      reason: reasons.join('. '),
    },
    reasons,
  };
}

function generateMACDSignal(symbol: string, indicators: IndicatorValues, price: number, atr: number, timeframe: string): SignalResult {
  const reasons: string[] = [];
  let direction: 'BUY' | 'SELL' | null = null;
  let confidence = 0;

  const { macdLine, macdSignal, macdHistogram } = indicators;
  if (macdLine === undefined || macdSignal === undefined || macdHistogram === undefined) {
    return { signal: null, reasons: ['MACD unavailable'] };
  }

  if (macdHistogram > 0 && macdLine < macdSignal) {
    direction = 'BUY';
    confidence = 55;
    reasons.push('MACD bullish crossover detected');
  } else if (macdHistogram < 0 && macdLine > macdSignal) {
    direction = 'SELL';
    confidence = 55;
    reasons.push('MACD bearish crossover detected');
  } else if (macdHistogram > 0 && macdLine > 0 && macdSignal < 0) {
    direction = 'BUY';
    confidence = 70;
    reasons.push('MACD strong bullish — both lines above zero');
  } else if (macdHistogram < 0 && macdLine < 0 && macdSignal > 0) {
    direction = 'SELL';
    confidence = 70;
    reasons.push('MACD strong bearish — both lines below zero');
  }

  if (!direction) return { signal: null, reasons: ['No MACD signal'] };

  // Boost confidence with RSI confirmation
  if (indicators.rsi !== undefined) {
    if (direction === 'BUY' && indicators.rsi < 50) {
      confidence += 10;
      reasons.push(`RSI confirms (${indicators.rsi.toFixed(1)} < 50)`);
    } else if (direction === 'SELL' && indicators.rsi > 50) {
      confidence += 10;
      reasons.push(`RSI confirms (${indicators.rsi.toFixed(1)} > 50)`);
    }
  }

  const sl = direction === 'BUY'
    ? Math.round((price - atr * 1.5) * 100000) / 100000
    : Math.round((price + atr * 1.5) * 100000) / 100000;
  const tp = direction === 'BUY'
    ? Math.round((price + atr * 3) * 100000) / 100000
    : Math.round((price - atr * 3) * 100000) / 100000;

  return {
    signal: {
      symbol, direction, confidence: Math.min(90, Math.round(confidence)),
      entryPrice: price, stopLoss: sl, takeProfit: tp,
      strategy: 'MACD', timeframe,
      indicators: { macdLine, macdSignal, macdHistogram },
      reason: reasons.join('. '),
    },
    reasons,
  };
}

function generateBollingerSignal(symbol: string, indicators: IndicatorValues, price: number, atr: number, timeframe: string): SignalResult {
  const reasons: string[] = [];
  let direction: 'BUY' | 'SELL' | null = null;
  let confidence = 0;

  const { bollingerUpper, bollingerMiddle, bollingerLower } = indicators;
  if (!bollingerUpper || !bollingerMiddle || !bollingerLower) {
    return { signal: null, reasons: ['Bollinger unavailable'] };
  }

  if (price <= bollingerLower) {
    direction = 'BUY';
    confidence = 60;
    reasons.push(`Price touching lower Bollinger band (${bollingerLower.toFixed(5)})`);
  } else if (price >= bollingerUpper) {
    direction = 'SELL';
    confidence = 60;
    reasons.push(`Price touching upper Bollinger band (${bollingerUpper.toFixed(5)})`);
  } else if (price < bollingerMiddle && indicators.rsi && indicators.rsi < 35) {
    direction = 'BUY';
    confidence = 50;
    reasons.push(`Price below Bollinger mid + RSI confirmation`);
  } else if (price > bollingerMiddle && indicators.rsi && indicators.rsi > 65) {
    direction = 'SELL';
    confidence = 50;
    reasons.push(`Price above Bollinger mid + RSI confirmation`);
  }

  if (!direction) return { signal: null, reasons: ['No Bollinger signal'] };

  const sl = direction === 'BUY'
    ? Math.round((bollingerLower - atr * 0.5) * 100000) / 100000
    : Math.round((bollingerUpper + atr * 0.5) * 100000) / 100000;
  const tp = direction === 'BUY'
    ? Math.round((bollingerMiddle + (bollingerUpper - bollingerMiddle) * 0.5) * 100000) / 100000
    : Math.round((bollingerMiddle - (bollingerMiddle - bollingerLower) * 0.5) * 100000) / 100000;

  return {
    signal: {
      symbol, direction, confidence: Math.round(confidence),
      entryPrice: price, stopLoss: sl, takeProfit: tp,
      strategy: 'Bollinger', timeframe,
      indicators: { bollingerUpper, bollingerMiddle, bollingerLower },
      reason: reasons.join('. '),
    },
    reasons,
  };
}

function generateTrendSignal(symbol: string, indicators: IndicatorValues, price: number, atr: number, timeframe: string): SignalResult {
  const reasons: string[] = [];
  let direction: 'BUY' | 'SELL' | null = null;
  let confidence = 0;

  const { ema9, ema21, ema50, ema200, adx } = indicators;
  if (!ema9 || !ema21) return { signal: null, reasons: ['EMA unavailable'] };

  // Trend strength from ADX
  const isStrongTrend = adx !== undefined && adx > 25;
  const trendMultiplier = isStrongTrend ? 1.2 : 0.8;

  if (ema9 > ema21) {
    if (ema50 && ema9 > ema50) {
      direction = 'BUY';
      confidence = 65;
      reasons.push('Strong uptrend: EMA9 > EMA21 > EMA50');
      if (ema200 && ema50 > ema200) {
        confidence = 80;
        reasons.push('All EMAs aligned bullish (9>21>50>200)');
      }
    } else {
      direction = 'BUY';
      confidence = 45;
      reasons.push('Short-term uptrend: EMA9 > EMA21');
    }
  } else {
    if (ema50 && ema9 < ema50) {
      direction = 'SELL';
      confidence = 65;
      reasons.push('Strong downtrend: EMA9 < EMA21 < EMA50');
      if (ema200 && ema50 < ema200) {
        confidence = 80;
        reasons.push('All EMAs aligned bearish (9<21<50<200)');
      }
    } else {
      direction = 'SELL';
      confidence = 45;
      reasons.push('Short-term downtrend: EMA9 < EMA21');
    }
  }

  if (!direction) return { signal: null, reasons: [] };

  confidence *= trendMultiplier;

  const sl = direction === 'BUY'
    ? Math.round((price - atr * 2) * 100000) / 100000
    : Math.round((price + atr * 2) * 100000) / 100000;
  const tp = direction === 'BUY'
    ? Math.round((price + atr * 3) * 100000) / 100000
    : Math.round((price - atr * 3) * 100000) / 100000;

  return {
    signal: {
      symbol, direction, confidence: Math.min(90, Math.round(confidence)),
      entryPrice: price, stopLoss: sl, takeProfit: tp,
      strategy: 'Trend', timeframe,
      indicators: { ema9, ema21, ema50, ema200, adx },
      reason: reasons.join('. '),
    },
    reasons,
  };
}

export function analyzeSymbol(symbol: string, candles: Candle[], timeframe: string): SignalResult[] {
  if (candles.length < 30) return [{ signal: null, reasons: ['Insufficient data'] }];
  const indicators = getAllIndicators(candles);
  const price = candles[candles.length - 1].close;
  const atr = indicators.atr || price * 0.005;

  const strategies = [
    () => generateRSISignal(symbol, indicators, price, atr, timeframe),
    () => generateMACDSignal(symbol, indicators, price, atr, timeframe),
    () => generateBollingerSignal(symbol, indicators, price, atr, timeframe),
    () => generateTrendSignal(symbol, indicators, price, atr, timeframe),
  ];

  return strategies.map(fn => fn());
}

export function combineSignals(results: SignalResult[]): Signal | null {
  const validSignals = results.filter(r => r.signal !== null);
  if (validSignals.length === 0) return null;

  const buys = validSignals.filter(r => r.signal!.direction === 'BUY');
  const sells = validSignals.filter(r => r.signal!.direction === 'SELL');

  if (buys.length === 0 && sells.length === 0) return null;

  const dominant = buys.length >= sells.length ? 'BUY' : 'SELL';
  const group = dominant === 'BUY' ? buys : sells;
  const avgConfidence = group.reduce((a, r) => a + r.signal!.confidence, 0) / group.length;
  const weight = group.length / validSignals.length;

  const finalConfidence = avgConfidence * (0.5 + weight * 0.5);
  if (finalConfidence < 40) return null; // Need minimum confidence

  const bestSignal = group.reduce((a, r) => r.signal!.confidence > a.signal!.confidence ? r : a, group[0]);
  const sig = bestSignal.signal!;
  const allReasons = group.map(r => r.signal!.reason).filter(Boolean);

  return {
    ...sig,
    direction: dominant,
    confidence: Math.min(95, Math.round(finalConfidence)),
    strategy: `Multi(${group.map(r => r.signal!.strategy).join('+')})`,
    reason: allReasons.join(' | '),
  };
}

// ==================== POSITION SIZING ====================

export function calcPositionSize(
  balance: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number,
  lotStep = 0.01
): number {
  const riskAmount = balance * (riskPercent / 100);
  const slDistance = Math.abs(entryPrice - stopLoss);
  if (slDistance === 0) return lotStep;
  const pipValue = slDistance * 10000;
  if (pipValue === 0) return lotStep;
  const lots = riskAmount / (pipValue * 10);
  return Math.max(lotStep, Math.floor(lots / lotStep) * lotStep);
}

export function calcRiskReward(entry: number, stopLoss: number, takeProfit: number): number {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  return risk === 0 ? 0 : Math.round((reward / risk) * 100) / 100;
}

// ==================== YAHOO FINANCE HELPERS ====================

export function yahooSymbol(symbol: string): string {
  const map: Record<string, string> = {
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X',
    'USD/JPY': 'USDJPY=X',
    'AUD/USD': 'AUDUSD=X',
    'USD/CHF': 'USDCHF=X',
    'USD/CAD': 'USDCAD=X',
    'NZD/USD': 'NZDUSD=X',
    'XAU/USD': 'GC=F',
    'BTC/USD': 'BTC-USD',
    'ETH/USD': 'ETH-USD',
    'S&P500': 'ES=F',
    'NAS100': 'NQ=F',
  };
  return map[symbol] || symbol;
}

export function displaySymbol(yahooSym: string): string {
  const map: Record<string, string> = {
    'EURUSD=X': 'EUR/USD',
    'GBPUSD=X': 'GBP/USD',
    'USDJPY=X': 'USD/JPY',
    'AUDUSD=X': 'AUD/USD',
    'USDCHF=X': 'USD/CHF',
    'USDCAD=X': 'USD/CAD',
    'NZDUSD=X': 'NZD/USD',
    'GC=F': 'XAU/USD',
    'BTC-USD': 'BTC/USD',
    'ETH-USD': 'ETH/USD',
    'ES=F': 'S&P500',
    'NQ=F': 'NAS100',
  };
  return map[yahooSym] || yahooSym;
}

export const DEFAULT_SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'BTC/USD'];
export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
export const TIMEFRAME_CANDLE_LIMITS: Record<string, number> = {
  '5m': 200,
  '15m': 200,
  '1h': 200,
  '4h': 200,
  '1d': 365,
};
export const TIMEFRAME_YAHOO: Record<string, string> = {
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '1h', // Yahoo doesn't have 4h, use 1h
  '1d': '1d',
};
