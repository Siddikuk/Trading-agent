// AI Trading Agent — LLM-powered decision engine
// This replaces mechanical EA rules with AI reasoning that considers
// technical indicators, news sentiment, and market context.
//
// Architecture:
//   Market Data (Yahoo) → Technical Indicators (calc)
//                     → News/Sentiment (Web Search)
//                     → Price Action Summary
//                     → LLM Reasoning Engine (z-ai-web-dev-sdk)
//                     → Risk Check → Trade Decision

import ZAI from 'z-ai-web-dev-sdk';
import { fetchCandles } from './market-data';
import { getAllIndicators, yahooSymbol, calcPositionSize, calcRiskReward } from './trading-engine';
import type { Candle, IndicatorValues } from './trading-engine';

// ==================== TYPES ====================

export interface AIDecision {
  symbol: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;       // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  reasoning: string;        // AI's full analysis
  sentimentScore: number;   // -100 to 100 (bearish to bullish)
  riskRewardRatio: number;
  shouldTrade: boolean;     // Final yes/no after risk checks
  skipReason?: string;      // Why the AI decided to skip
  newsUsed: number;         // How many news articles were fed to the AI
  analyzedAt: string;       // ISO timestamp
}

interface NewsContext {
  title: string;
  snippet: string;
  source: string;
  date: string;
}

// ==================== NEWS FETCHING ====================
// Multi-source: symbol-specific + macro environment + central bank sentiment

const NEWS_CACHE = new Map<string, { data: NewsContext[]; ts: number }>();
const NEWS_CACHE_TTL = 300000; // 5 minutes

async function fetchNewsFromWeb(zai: Awaited<ReturnType<typeof ZAI.create>>, query: string, num = 5): Promise<NewsContext[]> {
  try {
    const results = await zai.functions.invoke('web_search', {
      query,
      num,
      recency_days: 1,
    });
    return (results || []).slice(0, num).map((r) => ({
      title: String(r.name || ''),
      snippet: String(r.snippet || ''),
      source: String(r.host_name || ''),
      date: String(r.date || ''),
    }));
  } catch (error) {
    console.error('[AI Agent] News fetch failed for query:', query, error);
    return [];
  }
}

async function fetchAllNews(symbol: string): Promise<NewsContext[]> {
  // Check cache
  const cacheKey = `news_${symbol}_${Math.floor(Date.now() / NEWS_CACHE_TTL)}`;
  const cached = NEWS_CACHE.get(cacheKey);
  if (cached) return cached.data;

  let allNews: NewsContext[] = [];

  try {
    const zai = await ZAI.create();

    // Fetch symbol-specific news and macro news in parallel
    const isCrypto = symbol.includes('BTC') || symbol.includes('ETH');
    const isGold = symbol.includes('XAU');
    const isJPY = symbol.includes('JPY');

    const queries: string[] = [
      `${symbol} analysis forecast today`,                   // Symbol specific
      `forex market news today ${new Date().toISOString().slice(0, 10)}`, // General forex
    ];

    // Add macro context queries based on the pair
    if (isJPY) queries.push('Bank of Japan yen policy news');
    if (isCrypto) queries.push('cryptocurrency bitcoin price news');
    if (isGold) queries.push('gold price XAUUSD news today');
    if (symbol.includes('EUR')) queries.push('ECB euro interest rate news');
    if (symbol.includes('GBP')) queries.push('Bank of England pound sterling news');
    if (symbol.includes('USD') && !isCrypto && !isGold) queries.push('Federal Reserve US dollar interest rate news');

    // Fetch first 2 queries in parallel (most important)
    const [symbolNews, marketNews] = await Promise.allSettled([
      fetchNewsFromWeb(zai, queries[0], 4),
      fetchNewsFromWeb(zai, queries[1], 3),
    ]);

    if (symbolNews.status === 'fulfilled') allNews = [...symbolNews.value];
    if (marketNews.status === 'fulfilled') allNews = [...allNews, ...marketNews.value];

    // Fetch macro query if available (lower priority)
    if (queries.length > 2) {
      const macroResult = await fetchNewsFromWeb(zai, queries[2], 3);
      allNews = [...allNews, ...macroResult];
    }

    // Deduplicate by title (similar titles from different sources)
    const seen = new Set<string>();
    allNews = allNews.filter(n => {
      const key = n.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return n.title.length > 10; // Skip empty/weak titles
    });
  } catch (error) {
    console.error('[AI Agent] News aggregation failed:', error);
  }

  // Cache result
  NEWS_CACHE.set(cacheKey, { data: allNews, ts: Date.now() });

  return allNews.slice(0, 8); // Cap at 8 articles max
}

