'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, TrendingUp, TrendingDown, DollarSign, BarChart3,
  Play, Square, Zap, Eye, EyeOff, Volume2, VolumeX,
  RefreshCw, Settings, Shield, Wifi, WifiOff, ArrowUpRight,
  ArrowDownRight, Target, AlertTriangle, Clock, Newspaper,
  ChevronDown, ChevronRight, Radio, Brain, LineChart,
  CircleDot, X, Plus, Minus, Save, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

// ==================== TYPES ====================
interface Quote { symbol: string; displaySymbol: string; price: number; change: number; changePercent: number; volume: number; }
interface Trade { id: string; symbol: string; direction: string; lotSize: number; entryPrice: number; stopLoss: number | null; takeProfit: number | null; exitPrice: number | null; pnl: number | null; status: string; strategy: string | null; openTime: string; closeTime: string | null; }
interface AgentState { id: string; isRunning: boolean; autoTrade: boolean; balance: number; currency: string; maxRiskPercent: number; maxDrawdownPercent: number; dailyRiskLimit: number; strategies: string; watchSymbols: string; timeframe: string; mt5Connected: boolean; lastScanAt: string | null; }
interface SignalResult { strategy: string; direction: string | null; confidence: number; reason: string | null; hasSignal: boolean; }
interface CandleData { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface IndicatorData { rsi?: number; macdLine?: number; macdSignal?: number; macdHistogram?: number; bollingerUpper?: number; bollingerMiddle?: number; bollingerLower?: number; ema9?: number; ema21?: number; ema50?: number; ema200?: number; atr?: number; adx?: number; }

// ==================== CONSTANTS ====================
const SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'BTC/USD'];
const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
const STRATEGY_COLORS: Record<string, string> = {
  RSI: 'text-amber-400',
  MACD: 'text-cyan-400',
  Bollinger: 'text-violet-400',
  Trend: 'text-emerald-400',
  Multi: 'text-yellow-400',
};

