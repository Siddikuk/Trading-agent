// AI Trading Agent — LLM-powered decision engine
// This replaces mechanical EA rules with AI reasoning that considers
// technical indicators, news sentiment, and market context.

import ZAI from 'z-ai-web-dev-sdk';
import { fetchCandles } from './market-data';
import { getAllIndicators, yahooSymbol, calcPositionSize, calcRiskReward } from './trading-engine';
import type { Candle, IndicatorValues } from './trading-engine';

// ==================== TYPES ====================

export interface AIDecision {
  symbol: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  reasoning: string; // The AI's full reasoning
  sentimentScore: number; // -100 to 100 (bearish to bullish)
  riskRewardRatio: number;
  shouldTrade: boolean; // Final yes/no after risk checks
  skipReason?: string; // Why the AI decided to skip
}

interface NewsContext {
  title: string;
  snippet: string;
  source: string;
  date: string;
}

// ==================== NEWS FETCHING ====================

async function fetchMarketNews(symbol: string): Promise<NewsContext[]> {
  try {
    const ZAI_SDK = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI_SDK.create();

    const baseSymbol = symbol.replace('/', '');
    const query = `${symbol} forex analysis today market outlook`;
    const results = await zai.functions.invoke('web_search', {
      query,
      num: 5,
      recency_days: 1,
    });

    return (results || []).slice(0, 5).map((r: Record<string, unknown>) => ({
      title: String(r.name || ''),
      snippet: String(r.snippet || ''),
      source: String(r.host_name || ''),
      date: String(r.date || ''),
    }));
  } catch (error) {
    console.error('[AI Agent] Failed to fetch news:', error);
    return [];
  }
}

// ==================== LLM AGENT BRAIN ====================

const TRADING_SYSTEM_PROMPT = `You are an expert forex trading analyst and autonomous trading agent. Your job is to analyze market data and news to make trading decisions.

CRITICAL RULES:
1. You MUST respond with valid JSON only — no markdown, no code blocks, no extra text.
2. Always think like a risk-aware professional trader.
3. Consider both technical and fundamental factors.
4. Never recommend a trade with confidence below 40%.
5. Always set stop-loss and take-profit based on ATR volatility.
6. Be contrarian when appropriate — if everyone is buying, consider the risk of a reversal.
7. Factor in current news sentiment — if news is strongly bearish, do NOT buy even if technicals look bullish.
8. When in doubt, HOLD. Protecting capital is more important than catching every move.

RESPONSE FORMAT (JSON only):
{
  "direction": "BUY" | "SELL" | "HOLD",
  "confidence": 0-100,
  "entryPrice": number (current price),
  "stopLoss": number (based on ATR),
  "takeProfit": number (based on risk-reward, minimum 1.5:1),
  "sentimentScore": -100 to 100 (negative = bearish, positive = bullish),
  "reasoning": "Your detailed analysis explaining why you chose this direction, what factors you considered, and what could change your mind.",
  "skipReason": "If HOLD, explain why (e.g., 'mixed signals', 'low confidence', 'conflicting news') or null if trading"
}`;