// ==================== PRICE ACTION ANALYSIS ====================

function analyzePriceAction(candles: Candle[]): string {
  if (candles.length < 10) return '';

  const last = candles.slice(-10);
  const closes = last.map(c => c.close);
  const highs = last.map(c => c.high);
  const lows = last.map(c => c.low);

  // Recent trend
  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const change = ((lastClose - firstClose) / firstClose) * 100;
  const trend = change > 0.3 ? 'BULLISH' : change < -0.3 ? 'BEARISH' : 'SIDEWAYS';

  // Recent high/low
  const periodHigh = Math.max(...highs);
  const periodLow = Math.min(...lows);
  const range = periodHigh - periodLow;

  // Candlestick patterns in last 5 candles
  const recent = last.slice(-5);
  const patterns: string[] = [];
  for (let i = 1; i < recent.length; i++) {
    const c = recent[i];
    const p = recent[i - 1];
    const body = Math.abs(c.close - c.open);
    const totalRange = c.high - c.low;
    if (totalRange === 0) continue;

    const bodyRatio = body / totalRange;

    // Doji
    if (bodyRatio < 0.1) patterns.push('Doji (indecision)');
    // Hammer/Shooting Star
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    if (lowerWick > body * 2 && upperWick < body * 0.5) patterns.push('Hammer (bullish reversal)');
    if (upperWick > body * 2 && lowerWick < body * 0.5) patterns.push('Shooting Star (bearish reversal)');
    // Engulfing
    if (i >= 1) {
      const prevBody = Math.abs(p.close - p.open);
      if (body > prevBody * 1.5) {
        if (p.close < p.open && c.close > c.open) patterns.push('Bullish Engulfing');
        if (p.close > p.open && c.close < c.open) patterns.push('Bearish Engulfing');
      }
    }
  }

  // Momentum (simple acceleration)
  const momentum = closes[closes.length - 1] - closes[closes.length - 4];
  const momentumPct = (momentum / closes[closes.length - 4]) * 100;

  return `Recent Trend: ${trend} (${change > 0 ? '+' : ''}${change.toFixed(3)}% over 10 periods)
10-period Range: ${periodLow.toFixed(5)} — ${periodHigh.toFixed(5)} (range: ${range.toFixed(5)})
Momentum (last 4 candles): ${momentumPct > 0 ? '+' : ''}${momentumPct.toFixed(3)}%
Candlestick Patterns: ${patterns.length > 0 ? patterns.join(', ') : 'No significant patterns detected'}
Current Position in Range: ${((lastClose - periodLow) / range * 100).toFixed(0)}% (${((lastClose - periodLow) / range * 100) > 70 ? 'near HIGH resistance' : ((lastClose - periodLow) / range * 100) < 30 ? 'near LOW support' : 'mid-range'})`;
}

// ==================== LLM AGENT BRAIN ====================

const TRADING_SYSTEM_PROMPT = `You are an elite forex/commodities/crypto trading analyst. You combine technical analysis, fundamental analysis, price action reading, and news sentiment to make trading decisions.

## ANALYSIS FRAMEWORK (think through each step):

### 1. TREND ANALYSIS
- What is the current trend on this timeframe? (EMA alignment: 9 vs 21 vs 50 vs 200)
- Is ADX confirming a strong trend (>25) or is the market ranging?
- Where is price in the Bollinger Bands? (near upper = overbought zone, near lower = oversold zone)

### 2. MOMENTUM & OSCILLATORS
- RSI: Is it overbought (>70), oversold (<30), or neutral? Divergences?
- MACD: Is there a crossover? What is the histogram telling us about momentum?
- Stochastic: Is it in the overbought/oversold zone?

### 3. PRICE ACTION
- What patterns formed in recent candles? (Doji, Engulfing, Hammer, etc.)
- Where is price within the recent range? (near support, resistance, or mid-range?)
- Is there momentum acceleration or deceleration?

### 4. NEWS & FUNDAMENTALS
- What is the overall news sentiment for this pair? (bullish/bearish/neutral)
- Are there any major economic events or central bank announcements?
- Does the news support or contradict the technical picture?

### 5. SYNTHESIS & DECISION
- Do technical and fundamental factors ALIGN or CONFLICT?
- What is the risk/reward based on ATR-based stops?
- Should we TRADE or WAIT for clearer signals?

## CRITICAL RULES:
1. Respond with valid JSON only — no markdown fences, no extra text, no commentary outside JSON.
2. Never recommend a trade with confidence below 50%. If unsure, HOLD.
3. If news sentiment strongly contradicts technicals, favor the news (fundamentals > technicals in the short term).
4. When multiple timeframes show conflicting trends, be cautious — lower confidence.
5. Always use ATR for stop-loss placement. Risk 1.5-2x ATR, Reward 2-3x ATR (minimum 1.5:1 R:R).
6. CAPITAL PRESERVATION > catching every move. When in doubt, HOLD.

## RESPONSE FORMAT (strict JSON):
{
  "direction": "BUY" | "SELL" | "HOLD",
  "confidence": 50-95,
  "entryPrice": <current price as number>,
  "stopLoss": <number, based on ATR>,
  "takeProfit": <number, minimum 1.5:1 risk/reward>,
  "sentimentScore": <-100 to 100, negative=bearish, positive=bullish>,
  "reasoning": "<Your detailed analysis: go through each framework step above, explain what you see, and conclude with your decision. 2-4 sentences minimum.>",
  "skipReason": "<If HOLD, explain why concisely. null if trading.>"
}`;

