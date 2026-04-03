export interface Quote {
  symbol: string;
  displaySymbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export interface Trade {
  id: string;
  symbol: string;
  direction: string;
  lotSize: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  pnl: number | null;
  status: string;
  strategy: string | null;
  openTime: string;
  closeTime: string | null;
}

export interface AgentState {
  id: string;
  isRunning: boolean;
  autoTrade: boolean;
  balance: number;
  currency: string;
  maxRiskPercent: number;
  maxDrawdownPercent: number;
  dailyRiskLimit: number;
  strategies: string;
  watchSymbols: string;
  timeframe: string;
  mt5Connected: boolean;
  lastScanAt: string | null;
}

export interface SignalResult {
  strategy: string;
  direction: string | null;
  confidence: number;
  reason: string | null;
  hasSignal: boolean;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorData {
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
}

export interface NewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date: string;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: string;
  price: number;
  isActive: boolean;
  triggered: boolean;
  createdAt: string;
  triggeredAt: string | null;
}

export interface PerformanceStats {
  totalTrades: number;
  closedTrades: number;
  openPositions: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgDurationMs: number;
  currentExposure: number;
  dailyBreakdown: { date: string; pnl: number }[];
  equityCurve: { date: string; equity: number }[];
  strategyBreakdown: { strategy: string; trades: number; winRate: number; pnl: number }[];
}

export const SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'BTC/USD'];

export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];

export const STRATEGY_COLORS: Record<string, string> = {
  RSI: 'text-amber-400',
  MACD: 'text-cyan-400',
  Bollinger: 'text-violet-400',
  Trend: 'text-emerald-400',
  Multi: 'text-yellow-400',
  Manual: 'text-gray-400',
};

export const SCAN_INTERVALS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
];

export const formatPrice = (p: number) => p.toFixed(5);

export const formatPnL = (p: number | null) => {
  if (p == null) return '\u2014';
  const v = +p.toFixed(2);
  return v >= 0 ? '+$' + v : '-$' + Math.abs(v);
};

export const pnlColor = (p: number | null) =>
  p == null ? 'text-muted-foreground' : p >= 0 ? 'text-emerald-400' : 'text-red-400';