async function queryAI(
  symbol: string,
  price: number,
  indicators: IndicatorValues,
  candles: Candle[],
  news: NewsContext[],
  balance: number,
  riskPercent: number
): Promise<AIDecision> {
  const zai = await ZAI.create();
  const atr = indicators.atr || price * 0.005;
  const lastCandles = candles.slice(-5).map(c => ({
    time: new Date(c.time).toISOString(),
    open: c.open.toFixed(5),
    high: c.high.toFixed(5),
    low: c.low.toFixed(5),
    close: c.close.toFixed(5),
  }));

  const userPrompt = `Analyze ${symbol} and decide whether to trade.

CURRENT PRICE: ${price.toFixed(5)}

TECHNICAL INDICATORS:
- RSI(14): ${indicators.rsi?.toFixed(1) || 'N/A'} ${indicators.rsi && indicators.rsi < 30 ? '(OVERSOLD)' : indicators.rsi && indicators.rsi > 70 ? '(OVERBOUGHT)' : ''}
- MACD Line: ${indicators.macdLine?.toFixed(5) || 'N/A'}
- MACD Signal: ${indicators.macdSignal?.toFixed(5) || 'N/A'}
- MACD Histogram: ${indicators.macdHistogram?.toFixed(5) || 'N/A'} ${indicators.macdHistogram && indicators.macdHistogram > 0 ? '(BULLISH)' : indicators.macdHistogram && indicators.macdHistogram < 0 ? '(BEARISH)' : ''}
- Bollinger Upper: ${indicators.bollingerUpper?.toFixed(5) || 'N/A'}
- Bollinger Middle: ${indicators.bollingerMiddle?.toFixed(5) || 'N/A'}
- Bollinger Lower: ${indicators.bollingerLower?.toFixed(5) || 'N/A'}
- EMA 9: ${indicators.ema9?.toFixed(5) || 'N/A'}
- EMA 21: ${indicators.ema21?.toFixed(5) || 'N/A'}
- EMA 50: ${indicators.ema50?.toFixed(5) || 'N/A'}
- ATR(14): ${atr.toFixed(5)}
- ADX: ${indicators.adx?.toFixed(1) || 'N/A'} ${indicators.adx && indicators.adx > 25 ? '(STRONG TREND)' : '(WEAK/NO TREND)'}

LAST 5 CANDLES:
${JSON.stringify(lastCandles, null, 2)}

RECENT NEWS (${news.length} articles):
${news.length > 0 ? news.map((n, i) => `${i + 1}. [${n.source}] ${n.title}\n   ${n.snippet}`).join('\n') : 'No recent news available.'}

RISK PARAMETERS:
- Account Balance: $${balance.toFixed(2)}
- Risk Per Trade: ${riskPercent}%
- Suggested SL Distance: ${atr.toFixed(5)} (1.5x ATR)
- Suggested TP Distance: ${(atr * 2.5).toFixed(5)} (2.5x ATR)

Make your trading decision. Respond with JSON only.`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: TRADING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const raw = completion.choices[0]?.message?.content || '';

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI Agent] No JSON found in response:', raw.slice(0, 200));
      return fallbackDecision(symbol, price, atr, 'Failed to parse AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const direction = ['BUY', 'SELL', 'HOLD'].includes(parsed.direction) ? parsed.direction : 'HOLD';
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
    const sentimentScore = Math.max(-100, Math.min(100, Number(parsed.sentimentScore) || 0));

    const sl = direction === 'BUY'
      ? Math.round((price - atr * 1.5) * 100000) / 100000
      : Math.round((price + atr * 1.5) * 100000) / 100000;
    const tp = direction === 'BUY'
      ? Math.round((price + atr * 2.5) * 100000) / 100000
      : Math.round((price - atr * 2.5) * 100000) / 100000;

    // Use AI values if they seem reasonable, otherwise use our calculated ones
    const finalSL = parsed.stopLoss && Math.abs(parsed.stopLoss - price) > 0 && Math.abs(parsed.stopLoss - price) < atr * 5
      ? Number(parsed.stopLoss) : sl;
    const finalTP = parsed.takeProfit && Math.abs(parsed.takeProfit - price) > 0 && Math.abs(parsed.takeProfit - price) < atr * 10
      ? Number(parsed.takeProfit) : tp;

    const lotSize = calcPositionSize(balance, riskPercent, price, finalSL);
    const riskReward = calcRiskReward(price, finalSL, finalTP);
    const shouldTrade = direction !== 'HOLD' && confidence >= 40 && riskReward >= 1.2;

    return {
      symbol,
      direction: direction as 'BUY' | 'SELL' | 'HOLD',
      confidence: Math.round(confidence),
      entryPrice: price,
      stopLoss: finalSL,
      takeProfit: finalTP,
      lotSize: Math.round(lotSize * 100) / 100,
      reasoning: parsed.reasoning || 'No reasoning provided.',
      sentimentScore,
      riskRewardRatio: Math.round(riskReward * 100) / 100,
      shouldTrade,
      skipReason: direction === 'HOLD' ? (parsed.skipReason || 'Low confidence or mixed signals') : undefined,
    };
  } catch (error) {
    console.error('[AI Agent] LLM query failed:', error);
    return fallbackDecision(symbol, price, atr, `LLM error: ${String(error)}`);
  }
}

function fallbackDecision(
  symbol: string,
  price: number,
  atr: number,
  reason: string
): AIDecision {
  return {
    symbol,
    direction: 'HOLD',
    confidence: 0,
    entryPrice: price,
    stopLoss: Math.round((price - atr * 1.5) * 100000) / 100000,
    takeProfit: Math.round((price + atr * 2.5) * 100000) / 100000,
    lotSize: 0.01,
    reasoning: `AI agent unavailable. ${reason}. Holding position.`,
    sentimentScore: 0,
    riskRewardRatio: 0,
    shouldTrade: false,
    skipReason: reason,
  };
}

// ==================== PUBLIC API ====================

export async function analyzeWithAI(
  symbol: string,
  timeframe: string,
  balance: number = 1000,
  riskPercent: number = 2,
  enableNews: boolean = true
): Promise<AIDecision> {
  console.log(`[AI Agent] Analyzing ${symbol} ${timeframe}...`);

  // 1. Fetch market data
  const yahooSym = yahooSymbol(symbol);
  const candles = await fetchCandles(yahooSym, timeframe);
  if (candles.length < 30) {
    return fallbackDecision(symbol, candles[candles.length - 1]?.close || 0, 0, 'Insufficient candle data');
  }

  // 2. Calculate technical indicators
  const indicators = getAllIndicators(candles);
  const price = candles[candles.length - 1].close;

  // 3. Fetch news (parallel with potential other data)
  let news: NewsContext[] = [];
  if (enableNews) {
    news = await fetchMarketNews(symbol);
  }

  // 4. Query LLM for decision
  const decision = await queryAI(symbol, price, indicators, candles, news, balance, riskPercent);
  console.log(`[AI Agent] ${symbol}: ${decision.direction} @ ${decision.confidence}% confidence${decision.shouldTrade ? ' → TRADE' : ' → HOLD'}`);

  return decision;
}

export async function scanWithAI(
  symbols: string[],
  timeframe: string,
  balance: number = 1000,
  riskPercent: number = 2,
  enableNews: boolean = true
): Promise<Record<string, AIDecision>> {
  const results: Record<string, AIDecision> = {};

  // Scan symbols sequentially to avoid rate limits
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