function buildAnalysisPrompt(
  symbol: string,
  price: number,
  indicators: IndicatorValues,
  candles: Candle[],
  news: NewsContext[],
  balance: number,
  riskPercent: number,
): string {
  const atr = indicators.atr || price * 0.005;
  const priceAction = analyzePriceAction(candles);

  // Build indicators summary with annotations
  const rsiVal = indicators.rsi;
  const rsiNote = rsiVal !== undefined
    ? (rsiVal < 30 ? ' ⚠️ OVERSOLD' : rsiVal > 70 ? ' ⚠️ OVERBOUGHT' : rsiVal < 40 ? ' (leaning oversold)' : rsiVal > 60 ? ' (leaning overbought)' : ' (neutral)')
    : ' (unavailable)';

  const macdHist = indicators.macdHistogram;
  const macdNote = macdHist !== undefined
    ? (macdHist > 0 ? ' ✓ Bullish momentum' : ' ✗ Bearish momentum')
    : '';

  const adxVal = indicators.adx;
  const adxNote = adxVal !== undefined
    ? (adxVal > 50 ? ' 🔥 Very strong trend' : adxVal > 25 ? ' ✓ Strong trend' : ' ⚠ Weak/no trend — be cautious with trend signals')
    : '';

  // EMA alignment analysis
  const emas = [indicators.ema9, indicators.ema21, indicators.ema50, indicators.ema200].filter((v): v is number => v !== undefined);
  const emaBullish = emas.length >= 2 && emas.every((v, i) => i === 0 || v <= emas[i - 1]) === false;
  const emaBearish = emas.length >= 2 && emas.every((v, i) => i === 0 || v >= emas[i - 1]) === false;
  let emaSummary = '';
  if (emas.length >= 3) {
    const sorted = [...emas].sort((a, b) => b - a);
    const isAligned = JSON.stringify(emas) === JSON.stringify(sorted) || JSON.stringify(emas) === JSON.stringify([...sorted].reverse());
    emaSummary = isAligned
      ? (emas[0] > emas[emas.length - 1] ? ' 📈 All EMAs aligned BULLISH (short > long)' : ' 📉 All EMAs aligned BEARISH (short < long)')
      : ' ⚠️ EMAs are MIXED — no clear trend alignment';
  }

  return `## ANALYSIS REQUEST: ${symbol}
Timestamp: ${new Date().toISOString()}

### CURRENT PRICE
${price.toFixed(5)}

### TECHNICAL INDICATORS

**Oscillators:**
- RSI(14): ${indicators.rsi?.toFixed(1) || 'N/A'}${rsiNote}
- Stochastic K: ${indicators.stochasticK?.toFixed(1) || 'N/A'}
- Stochastic D: ${indicators.stochasticD?.toFixed(1) || 'N/A'}

**Trend:**
- EMA 9: ${indicators.ema9?.toFixed(5) || 'N/A'}
- EMA 21: ${indicators.ema21?.toFixed(5) || 'N/A'}
- EMA 50: ${indicators.ema50?.toFixed(5) || 'N/A'}
- EMA 200: ${indicators.ema200?.toFixed(5) || 'N/A'}
${emaSummary}

**Momentum:**
- MACD Line: ${indicators.macdLine?.toFixed(5) || 'N/A'}
- MACD Signal: ${indicators.macdSignal?.toFixed(5) || 'N/A'}
- MACD Histogram: ${indicators.macdHistogram?.toFixed(5) || 'N/A'}${macdNote}

**Volatility:**
- ATR(14): ${atr.toFixed(5)} (average pip range)
- ADX: ${indicators.adx?.toFixed(1) || 'N/A'}${adxNote}

**Bollinger Bands:**
- Upper: ${indicators.bollingerUpper?.toFixed(5) || 'N/A'}
- Middle (SMA20): ${indicators.bollingerMiddle?.toFixed(5) || 'N/A'}
- Lower: ${indicators.bollingerLower?.toFixed(5) || 'N/A'}
- Price position: ${indicators.bollingerUpper && indicators.bollingerLower ? (((price - indicators.bollingerLower) / (indicators.bollingerUpper - indicators.bollingerLower)) * 100).toFixed(0) + '% within bands' : 'N/A'}

### PRICE ACTION (last 10 candles)
${priceAction || 'Insufficient data for price action analysis.'}

### NEWS & FUNDAMENTAL CONTEXT (${news.length} articles)
${news.length > 0
    ? news.map((n, i) => `${i + 1}. **[${n.source}]** ${n.title}\n   > ${n.snippet}`).join('\n\n')
    : '⚠️ No recent news available — proceed with technical analysis only.'}

### RISK PARAMETERS
- Account Balance: $${balance.toFixed(2)}
- Max Risk Per Trade: ${riskPercent}% ($${(balance * riskPercent / 100).toFixed(2)})
- ATR-based SL suggestion: ${atr.toFixed(5)} (1.5x ATR = ${(atr * 1.5).toFixed(5)})
- ATR-based TP suggestion: ${(atr * 2.5).toFixed(5)} (2.5x ATR)
- Minimum required R:R: 1.5:1

Analyze ${symbol} using the framework above. Respond with JSON only.`;
}

