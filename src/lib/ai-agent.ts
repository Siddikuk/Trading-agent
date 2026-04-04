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
  newsSources: string[];    // Actual domain names of articles used
  analyzedAt: string;       // ISO timestamp
}

interface NewsContext {
  title: string;
  snippet: string;
  source: string;
  date: string;
  score: number; // Source quality: 0-100
}

// ==================== NEWS FETCHING ====================
// IMPORTANT: The z-ai-web-dev-sdk does NOT support Google-style `site:` operators.
// Queries must use plain English keywords to match real financial news.
// Goal: Real market-moving events — central bank decisions, geopolitical events,
// economic data releases, sanctions, trade wars — NOT tutorials, ads, or SEO spam.

const NEWS_CACHE = new Map<string, { data: NewsContext[]; ts: number }>();
const NEWS_CACHE_TTL = 300000; // 5 minutes

// Tier 1 = wire services & major financial outlets (highest trust)
const TIER1_DOMAINS = [
  'reuters.com', 'bloomberg.com', 'cnbc.com', 'wsj.com', 'ft.com',
  'marketwatch.com', 'investing.com', 'forexlive.com', 'fxstreet.com',
  'dailyfx.com', 'tradingeconomics.com', 'economist.com',
];

// Tier 2 = solid financial news (good quality)
const TIER2_DOMAINS = [
  'finance.yahoo.com', 'yahoo.com/finance', 'money.cnn.com',
  'barrons.com', 'seekingalpha.com',
  'coindesk.com', 'cointelegraph.com',
  'kitco.com', 'gold.org',
];

// Blacklisted — never use these for trading decisions
const JUNK_PATTERNS = [
  'wikipedia.org', 'wikihow.com', 'youtube.com', 'reddit.com',
  'quora.com', 'pinterest.com', 'facebook.com', 'twitter.com',
  'instagram.com', 'tiktok.com', 'linkedin.com', 'medium.com',
  '.edu', 'academia.edu', 'researchgate.net',
  'study.com', 'tastyfx.com', 'tastytrade.com', 'robinhood.com',
  'webull.com', 'etoro.com', 'plus500.com', 'avatrade.com',
  'pepperstone.com', 'icmarkets.com', 'exness.com', 'xm.com',
];

// Title/snippet keywords that indicate JUNK content (tutorials, ads, beginner content)
const JUNK_TITLE_PATTERNS = [
  'what is forex', 'what is trading', 'what is currency',
  'how to trade', 'how to start', 'how to read',
  'forex for beginners', 'forex 101', 'forex trading 101',
  'trading for beginners', 'trading 101',
  'learn forex', 'learn trading', 'learn to trade',
  'forex basics', 'trading basics', 'the basics',
  'forex meaning', 'forex explained', 'trading explained',
  'forex tutorial', 'trading tutorial', 'tutorial',
  'forex course', 'trading course', 'online course',
  'forex guide', 'beginner guide', 'complete guide',
  'start trading', 'open account', 'sign up', 'register now',
  'trade forex online', 'try demo', 'practice account',
  'best forex broker', 'top forex broker', 'broker review',
  'low spreads', 'award winning', '80+ pairs',
  'trade with', 'start with', 'join now', 'get started',
  'no experience', 'zero commission', 'bonus', 'promotional',
  'meaning & how', 'meaning and how', 'how it works',
  'setup explained', 'deepening my understanding',
  'thanks for watching', 'subscribe', 'like and subscribe',
  'ian coleman', 'jason', 'no regrets subscribing',
];

function isJunkContent(title: string, snippet: string): boolean {
  const combined = `${title} ${snippet}`.toLowerCase();
  return JUNK_TITLE_PATTERNS.some(pattern => combined.includes(pattern));
}