// ==================== MAIN APP ====================
export default function TradingTerminal() {
  // Core state
  const [selectedSymbol, setSelectedSymbol] = useState('EUR/USD');
  const [timeframe, setTimeframe] = useState('1h');
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [indicators, setIndicators] = useState<IndicatorData>({});
  const [signalResults, setSignalResults] = useState<SignalResult[]>([]);
  const [combinedSignal, setCombinedSignal] = useState<Record<string, unknown> | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeStats, setTradeStats] = useState<Record<string, unknown> | null>(null);
  const [mt5Connected, setMt5Connected] = useState(false);
  const [mt5Orders, setMt5Orders] = useState<unknown[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('chart');
  const [showSettings, setShowSettings] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ==================== DATA FETCHING ====================
  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch('/api/forex/market');
      const data = await res.json();
      if (data.data) setQuotes(data.data);
    } catch { /* silent fail — use cached */ }
  }, []);

  const fetchAgentState = useCallback(async () => {
    try {
      const res = await fetch('/api/forex/agent');
      const data = await res.json();
      if (data.state) setAgentState(data.state);
    } catch { /* silent */ }
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/forex/trades');
      const data = await res.json();
      if (data.trades) setTrades(data.trades);
      if (data.stats) setTradeStats(data.stats);
    } catch { /* silent */ }
  }, []);

  const analyzeSymbol = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/forex/signals?symbol=${selectedSymbol}&timeframe=${timeframe}`);
      const data = await res.json();
      if (data.candles) setCandles(data.candles);
      if (data.indicators) setIndicators(data.indicators);
      if (data.strategyResults) setSignalResults(data.strategyResults);
      if (data.combinedSignal) setCombinedSignal(data.combinedSignal);

      // Play TTS for strong signals
      if (data.combinedSignal && data.combinedSignal.confidence >= 70 && soundEnabled) {
        playAlert(`${data.combinedSignal.direction} ${data.combinedSignal.symbol} ${data.combinedSignal.confidence}%`);
      }
    } catch { /* silent */ }
    setIsAnalyzing(false);
  }, [selectedSymbol, timeframe, soundEnabled]);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    setScanLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Scanning ${SYMBOLS.join(', ')}...`]);
    try {
      const res = await fetch('/api/forex/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: SYMBOLS, timeframe }),
      });
      const data = await res.json();
      if (data.results) {
        Object.entries(data.results).forEach(([sym, result]: [string, unknown]) => {
          const r = result as Record<string, unknown>;
          if (r.action === 'TRADE_OPENED') {
            setScanLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] OPENED ${r.direction} ${sym} @ ${r.entryPrice} (${r.confidence}%)`]);
          } else if (r.skipped) {
            setScanLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${sym}: ${r.skipped}`]);
          }
        });
      }
    } catch (e) {
      setScanLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Error: ${e}`]);
    }
    setIsScanning(false);
    fetchTrades();
  }, [timeframe, fetchTrades]);

  const playAlert = async (text: string) => {
    try {
      const res = await fetch('/api/forex/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 1024) }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play().catch(() => {});
        }
      }
    } catch { /* silent */ }
  };

  const updateAgent = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/forex/agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.state) setAgentState(data.state);
    } catch { /* silent */ }
  };

  // ==================== EFFECTS ====================
  useEffect(() => { fetchQuotes(); fetchAgentState(); fetchTrades(); }, [fetchQuotes, fetchAgentState, fetchTrades]);
  useEffect(() => { analyzeSymbol(); }, [selectedSymbol, timeframe, analyzeSymbol]);
  useEffect(() => {
    const interval = setInterval(fetchQuotes, 30000);
    return () => clearInterval(interval);
  }, [fetchQuotes]);

  useEffect(() => {
    if (agentState?.isRunning && agentState.autoTrade) {
      scanIntervalRef.current = setInterval(() => {
        runScan();
      }, 120000); // Auto-scan every 2 min
      return () => { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); };
    } else {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    }
  }, [agentState?.isRunning, agentState?.autoTrade, runScan]);

  // MT5 Bridge connection
  useEffect(() => {
    try {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.8.3/socket.io.min.js';
      script.onload = () => {
        const socket = (window as unknown as Record<string, unknown>).io('/?XTransformPort=3005');
        socket.on('connect', () => setMt5Connected(true));
        socket.on('disconnect', () => setMt5Connected(false));
        socket.on('mt5_status', (data: { connected: boolean }) => setMt5Connected(data.connected));
        socket.on('orders', (data: unknown[]) => setMt5Orders(data));
        socket.emit('get_orders');
      };
      document.head.appendChild(script);
    } catch { /* silent */ }
  }, []);

  // ==================== RENDER HELPERS ====================
  const formatPrice = (p: number) => p.toFixed(5);
  const formatPnL = (p: number | null) => {
    if (p == null) return '—';
    const v = +p.toFixed(2);
    return v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`;
  };
  const pnlColor = (p: number | null) => p == null ? 'text-muted-foreground' : p >= 0 ? 'text-emerald-400' : 'text-red-400';

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : quotes.find(q => q.displaySymbol === selectedSymbol)?.price || 0;
  const currentChange = quotes.find(q => q.displaySymbol === selectedSymbol)?.changePercent || 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <audio ref={audioRef} className="hidden" />
      
      {/* ============ HEADER / TICKER STRIP ============ */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-lg tracking-tight">TRADING AGENT</span>
            </div>
            {agentState?.isRunning ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                STOPPED
              </Badge>
            )}
            {agentState?.autoTrade && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                <Zap className="w-3 h-3" />
                AUTO
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={soundEnabled ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="h-8 w-8 p-0"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="w-4 h-4" />
            </Button>
            <div className={`flex items-center gap-1.5 text-xs ${mt5Connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {mt5Connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              MT5
            </div>
          </div>
        </div>

        {/* Ticker Strip */}
        <div className="flex gap-0 overflow-x-auto px-3 pb-2 scrollbar-none">
          {quotes.map(q => (
            <button
              key={q.symbol}
              onClick={() => setSelectedSymbol(q.displaySymbol)}
              className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-mono whitespace-nowrap transition-all hover:bg-muted ${selectedSymbol === q.displaySymbol ? 'bg-muted ring-1 ring-ring' : ''}`}
            >
              <span className="font-semibold">{q.displaySymbol}</span>
              <span className={q.change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {q.change >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
              </span>
              <span className="text-muted-foreground">{formatPrice(q.price)}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ============ MAIN CONTENT ============ */}
      <main className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* LEFT: Chart + Analysis */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {/* Chart Controls */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/30">
            <div className="flex items-center gap-1">
              <LineChart className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{selectedSymbol}</span>
            </div>
            <div className="flex items-center gap-1 ml-2">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${timeframe === tf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isAnalyzing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              <div className={`text-2xl font-bold font-mono ${currentChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPrice(currentPrice)}
              </div>
              <span className={`text-xs font-mono ${currentChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {currentChange >= 0 ? '+' : ''}{currentChange.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Candlestick Chart */}
          <div className="flex-1 p-3 min-h-[350px]">
            <CandlestickChart candles={candles} indicators={indicators} />
          </div>

          {/* Signal Analysis Panel */}
          <div className="border-t border-border px-3 py-3 bg-card/30">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Signal Analysis — {selectedSymbol} {timeframe}</span>
            </div>

            {combinedSignal && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg p-3 mb-3 ${combinedSignal.direction === 'BUY' ? 'glass-card glow-green' : 'glass-card glow-red'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {combinedSignal.direction === 'BUY'
                      ? <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                      : <ArrowDownRight className="w-5 h-5 text-red-400" />
                    }
                    <span className={`text-lg font-bold ${combinedSignal.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {combinedSignal.direction}
                    </span>
                    <Badge variant="outline" className={combinedSignal.direction === 'BUY' ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'}>
                      {combinedSignal.confidence}% confidence
                    </Badge>
                  </div>
                  <Badge variant="secondary">{combinedSignal.strategy}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div><span className="text-muted-foreground">Entry</span><br />{formatPrice(combinedSignal.entryPrice as number)}</div>
                  <div><span className="text-muted-foreground">SL</span><br /><span className="text-red-400">{formatPrice(combinedSignal.stopLoss as number)}</span></div>
                  <div><span className="text-muted-foreground">TP</span><br /><span className="text-emerald-400">{formatPrice(combinedSignal.takeProfit as number)}</span></div>
                </div>
                {combinedSignal.reason && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{combinedSignal.reason as string}</p>
                )}
              </motion.div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {signalResults.map((s, i) => (
                <div key={i} className={`rounded-md p-2 bg-muted/50 ${s.hasSignal ? (s.direction === 'BUY' ? 'border-l-2 border-emerald-400' : 'border-l-2 border-red-400') : 'border-l-2 border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${STRATEGY_COLORS[s.strategy] || 'text-muted-foreground'}`}>{s.strategy}</span>
                    {s.hasSignal && (
                      <span className={`text-xs font-bold ${s.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.direction}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={s.hasSignal ? s.confidence : 0} className="h-1.5 flex-1" />
                    <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{s.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Tabs (Trades, Signals, Agent) */}
        <div className="w-full lg:w-[420px] flex flex-col border-border overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-10 p-0">
              <TabsTrigger value="chart" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <BarChart3 className="w-3.5 h-3.5" /> Trades
              </TabsTrigger>
              <TabsTrigger value="agent" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <Brain className="w-3.5 h-3.5" /> Agent
              </TabsTrigger>
              <TabsTrigger value="mt5" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <Radio className="w-3.5 h-3.5" /> MT5
              </TabsTrigger>
              <TabsTrigger value="log" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <Clock className="w-3.5 h-3.5" /> Log
              </TabsTrigger>
            </TabsList>

            {/* TRADES TAB */}
            <TabsContent value="chart" className="flex-1 overflow-hidden flex flex-col m-0">
              {/* Stats bar */}
              {tradeStats && (
                <div className="grid grid-cols-4 gap-0 border-b border-border text-center">
                  {[
                    { label: 'Win Rate', value: `${tradeStats.winRate}%`, color: Number(tradeStats.winRate) >= 50 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Total P/L', value: formatPnL(tradeStats.totalPnL as number), color: (tradeStats.totalPnL as number) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Open', value: String(tradeStats.openPositions), color: 'text-foreground' },
                    { label: 'Closed', value: String(tradeStats.closedPositions), color: 'text-muted-foreground' },
                  ].map((s, i) => (
                    <div key={i} className="py-2 border-r border-border last:border-r-0">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                      <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Open Positions */}
              <div className="px-3 py-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Open Positions ({trades.filter(t => t.status === 'OPEN').length})</div>
              </div>
              <div className="flex-1 overflow-y-auto px-3">
                <div className="space-y-1">
                  {trades.filter(t => t.status === 'OPEN').length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8">No open positions</div>
                  )}
                  {trades.filter(t => t.status === 'OPEN').map(t => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="glass-card rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <CircleDot className={`w-3 h-3 ${t.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'} fill="currentColor" />
                          <span className="font-bold text-sm">{t.symbol}</span>
                          <Badge variant="outline" className={cn(
                            'text-[10px]',
                            t.direction === 'BUY' ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
                          )}>
                            {t.direction}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{t.lotSize} lots</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-muted-foreground">Entry</span>
                          <div>{formatPrice(t.entryPrice)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">SL</span>
                          <div className="text-red-400">{t.stopLoss ? formatPrice(t.stopLoss) : '—'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">TP</span>
                          <div className="text-emerald-400">{t.takeProfit ? formatPrice(t.takeProfit) : '—'}</div>
                        </div>
                      </div>
                      {t.strategy && <div className="text-[10px] text-muted-foreground mt-1">{t.strategy}</div>}
                    </motion.div>
                  ))}
                </div>

                {/* Recent Closed */}
                <div className="mt-4 mb-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Closed</div>
                </div>
                <div className="space-y-1 pb-3">
                  {trades.filter(t => t.status === 'CLOSED').slice(0, 10).map(t => (
                    <div key={t.id} className="rounded-lg p-2 bg-muted/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{t.symbol}</span>
                        <span className={`text-xs ${t.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{t.direction}</span>
                      </div>
                      <span className={`text-sm font-mono font-bold ${pnlColor(t.pnl)}`}>{formatPnL(t.pnl)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* AGENT TAB */}
            <TabsContent value="agent" className="flex-1 overflow-y-auto m-0 p-3 space-y-3">
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Agent Control
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Agent Status</div>
                      <div className="text-xs text-muted-foreground">{agentState?.isRunning ? 'Scanning markets autonomously' : 'Agent is stopped'}</div>
                    </div>
                    <Button
                      variant={agentState?.isRunning ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => updateAgent({ isRunning: !agentState?.isRunning })}
                      className={agentState?.isRunning ? 'gap-1' : 'gap-1'}
                    >
                      {agentState?.isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {agentState?.isRunning ? 'Stop' : 'Start'}
                    </Button>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Auto-Trade</div>
                      <div className="text-xs text-muted-foreground">{agentState?.autoTrade ? 'Executing signals automatically' : 'Manual mode — signals only'}</div>
                    </div>
                    <Switch
                      checked={agentState?.autoTrade || false}
                      onCheckedChange={(v) => updateAgent({ autoTrade: v })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Risk Parameters
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Balance</span>
                      <span className="text-sm font-mono font-bold text-emerald-400">
                        ${agentState?.balance?.toLocaleString() || '1,000'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={100000}
                      step={100}
                      value={agentState?.balance || 1000}
                      onChange={e => updateAgent({ balance: e.target.value })}
                      className="w-full h-1.5 accent-emerald-400"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Risk per Trade</span>
                      <span className="text-sm font-mono font-bold">{agentState?.maxRiskPercent || 2}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={agentState?.maxRiskPercent || 2}
                      onChange={e => updateAgent({ maxRiskPercent: e.target.value })}
                      className="w-full h-1.5 accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Daily Risk Limit</span>
                      <span className="text-sm font-mono font-bold">{agentState?.dailyRiskLimit || 5}%</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={agentState?.dailyRiskLimit || 5}
                      onChange={e => updateAgent({ dailyRiskLimit: e.target.value })}
                      className="w-full h-1.5 accent-red-400"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Max Drawdown</span>
                      <span className="text-sm font-mono font-bold">{agentState?.maxDrawdownPercent || 10}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={50}
                      step={5}
                      value={agentState?.maxDrawdownPercent || 10}
                      onChange={e => updateAgent({ maxDrawdownPercent: e.target.value })}
                      className="w-full h-1.5 accent-red-400"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Manual Scan Button */}
              <Button
                onClick={runScan}
                disabled={isScanning || !agentState?.isRunning}
                className="w-full gap-2 h-10"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Manual Scan
                  </>
                )}
              </Button>
            </TabsContent>

            {/* MT5 TAB */}
            <TabsContent value="mt5" className="flex-1 overflow-y-auto m-0 p-3">
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="w-4 h-4" />
                    MT5 Bridge
                    <Badge variant="outline" className={`ml-auto ${mt5Connected ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'}`}>
                      {mt5Connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mt5Orders.length > 0 ? (
                    <div className="space-y-2">
                      {mt5Orders.map((o: Record<string, unknown>, i: number) => (
                        <div key={i} className={`rounded-lg p-2 bg-muted/30 ${o.status === 'OPEN' ? 'border-l-2 border-primary' : 'opacity-50'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CircleDot className={`w-2.5 h-2.5 ${o.type === 'BUY' ? 'text-emerald-400' : 'text-red-400'} fill="currentColor" />
                              <span className="text-sm font-bold">{o.symbol as string}</span>
                              <Badge variant="outline" className={`text-[10px] ${o.type === 'BUY' ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'}`}>
                                {o.type as string} {o.lots as number}
                              </Badge>
                            </div>
                            <span className={`text-xs font-mono font-bold ${(o.profit as number) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              ${(o.profit as number) >= 0 ? '+' : ''}{(o.profit as number).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-xs text-muted-foreground py-8">
                      {mt5Connected ? 'No orders' : 'Bridge not connected'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* LOG TAB */}
            <TabsContent value="log" className="flex-1 overflow-y-auto m-0 p-3">
              <div className="space-y-1 font-mono text-xs">
                <div className="text-muted-foreground mb-2">Agent Activity Log</div>
                {scanLog.length === 0 && (
                  <div className="text-muted-foreground py-8 text-center">No activity yet. Start the agent to begin scanning.</div>
                )}
                {scanLog.slice(-50).reverse().map((log, i) => (
                  <div key={i} className="animate-slide-up text-muted-foreground">
                    {log}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-border bg-card/50 backdrop-blur-xl px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>Balance: <strong className="text-foreground">${agentState?.balance?.toLocaleString() || '1,000'}</strong></span>
          <Separator orientation="vertical" className="h-3" />
          <span>Strategies: <strong className="text-foreground">{agentState?.strategies || 'RSI,MACD,Bollinger'}</strong></span>
        </div>
        <div className="flex items-center gap-4">
          <span>TF: <strong className="text-foreground">{timeframe}</strong></span>
          <Separator orientation="vertical" className="h-3" />
          <span>Last scan: <strong className="text-foreground">{agentState?.lastScanAt ? new Date(agentState.lastScanAt).toLocaleTimeString() : 'Never'}</strong></span>
        </div>
      </footer>
    </div>
  );
}

// ==================== CANDLESTICK CHART COMPONENT ====================
function CandlestickChart({ candles, indicators }: { candles: CandleData[]; indicators: IndicatorData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const container = canvas.parentElement;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 10, right: 60, bottom: 24, left: 4 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    // Price range
    const allHighs = candles.map(c => c.high);
    const allLows = candles.map(c => c.low);
    const prices = [...allHighs, ...allLows];
    if (indicators.bollingerUpper) prices.push(indicators.bollingerUpper);
    if (indicators.bollingerLower) prices.push(indicators.bollingerLower);
    const minP = Math.min(...prices) * 0.999;
    const maxP = Math.max(...prices) * 1.001;
    const range = maxP - minP;
    const candleW = chartW / candles.length;
    const bodyW = Math.max(1, candleW * 0.6);

    const priceToY = (p: number) => PAD.top + (1 - (p - minP) / range) * chartH;
    const yToPrice = (y: number) => minP + (1 - (y - PAD.top) / chartH) * range;

    // Background
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
      const y = PAD.top + (i / gridLines) * chartH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      const price = yToPrice(y);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(5), W - PAD.right + 4, y + 3);
    }

    // EMA lines
    const emaConfigs: { key: keyof IndicatorData; color: string }[] = [
      { key: 'ema9', color: 'rgba(34,197,94,0.6)' },
      { key: 'ema21', color: 'rgba(59,130,246,0.6)' },
      { key: 'ema50', color: 'rgba(245,158,11,0.5)' },
    ];
    for (const { key, color } of emaConfigs) {
      if (!indicators[key]) continue;
      // Reconstruct from candles length - we need all values, but we only have the latest
      // For now just draw a horizontal line at the current value
      const y = priceToY(indicators[key]!);
      if (y >= PAD.top && y <= PAD.top + chartH) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(W - PAD.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Bollinger Bands
    if (indicators.bollingerUpper && indicators.bollingerLower) {
      ctx.fillStyle = 'rgba(139,92,246,0.05)';
      const yUp = priceToY(indicators.bollingerUpper);
      const yDown = priceToY(indicators.bollingerLower);
      ctx.fillRect(PAD.left, yUp, chartW, yDown - yUp);
    }

    // Candles
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = PAD.left + i * candleW + candleW / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? '#22c55e' : '#ef4444';
      const oY = priceToY(c.open);
      const cY = priceToY(c.close);
      const hY = priceToY(c.high);
      const lY = priceToY(c.low);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, hY);
      ctx.lineTo(x, lY);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(oY, cY);
      const bodyH = Math.max(1, Math.abs(cY - oY));
      if (isUp) {
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      }
    }

    // Current price line
    if (candles.length > 0) {
      const lastPrice = candles[candles.length - 1].close;
      const y = priceToY(lastPrice);
      ctx.strokeStyle = lastPrice >= candles[candles.length - 1].open ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price label
      ctx.fillStyle = lastPrice >= candles[candles.length - 1].open ? '#22c55e' : '#ef4444';
      ctx.fillRect(W - PAD.right, y - 9, PAD.right, 18);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(lastPrice.toFixed(5), W - PAD.right + 4, y + 3);
    }

    // RSI mini chart in corner
    if (indicators.rsi !== undefined) {
      const rsiX = PAD.left + 8;
      const rsiY = PAD.top + 8;
      const rsiW = 80;
      const rsiH = 40;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(rsiX, rsiY, rsiW, rsiH);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(rsiX, rsiY, rsiW, rsiH);

      // RSI level lines
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      [30, 50, 70].forEach(level => {
        const ly = rsiY + rsiH - (level / 100) * rsiH;
        ctx.beginPath();
        ctx.moveTo(rsiX, ly);
        ctx.lineTo(rsiX + rsiW, ly);
        ctx.stroke();
      });

      // RSI value
      const rsiVal = indicators.rsi;
      const rsiBarH = (rsiVal / 100) * rsiH;
      ctx.fillStyle = rsiVal > 70 ? 'rgba(239,68,68,0.7)' : rsiVal < 30 ? 'rgba(34,197,94,0.7)' : 'rgba(100,100,100,0.5)';
      ctx.fillRect(rsiX, rsiY + rsiH - rsiBarH, rsiW, rsiBarH);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`RSI ${rsiVal.toFixed(1)}`, rsiX + 4, rsiY + 12);
    }

    // Time labels
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const timeStep = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += timeStep) {
      const x = PAD.left + i * candleW + candleW / 2;
      const d = new Date(candles[i].time);
      ctx.fillText(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, x, H - 4);
    }

  }, [candles, indicators]);

  return (
    <div className="w-full h-full relative">
      {candles.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <Skeleton className="w-full h-full rounded-lg" />
        </div>
      ) : (
        <canvas ref={canvasRef} className="w-full h-full" />
      )}
    </div>
  );
}