async function queryAI(
  symbol: string,
  price: number,
  indicators: IndicatorValues,
  candles: Candle[],
  news: NewsContext[],
  balance: number,
  riskPercent: number,
): Promise<AIDecision> {
  const atr = indicators.atr || price * 0.005;
  const userPrompt = buildAnalysisPrompt(symbol, price, indicators, candles, news, balance, riskPercent);

  try {
    const zai = await ZAI.create();

    // LLM call with timeout protection
    const completionPromise = zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: TRADING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout after 60s')), 60000)
    );

    const completion = await Promise.race([completionPromise, timeoutPromise]);
    const raw = completion.choices[0]?.message?.content || '';

    // Parse JSON — handle markdown code blocks and raw JSON
    let jsonStr = raw;
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI Agent] No JSON in response:', raw.slice(0, 300));
      return fallbackDecision(symbol, price, atr, 'Failed to parse AI response — no JSON found');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate direction
    const direction = ['BUY', 'SELL', 'HOLD'].includes(parsed.direction)
      ? parsed.direction as 'BUY' | 'SELL' | 'HOLD'
      : 'HOLD';

    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
    const sentimentScore = Math.max(-100, Math.min(100, Number(parsed.sentimentScore) || 0));

    // Calculate SL/TP — use AI values if reasonable, otherwise ATR-based defaults
    const defaultSL = direction === 'BUY'
      ? Math.round((price - atr * 1.5) * 100000) / 100000
      : Math.round((price + atr * 1.5) * 100000) / 100000;
    const defaultTP = direction === 'BUY'
      ? Math.round((price + atr * 2.5) * 100000) / 100000
      : Math.round((price - atr * 2.5) * 100000) / 100000;

    const validateSL = (v: number) => v > 0 && Math.abs(v - price) > 0 && Math.abs(v - price) < atr * 5;
    const validateTP = (v: number) => v > 0 && Math.abs(v - price) > 0 && Math.abs(v - price) < atr * 10;

    const aiSL = Number(parsed.stopLoss);
    const aiTP = Number(parsed.takeProfit);
    const finalSL = validateSL(aiSL) ? aiSL : defaultSL;
    const finalTP = validateTP(aiTP) ? aiTP : defaultTP;

    // Validate risk/reward ratio
    const riskReward = calcRiskReward(price, finalSL, finalTP);
    const lotSize = calcPositionSize(balance, riskPercent, price, finalSL);

    // Final decision gate: need confidence >= 50 AND risk/reward >= 1.5
    const shouldTrade = direction !== 'HOLD' && confidence >= 50 && riskReward >= 1.5;

    return {
      symbol,
      direction,
      confidence: Math.round(confidence),
      entryPrice: price,
      stopLoss: finalSL,
      takeProfit: finalTP,
      lotSize: Math.round(lotSize * 100) / 100,
      reasoning: String(parsed.reasoning || 'No reasoning provided.'),
      sentimentScore,
      riskRewardRatio: Math.round(riskReward * 100) / 100,
      shouldTrade,
      skipReason: direction === 'HOLD'
        ? String(parsed.skipReason || 'Insufficient confidence or conflicting signals')
        : !shouldTrade && confidence < 50
          ? `Confidence ${confidence}% below minimum 50%`
          : !shouldTrade && riskReward < 1.5
            ? `Risk/reward ${riskReward.toFixed(2)} below minimum 1.5:1`
            : undefined,
      newsUsed: news.length,
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errMsg = String(error);
    console.error('[AI Agent] LLM query failed:', errMsg);
    return fallbackDecision(symbol, price, atr, `LLM error: ${errMsg}`);
  }
}