function scoreNewsSource(host: string): number {
  if (!host) return 0;
  const h = host.toLowerCase();
  // Instant reject junk domains
  for (const junk of JUNK_PATTERNS) {
    if (h.includes(junk)) return 0;
  }
  // Tier 1 = 90-100
  for (const d of TIER1_DOMAINS) {
    if (h.includes(d)) return 90 + Math.floor(Math.random() * 11);
  }
  // Tier 2 = 70-85
  for (const d of TIER2_DOMAINS) {
    if (h.includes(d)) return 70 + Math.floor(Math.random() * 16);
  }
  // Unknown domain — ONLY accept if it looks like a real financial news site
  // Must have a strong finance/news indicator in the domain
  const strongNewsKeywords = ['reuters', 'bloomberg', 'cnbc', 'wsj', 'marketwatch', 'financial times', 'economist'];
  if (strongNewsKeywords.some(k => h.includes(k))) return 80;
  // Moderate news indicators
  const moderateKeywords = ['news', 'finance', 'trading', 'market', 'investing', 'stock', 'commodit', 'crypto', 'cointelegraph', 'coindesk'];
  if (moderateKeywords.some(k => h.includes(k))) return 40 + Math.floor(Math.random() * 21);
  return 0; // Reject everything else (broker sites, generic .com, etc.)
}