function fallbackDecision(
  symbol: string,
  price: number,
  atr: number,
  reason: string,
): AIDecision {
  const sl = atr > 0
    ? Math.round((price - atr * 1.5) * 100000) / 100000
    : price * 0.99;
  const tp = atr > 0
    ? Math.round((price + atr * 2.5) * 100000) / 100000
    : price * 1.01;

  return {
    symbol,
    direction: 'HOLD',
    confidence: 0,
    entryPrice: price,
    stopLoss: sl,
    takeProfit: tp,
    lotSize: 0.01,
    reasoning: `AI agent unavailable — ${reason}. Holding position to protect capital.`,
    sentimentScore: 0,
    riskRewardRatio: 0,
    shouldTrade: false,
    skipReason: reason,
    newsUsed: 0,
    analyzedAt: new Date().toISOString(),
  };
}

// ==================== PUBLIC API ====================

export async function analyzeWithAI(
  symbol: string,
  timeframe: string,
  balance: number = 1000,
  riskPercent: number = 2,
  enableNews: boolean = true,
): Promise<AIDecision> {
  const startTime = Date.now();
  console.log(`[AI Agent] Analyzing ${symbol} ${timeframe}...`);

  // 1. Fetch market data (candles from Yahoo Finance)
  const yahooSym = yahooSymbol(symbol);
  const candles = await fetchCandles(yahooSym, timeframe);
  if (candles.length < 30) {
    const fallbackPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
    return fallbackDecision(symbol, fallbackPrice, 0, 'Insufficient candle data');
  }

  // 2. Calculate technical indicators
  const indicators = getAllIndicators(candles);
  const price = candles[candles.length - 1].close;

  // 3. Fetch news (multi-source, parallel-safe)
  let news: NewsContext[] = [];
  if (enableNews) {
    try {
      news = await fetchAllNews(symbol);
    } catch {
      console.error('[AI Agent] News fetch failed, continuing without news');
    }
  }

  // 4. Query LLM for decision
  const decision = await queryAI(symbol, price, indicators, candles, news, balance, riskPercent);
  const elapsed = Date.now() - startTime;
  console.log(`[AI Agent] ${symbol}: ${decision.direction} @ ${decision.confidence}% conf | ${elapsed}ms | ${decision.newsUsed} news articles${decision.shouldTrade ? ' → TRADE' : ' → HOLD'}`);

  return decision;
}

export async function scanWithAI(
  symbols: string[],
  timeframe: string,
  balance: number = 1000,
  riskPercent: number = 2,
  enableNews: boolean = true,
): Promise<Record<string, AIDecision>> {
  const results: Record<string, AIDecision> = {};

  // Scan symbols sequentially to avoid rate limits on both data and LLM
  for (const symbol of symbols) {
    try {
      results[symbol] = await analyzeWithAI(symbol, timeframe, balance, riskPercent, enableNews);
    } catch (error) {
      console.error(`[AI Agent] Error scanning ${symbol}:`, error);
      results[symbol] = fallbackDecision(symbol, 0, 0, `Scan error: ${String(error)}`);
    }
  }

  return results;
}