async function fetchNewsFromWeb(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  query: string,
  num = 5,
): Promise<NewsContext[]> {
  try {
    const results = await zai.functions.invoke('web_search', {
      query,
      num: num + 10, // Fetch extra to account for heavy filtering
      recency_days: 1,
    });
    const raw = (results || []).map((r: { name?: string; snippet?: string; host_name?: string; date?: string; url?: string }) => ({
      title: String(r.name || ''),
      snippet: String(r.snippet || ''),
      source: String(r.host_name || ''),
      date: String(r.date || ''),
      score: scoreNewsSource(String(r.host_name || '')),
    }));
    // Filter out junk: bad domains, short titles, short snippets, tutorial/ad content
    return raw
      .filter(n => {
        if (n.score <= 0) return false;
        if (n.title.length < 20) return false;
        if (n.snippet.length < 30) return false;
        if (isJunkContent(n.title, n.snippet)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, num);
  } catch (error) {
    console.error('[AI Agent] News fetch failed for query:', query, error);
    return [];
  }
}

/**
 * Build targeted financial news queries for a symbol.
 * CRITICAL: No `site:` operators — they don't work with this search SDK.
 * Instead, use specific keywords that match real financial news headlines.
 * Focus on MARKET-MOVING events: central bank decisions, economic data,
 * geopolitical tensions, sanctions, trade wars, elections.
 */
function buildNewsQueries(symbol: string): string[] {
  const isCrypto = symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL');
  const isGold = symbol.includes('XAU');
  const isJPY = symbol.includes('JPY');
  const isEUR = symbol.includes('EUR');
  const isGBP = symbol.includes('GBP');
  const isAUD = symbol.includes('AUD');
  const isCAD = symbol.includes('CAD');
  const isCHF = symbol.includes('CHF');
  const isNZD = symbol.includes('NZD');

  const queries: string[] = [];

  if (isCrypto) {
    queries.push(
      `${symbol} cryptocurrency price analysis market news today Reuters Bloomberg`,
      `${symbol} crypto regulation SEC Fed policy impact today`,
    );
  } else if (isGold) {
    queries.push(
      `gold price XAUUSD market analysis breaking news today Reuters Bloomberg`,
      `gold market Federal Reserve interest rate inflation geopolitical risk today`,
    );
  } else {
    // Forex pairs — targeted queries for real market-moving news
    const pair = symbol.replace('/', '');
    queries.push(
      `${pair} forex analysis market news today Reuters Bloomberg CNBC`,
      `${pair} currency exchange rate central bank economic data breaking`,
    );

    // Central bank & macro queries — these are what ACTUALLY move currencies
    if (isJPY) {
      queries.push('Bank of Japan BOJ yen interest rate monetary policy decision news today');
      queries.push('Japan yen USDJPY market analysis geopolitical risk economic data');
    }
    if (isEUR) {
      queries.push('ECB European Central Bank euro interest rate monetary policy decision news');
      queries.push('Eurozone economy euro inflation GDP economic data euro dollar analysis');
    }
    if (isGBP) {
      queries.push('Bank of England BOE pound sterling interest rate monetary policy decision');
      queries.push('UK economy pound Brexit trade policy inflation GDP economic news');
    }
    if (isAUD) {
      queries.push('Reserve Bank of Australia RBA aussie dollar interest rate policy decision');
      queries.push('Australia economy AUD China trade geopolitical risk economic data');
    }
    if (isCAD) {
      queries.push('Bank of Canada BOC Canadian dollar interest rate monetary policy decision');
      queries.push('Canada economy CAD oil prices US trade policy economic news');
    }
    if (isCHF) {
      queries.push('Swiss National Bank SNB franc interest rate monetary policy decision');
      queries.push('Switzerland franc safe haven geopolitical risk USDCHF analysis');
    }
    if (isNZD) {
      queries.push('Reserve Bank of New Zealand RBNZ kiwi dollar interest rate policy decision');
      queries.push('New Zealand economy NZD dairy trade economic data news');
    }
    if (symbol.includes('USD')) {
      queries.push('Federal Reserve FOMC US dollar interest rate decision economic data today');
      queries.push('US dollar DXY geopolitics war sanctions trade tariff economic impact');
    }
  }

  return queries;
}

// RSS feeds for news — works on any server (no z-ai-web-dev-sdk needed)
const RSS_FEEDS_AI = [
  'https://feeds.reuters.com/reuters/businessNews',
  'https://feeds.bbc.co.uk/news/business/rss.xml',
  'https://feeds.feedburner.com/Marketwatch/stockmarketnews',
  'https://www.forexlive.com/feed',
  'https://www.investing.com/rss/news.rss',
];

async function fetchRSSNews(): Promise<NewsContext[]> {
  const RSS2JSON = 'https://api.rss2json.com/v1/api.json';
  const allNews: NewsContext[] = [];

  try {
    const results = await Promise.allSettled(
      RSS_FEEDS_AI.slice(0, 3).map(async (feedUrl) => {
        const res = await fetch(`${RSS2JSON}?rss_url=${encodeURIComponent(feedUrl)}&count=5`, {
          next: { revalidate: 300 },
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (data.status !== 'ok' || !data.items) return [];
        return data.items.map((item: Record<string, unknown>) => ({
          title: String(item.title || '').trim(),
          snippet: String(item.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 200),
          source: String(item.author || '').split('.')[0] || 'News',
          date: String(item.pubDate || ''),
          score: 70,
        }));
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') allNews.push(...r.value);
    }
  } catch (error) {
    console.error('[AI Agent] RSS news fetch failed:', error);
  }

  // Deduplicate
  const seen = new Set<string>();
  return allNews.filter(n => {
    const key = n.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return n.title.length > 15;
  }).slice(0, 6);
}

async function fetchAllNews(symbol: string): Promise<NewsContext[]> {
  // Check cache
  const cacheKey = `news_${symbol}_${Math.floor(Date.now() / NEWS_CACHE_TTL)}`;
  const cached = NEWS_CACHE.get(cacheKey);
  if (cached) return cached.data;

  let allNews: NewsContext[] = [];

  // Try RSS feeds first (works everywhere)
  allNews = await fetchRSSNews();

  // If RSS returned results, use those
  if (allNews.length > 0) {
    console.log(`[AI Agent] RSS news for ${symbol}: ${allNews.length} articles`);
  } else {
    // Fallback: try z-ai-web-dev-sdk web search (only works in sandbox)
    try {
      const zai = await ZAI.create();
      const queries = buildNewsQueries(symbol);
      const [primaryNews, secondaryNews] = await Promise.allSettled([
        fetchNewsFromWeb(zai, queries[0], 3),
        queries.length > 1 ? fetchNewsFromWeb(zai, queries[1], 3) : Promise.resolve([] as NewsContext[]),
      ]);
      if (primaryNews.status === 'fulfilled') allNews = [...primaryNews.value];
      if (secondaryNews.status === 'fulfilled') allNews = [...allNews, ...secondaryNews.value];
      console.log(`[AI Agent] Web search news for ${symbol}: ${allNews.length} articles`);
    } catch (error) {
      console.error('[AI Agent] Web search unavailable (expected on Vercel), using RSS only');
    }
  }

  // Cache result
  NEWS_CACHE.set(cacheKey, { data: allNews, ts: Date.now() });
  if (NEWS_CACHE.size > 50) NEWS_CACHE.clear();

  return allNews.slice(0, 8);
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
5. Always use ATR for stop-loss placement. Risk 1-1.5x ATR, Reward 3-4x ATR (minimum 2:1 R:R, aim for 3:1).
6. CAPITAL PRESERVATION > catching every move. When in doubt, HOLD.
7. If the risk/reward is below 2:1, DO NOT TRADE — widen the take-profit or tighten the stop to hit 2:1 minimum.
8. For BTC/crypto: use wider stops (1.5-2x ATR) but require 3:1 R:R minimum due to volatility.

## RESPONSE FORMAT (strict JSON):
{
  "direction": "BUY" | "SELL" | "HOLD",
  "confidence": 50-95,
  "entryPrice": <current price as number>,
  "stopLoss": <number, based on ATR>,
  "takeProfit": <number, minimum 2:1 risk/reward, aim for 3:1>,
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
    ? news.map((n, i) => {
        const tier = n.score >= 90 ? '🔴 HIGH' : n.score >= 70 ? '🟡 MED' : '🟢 LOW';
        return `${i + 1}. [${tier} RELIABILITY] **[${n.source}]** ${n.title}\n   > ${n.snippet}`;
      }).join('\n\n')
    : '⚠️ No recent news available — proceed with technical analysis only.'}
NOTE: Prioritize 🔴 HIGH reliability sources (Reuters, Bloomberg, CNBC) for trading decisions. Lower reliability sources should only confirm, not drive decisions.

### RISK PARAMETERS
- Account Balance: $${balance.toFixed(2)}
- Max Risk Per Trade: ${riskPercent}% ($${(balance * riskPercent / 100).toFixed(2)})
- ATR-based SL suggestion: ${atr.toFixed(5)} (1.2x ATR = ${(atr * 1.2).toFixed(5)})
- ATR-based TP suggestion: ${(atr * 3.5).toFixed(5)} (3.5x ATR)
- Minimum required R:R: 2.0:1

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

    // LLM call with timeout + retry on rate limit (429)
    let completion: Awaited<ReturnType<typeof zai.chat.completions.create>>;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
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

        completion = await Promise.race([completionPromise, timeoutPromise]);
        lastError = null;
        break; // Success — exit retry loop
      } catch (err) {
        const msg = String(err);
        lastError = err instanceof Error ? err : new Error(msg);
        // Only retry on rate limit (429) — fail fast on everything else
        if (msg.includes('429') || msg.includes('Too many requests')) {
          const waitTime = (attempt + 1) * 8000; // 8s, 16s, 24s backoff
          if (attempt < 2) { // Skip wait on last attempt — no point waiting if we won't retry
            console.warn(`[AI Agent] Rate limited (attempt ${attempt + 1}/3), retrying in ${waitTime / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.warn(`[AI Agent] Rate limited (attempt 3/3), giving up`);
          }
        } else {
          break; // Not a rate limit error — don't retry
        }
      }
    }

    if (lastError || !completion) {
      throw lastError || new Error('LLM call failed after retries');
    }
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

    // Calculate SL/TP — tighter stops, wider targets for better R:R (aim 2.5-3:1)
    const defaultSL = direction === 'BUY'
      ? Math.round((price - atr * 1.2) * 100000) / 100000
      : Math.round((price + atr * 1.2) * 100000) / 100000;
    const defaultTP = direction === 'BUY'
      ? Math.round((price + atr * 3.5) * 100000) / 100000
      : Math.round((price - atr * 3.5) * 100000) / 100000;

    const validateSL = (v: number) => v > 0 && Math.abs(v - price) > 0 && Math.abs(v - price) < atr * 5;
    const validateTP = (v: number) => v > 0 && Math.abs(v - price) > 0 && Math.abs(v - price) < atr * 10;

    const aiSL = Number(parsed.stopLoss);
    const aiTP = Number(parsed.takeProfit);
    const finalSL = validateSL(aiSL) ? aiSL : defaultSL;
    const finalTP = validateTP(aiTP) ? aiTP : defaultTP;

    // Validate risk/reward ratio
    const riskReward = calcRiskReward(price, finalSL, finalTP);
    const lotSize = calcPositionSize(balance, riskPercent, price, finalSL);

    // Final decision gate: need confidence >= 60 AND risk/reward >= 2.0
    const shouldTrade = direction !== 'HOLD' && confidence >= 60 && riskReward >= 2.0;

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
          : !shouldTrade && riskReward < 2.0
            ? `Risk/reward ${riskReward.toFixed(2)} below minimum 2:1`
            : undefined,
      newsUsed: news.length,
      newsSources: news.map(n => n.source),
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
    newsSources: [],
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
