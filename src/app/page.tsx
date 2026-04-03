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
  CircleDot, X, Plus, Minus, Save, Trash2,
  PieChart, Trophy, Flame, TrendingDownIcon, Bell, BellOff,
  Gauge, ExternalLink, Hash, Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from '@/components/ui/tooltip';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

// ==================== TYPES ====================
interface Quote { symbol: string; displaySymbol: string; price: number; change: number; changePercent: number; volume: number; }
interface Trade { id: string; symbol: string; direction: string; lotSize: number; entryPrice: number; stopLoss: number | null; takeProfit: number | null; exitPrice: number | null; pnl: number | null; status: string; strategy: string | null; openTime: string; closeTime: string | null; }
interface AgentState { id: string; isRunning: boolean; autoTrade: boolean; balance: number; currency: string; maxRiskPercent: number; maxDrawdownPercent: number; dailyRiskLimit: number; strategies: string; watchSymbols: string; timeframe: string; mt5Connected: boolean; lastScanAt: string | null; }
interface SignalResult { strategy: string; direction: string | null; confidence: number; reason: string | null; hasSignal: boolean; }
interface CandleData { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface IndicatorData { rsi?: number; macdLine?: number; macdSignal?: number; macdHistogram?: number; bollingerUpper?: number; bollingerMiddle?: number; bollingerLower?: number; ema9?: number; ema21?: number; ema50?: number; ema200?: number; atr?: number; adx?: number; }
interface NewsItem { title: string; url: string; snippet: string; source: string; date: string; }
interface PriceAlert { id: string; symbol: string; condition: string; price: number; isActive: boolean; triggered: boolean; createdAt: string; triggeredAt: string | null; }
interface PerformanceStats {
  totalTrades: number; closedTrades: number; openPositions: number;
  wins: number; losses: number; winRate: number; totalPnL: number;
  avgWin: number; avgLoss: number; profitFactor: number;
  largestWin: number; largestLoss: number;
  maxConsecutiveWins: number; maxConsecutiveLosses: number;
  avgDurationMs: number; currentExposure: number;
  dailyBreakdown: { date: string; pnl: number }[];
  equityCurve: { date: string; equity: number }[];
  strategyBreakdown: { strategy: string; trades: number; winRate: number; pnl: number }[];
}

// ==================== CONSTANTS ====================
const SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'BTC/USD'];
const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
const STRATEGY_COLORS: Record<string, string> = {
  RSI: 'text-amber-400',
  MACD: 'text-cyan-400',
  Bollinger: 'text-violet-400',
  Trend: 'text-emerald-400',
  Multi: 'text-yellow-400',
  Manual: 'text-gray-400',
};
const SCAN_INTERVALS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
];

// ==================== MAIN APP ====================
export default function TradingTerminal() {
  const { toast } = useToast();

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
  const [activeTab, setActiveTab] = useState('trades');
  const [showSettings, setShowSettings] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMt5Ref = useRef(false);

  // Settings state
  const [strategiesEnabled, setStrategiesEnabled] = useState({
    RSI: true, MACD: true, Bollinger: true, Trend: true,
  });
  const [scanInterval, setScanInterval] = useState(120);
  const [defaultLotSize, setDefaultLotSize] = useState(0.1);
  const [maxConcurrent, setMaxConcurrent] = useState(3);

  // News state
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Performance state
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Price alerts state
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [newAlertSymbol, setNewAlertSymbol] = useState('EUR/USD');
  const [newAlertCondition, setNewAlertCondition] = useState('above');
  const [newAlertPrice, setNewAlertPrice] = useState('');
  const [alertSubmitting, setAlertSubmitting] = useState(false);

  // New trade dialog state
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeForm, setTradeForm] = useState({
    symbol: 'EUR/USD',
    direction: 'BUY',
    lotSize: 0.1,
    entryPrice: '',
    stopLoss: '',
    takeProfit: '',
    strategy: 'Manual',
  });
  const [tradeSubmitting, setTradeSubmitting] = useState(false);

  // ==================== DATA FETCHING ====================
  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch('/api/forex/market');
      const data = await res.json();
      if (data.data) setQuotes(data.data);
    } catch { /* silent fail */ }
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

  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const res = await fetch('/api/forex/news?q=forex');
      const data = await res.json();
      if (data.results) setNews(data.results);
    } catch { /* silent */ }
    setNewsLoading(false);
  }, []);

  const fetchPerformance = useCallback(async () => {
    setPerfLoading(true);
    try {
      const res = await fetch('/api/forex/performance');
      const data = await res.json();
      if (data) setPerfStats(data);
    } catch { /* silent */ }
    setPerfLoading(false);
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/forex/alerts');
      const data = await res.json();
      if (data.alerts) setAlerts(data.alerts);
    } catch { /* silent */ }
  }, []);

  const analyzeSymbol = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/forex/signals?symbol=' + selectedSymbol + '&timeframe=' + timeframe);
      const data = await res.json();
      if (data.candles) setCandles(data.candles);
      if (data.indicators) setIndicators(data.indicators);
      if (data.strategyResults) setSignalResults(data.strategyResults);
      if (data.combinedSignal) setCombinedSignal(data.combinedSignal);

      if (data.combinedSignal && data.combinedSignal.confidence >= 70 && soundEnabled) {
        playAlert(data.combinedSignal.direction + ' ' + data.combinedSignal.symbol + ' ' + data.combinedSignal.confidence + '%');
      }
    } catch { /* silent */ }
    setIsAnalyzing(false);
  }, [selectedSymbol, timeframe, soundEnabled]);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    const timestamp = new Date().toLocaleTimeString();
    setScanLog(prev => [...prev, '[' + timestamp + '] Scanning ' + SYMBOLS.join(', ') + '...']);
    try {
      const res = await fetch('/api/forex/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: SYMBOLS, timeframe }),
      });
      const data = await res.json();
      let signalsFound = 0;
      if (data.results) {
        Object.entries(data.results).forEach(([sym, result]: [string, unknown]) => {
          const r = result as Record<string, unknown>;
          if (r.action === 'TRADE_OPENED') {
            const ts2 = new Date().toLocaleTimeString();
            setScanLog(prev => [...prev, '[' + ts2 + '] OPENED ' + r.direction + ' ' + sym + ' @ ' + r.entryPrice + ' (' + r.confidence + '%)']);
            toast({
              title: 'Trade Opened',
              description: r.direction + ' ' + sym + ' @ ' + r.entryPrice,
            });
          } else if (r.signal === true) {
            signalsFound++;
          } else if (r.skipped) {
            const ts3 = new Date().toLocaleTimeString();
            setScanLog(prev => [...prev, '[' + ts3 + '] ' + sym + ': ' + r.skipped]);
          }
        });
      }
      if (signalsFound > 0) {
        toast({
          title: 'Scan Complete',
          description: signalsFound + ' signal(s) found across ' + SYMBOLS.length + ' symbols',
        });
      }
    } catch (e) {
      const ts4 = new Date().toLocaleTimeString();
      setScanLog(prev => [...prev, '[' + ts4 + '] Error: ' + e]);
    }
    setIsScanning(false);
    fetchTrades();
  }, [timeframe, fetchTrades, toast]);

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

  const updateAgent = useCallback(async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/forex/agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.state) setAgentState(data.state);
    } catch { /* silent */ }
  }, []);

  const createTrade = async () => {
    setTradeSubmitting(true);
    try {
      const body = {
        symbol: tradeForm.symbol,
        direction: tradeForm.direction,
        lotSize: tradeForm.lotSize,
        entryPrice: parseFloat(tradeForm.entryPrice) || undefined,
        stopLoss: parseFloat(tradeForm.stopLoss) || undefined,
        takeProfit: parseFloat(tradeForm.takeProfit) || undefined,
        strategy: tradeForm.strategy,
      };
      const res = await fetch('/api/forex/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({
          title: 'Trade Created',
          description: tradeForm.direction + ' ' + tradeForm.symbol + ' @ ' + (body.entryPrice || 'market'),
        });
        setTradeDialogOpen(false);
        setTradeForm({
          symbol: 'EUR/USD', direction: 'BUY', lotSize: 0.1,
          entryPrice: '', stopLoss: '', takeProfit: '', strategy: 'Manual',
        });
        fetchTrades();
      }
    } catch { /* silent */ }
    setTradeSubmitting(false);
  };

  const createAlert = async () => {
    const price = parseFloat(newAlertPrice);
    if (!price || !newAlertSymbol) return;
    setAlertSubmitting(true);
    try {
      const res = await fetch('/api/forex/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newAlertSymbol, condition: newAlertCondition, price }),
      });
      if (res.ok) {
        toast({
          title: 'Alert Created',
          description: newAlertSymbol + ' ' + newAlertCondition + ' ' + price.toFixed(5),
        });
        setNewAlertPrice('');
        fetchAlerts();
      }
    } catch { /* silent */ }
    setAlertSubmitting(false);
  };

  const deleteAlert = async (id: string) => {
    try {
      await fetch('/api/forex/alerts?id=' + id, { method: 'DELETE' });
      fetchAlerts();
    } catch { /* silent */ }
  };

  // ==================== EFFECTS ====================
  useEffect(() => { fetchQuotes(); fetchAgentState(); fetchTrades(); }, [fetchQuotes, fetchAgentState, fetchTrades]);
  useEffect(() => { analyzeSymbol(); }, [selectedSymbol, timeframe, analyzeSymbol]);

  useEffect(() => {
    const interval = setInterval(fetchQuotes, 30000);
    return () => clearInterval(interval);
  }, [fetchQuotes]);

  // Auto-scan with configurable interval
  useEffect(() => {
    if (agentState?.isRunning && agentState.autoTrade) {
      scanIntervalRef.current = setInterval(() => { runScan(); }, scanInterval * 1000);
      return () => { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); };
    } else {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    }
  }, [agentState?.isRunning, agentState?.autoTrade, runScan, scanInterval]);

  // MT5 Bridge connection
  useEffect(() => {
    try {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.8.3/socket.io.min.js';
      script.onload = () => {
        const sock = (window as unknown as Record<string, unknown>).io('/?XTransformPort=3005');
        sock.on('connect', () => setMt5Connected(true));
        sock.on('disconnect', () => setMt5Connected(false));
        sock.on('mt5_status', (data: { connected: boolean }) => setMt5Connected(data.connected));
        sock.on('orders', (data: unknown[]) => setMt5Orders(data));
        sock.emit('get_orders');
      };
      document.head.appendChild(script);
    } catch { /* silent */ }
  }, []);

  // Toast for MT5 connect/disconnect
  useEffect(() => {
    if (mt5Connected && !prevMt5Ref.current) {
      toast({ title: 'MT5 Connected', description: 'Bridge connection established' });
    } else if (!mt5Connected && prevMt5Ref.current) {
      toast({ title: 'MT5 Disconnected', description: 'Bridge connection lost', variant: 'destructive' });
    }
    prevMt5Ref.current = mt5Connected;
  }, [mt5Connected, toast]);

  // Fetch news/perf/alerts when tab changes
  useEffect(() => {
    if (activeTab === 'news' && news.length === 0) fetchNews();
    if (activeTab === 'stats' && !perfStats) fetchPerformance();
    if (activeTab === 'trades') fetchAlerts();
  }, [activeTab, news.length, perfStats, fetchNews, fetchPerformance, fetchAlerts]);

  // News auto-refresh every 5 min
  useEffect(() => {
    if (activeTab !== 'news') return;
    const interval = setInterval(fetchNews, 300000);
    return () => clearInterval(interval);
  }, [activeTab, fetchNews]);

  // Set entry price when trade dialog opens
  useEffect(() => {
    if (tradeDialogOpen) {
      const price = quotes.find(q => q.displaySymbol === tradeForm.symbol)?.price;
      if (price) {
        setTradeForm(f => ({ ...f, entryPrice: price.toFixed(5) }));
      }
    }
  }, [tradeDialogOpen]);

  // ==================== RENDER HELPERS ====================
  const formatPrice = (p: number) => p.toFixed(5);
  const formatPnL = (p: number | null) => {
    if (p == null) return '\u2014';
    const v = +p.toFixed(2);
    return v >= 0 ? '+$' + v : '-$' + Math.abs(v);
  };
  const pnlColor = (p: number | null) => p == null ? 'text-muted-foreground' : p >= 0 ? 'text-emerald-400' : 'text-red-400';

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : quotes.find(q => q.displaySymbol === selectedSymbol)?.price || 0;
  const currentChange = quotes.find(q => q.displaySymbol === selectedSymbol)?.changePercent || 0;
  const openTrades = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status === 'CLOSED');

  const handleAgentToggle = (key: 'isRunning' | 'autoTrade', value: boolean) => {
    updateAgent({ [key]: value });
    if (key === 'isRunning') {
      toast({ title: value ? 'Agent Started' : 'Agent Stopped', description: value ? 'Scanning markets autonomously' : 'Agent paused' });
    } else {
      toast({ title: value ? 'Auto-Trade Enabled' : 'Auto-Trade Disabled', description: value ? 'Executing signals automatically' : 'Manual mode active' });
    }
  };

  // Settings content shared between Popover and Sheet
  const settingsContent = (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Active Strategies</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['RSI', 'MACD', 'Bollinger', 'Trend'] as const).map(s => (
            <label key={s} className="flex items-center gap-2 cursor-pointer rounded-md p-2 hover:bg-muted/50 transition-colors">
              <Checkbox
                checked={strategiesEnabled[s]}
                onCheckedChange={(checked) => {
                  const next = { ...strategiesEnabled, [s]: !!checked };
                  setStrategiesEnabled(next);
                  const activeStrats = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
                  updateAgent({ strategies: activeStrats.join(',') });
                }}
              />
              <span className={cn('text-xs font-medium', STRATEGY_COLORS[s])}>{s}</span>
            </label>
          ))}
        </div>
      </div>
      <Separator />
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Auto-Scan Interval</Label>
        <Select value={String(scanInterval)} onValueChange={(v) => {
          const val = parseInt(v, 10);
          setScanInterval(val);
        }}>
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCAN_INTERVALS.map(si => (
              <SelectItem key={si.value} value={String(si.value)} className="text-xs">{si.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Default Lot Size</Label>
        <Input
          type="number"
          min={0.01}
          max={1.00}
          step={0.01}
          value={defaultLotSize}
          onChange={e => setDefaultLotSize(parseFloat(e.target.value) || 0.01)}
          className="h-8 text-xs font-mono"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Max Concurrent Positions</Label>
        <Input
          type="number"
          min={1}
          max={10}
          step={1}
          value={maxConcurrent}
          onChange={e => setMaxConcurrent(parseInt(e.target.value, 10) || 1)}
          className="h-8 text-xs font-mono"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <audio ref={audioRef} className="hidden" />

      {/* ============ SETTINGS SHEET (Mobile only) ============ */}
      <div className="lg:hidden">
        <Sheet open={showSettings} onOpenChange={setShowSettings}>
          <SheetContent side="right" className="w-80">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Agent Settings
              </SheetTitle>
              <SheetDescription>Configure trading strategies and parameters</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">{settingsContent}</div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ============ NEW TRADE DIALOG ============ */}
      <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              New Trade
            </DialogTitle>
            <DialogDescription>Create a new manual trade entry</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1.5 block">Symbol</Label>
                <Select value={tradeForm.symbol} onValueChange={v => setTradeForm(f => ({ ...f, symbol: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYMBOLS.map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Strategy</Label>
                <Select value={tradeForm.strategy} onValueChange={v => setTradeForm(f => ({ ...f, strategy: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['RSI', 'MACD', 'Bollinger', 'Trend', 'Manual'].map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Direction</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTradeForm(f => ({ ...f, direction: 'BUY' }))}
                  className={cn(
                    'flex-1 h-10 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1.5',
                    tradeForm.direction === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
                  )}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  BUY
                </button>
                <button
                  onClick={() => setTradeForm(f => ({ ...f, direction: 'SELL' }))}
                  className={cn(
                    'flex-1 h-10 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1.5',
                    tradeForm.direction === 'SELL'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                      : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
                  )}
                >
                  <ArrowDownRight className="w-4 h-4" />
                  SELL
                </button>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Lot Size</Label>
              <Input
                type="number"
                min={0.01}
                max={1.00}
                step={0.01}
                value={tradeForm.lotSize}
                onChange={e => setTradeForm(f => ({ ...f, lotSize: parseFloat(e.target.value) || 0.01 }))}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Entry Price</Label>
                <Input
                  type="number"
                  step="0.00001"
                  value={tradeForm.entryPrice}
                  onChange={e => setTradeForm(f => ({ ...f, entryPrice: e.target.value }))}
                  className="h-9 text-xs font-mono"
                  placeholder="Market"
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Stop Loss</Label>
                <Input
                  type="number"
                  step="0.00001"
                  value={tradeForm.stopLoss}
                  onChange={e => setTradeForm(f => ({ ...f, stopLoss: e.target.value }))}
                  className="h-9 text-xs font-mono"
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Take Profit</Label>
                <Input
                  type="number"
                  step="0.00001"
                  value={tradeForm.takeProfit}
                  onChange={e => setTradeForm(f => ({ ...f, takeProfit: e.target.value }))}
                  className="h-9 text-xs font-mono"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTradeDialogOpen(false)} className="text-xs">Cancel</Button>
            <Button
              onClick={createTrade}
              disabled={tradeSubmitting}
              className={cn(
                'text-xs gap-1.5',
                tradeForm.direction === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              )}
            >
              {tradeSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {tradeForm.direction} {tradeForm.symbol}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ HEADER / TICKER STRIP ============ */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-base sm:text-lg tracking-tight">TRADING AGENT</span>
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
                <span className="hidden sm:inline">AUTO</span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={soundEnabled ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="h-8 w-8 p-0"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{soundEnabled ? 'Sound On' : 'Sound Off'}</TooltipContent>
            </Tooltip>

            {/* Settings: Popover on desktop (hidden on mobile), Sheet on mobile */}
            <div className="hidden lg:block">
              <Popover open={showSettings} onOpenChange={setShowSettings}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-1 mb-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Agent Settings
                    </h4>
                    <p className="text-xs text-muted-foreground">Configure strategies & parameters</p>
                  </div>
                  {settingsContent}
                </PopoverContent>
              </Popover>
            </div>
            <div className="lg:hidden">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>

            <div className={cn('flex items-center gap-1.5 text-xs', mt5Connected ? 'text-emerald-400' : 'text-red-400')}>
              {mt5Connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">MT5</span>
            </div>
          </div>
        </div>

        {/* Ticker Strip */}
        <div className="flex gap-0 overflow-x-auto px-3 pb-2 scrollbar-none">
          {quotes.map(q => (
            <button
              key={q.symbol}
              onClick={() => setSelectedSymbol(q.displaySymbol)}
              className={cn(
                'flex items-center gap-2 px-3 py-1 rounded-md text-xs font-mono whitespace-nowrap transition-all hover:bg-muted',
                selectedSymbol === q.displaySymbol ? 'bg-muted ring-1 ring-ring' : ''
              )}
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
        <div className="flex-1 flex flex-col min-w-0 lg:border-r border-b lg:border-b-0 border-border">
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
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-mono transition-all',
                    timeframe === tf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isAnalyzing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              <div className={cn('text-xl sm:text-2xl font-bold font-mono', currentChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatPrice(currentPrice)}
              </div>
              <span className={cn('text-xs font-mono hidden sm:inline', currentChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {currentChange >= 0 ? '+' : ''}{currentChange.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Candlestick Chart */}
          <div className="flex-1 p-2 sm:p-3 min-h-[300px] sm:min-h-[350px]">
            <CandlestickChart candles={candles} indicators={indicators} />
          </div>

          {/* Signal Analysis Panel */}
          <div className="border-t border-border px-3 py-3 bg-card/30">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Signal Analysis {'\u2014'} {selectedSymbol} {timeframe}</span>
            </div>

            {combinedSignal && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-lg p-3 mb-3',
                  combinedSignal.direction === 'BUY' ? 'glass-card glow-green' : 'glass-card glow-red'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {combinedSignal.direction === 'BUY'
                      ? <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                      : <ArrowDownRight className="w-5 h-5 text-red-400" />
                    }
                    <span className={cn(
                      'text-lg font-bold',
                      combinedSignal.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {String(combinedSignal.direction)}
                    </span>
                    <Badge variant="outline" className={cn(
                      combinedSignal.direction === 'BUY' ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
                    )}>
                      {String(combinedSignal.confidence)}% confidence
                    </Badge>
                  </div>
                  <Badge variant="secondary">{String(combinedSignal.strategy)}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div><span className="text-muted-foreground">Entry</span><br />{formatPrice(combinedSignal.entryPrice as number)}</div>
                  <div><span className="text-muted-foreground">SL</span><br /><span className="text-red-400">{formatPrice(combinedSignal.stopLoss as number)}</span></div>
                  <div><span className="text-muted-foreground">TP</span><br /><span className="text-emerald-400">{formatPrice(combinedSignal.takeProfit as number)}</span></div>
                </div>
                {combinedSignal.reason && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{String(combinedSignal.reason)}</p>
                )}
              </motion.div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-3">
              {signalResults.map((s, i) => (
                <div key={i} className={cn(
                  'rounded-md p-2 bg-muted/50 border-l-2',
                  s.hasSignal ? (s.direction === 'BUY' ? 'border-emerald-400' : 'border-red-400') : 'border-transparent'
                )}>
                  <div className="flex items-center justify-between">
                    <span className={cn('text-xs font-bold', STRATEGY_COLORS[s.strategy] || 'text-muted-foreground')}>{s.strategy}</span>
                    {s.hasSignal && (
                      <span className={cn('text-xs font-bold', s.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>
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

            {/* Price Alerts Section */}
            <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-md p-1.5 transition-colors">
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold">Price Alerts</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{alerts.filter(a => a.isActive && !a.triggered).length}</Badge>
                  <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', alertsOpen && 'rotate-90')} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2">
                  {/* Create Alert Form */}
                  <div className="flex items-center gap-2">
                    <Select value={newAlertSymbol} onValueChange={setNewAlertSymbol}>
                      <SelectTrigger className="w-[100px] h-7 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SYMBOLS.map(s => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newAlertCondition} onValueChange={setNewAlertCondition}>
                      <SelectTrigger className="w-[80px] h-7 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="above" className="text-xs">Above</SelectItem>
                        <SelectItem value="below" className="text-xs">Below</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.00001"
                      value={newAlertPrice}
                      onChange={e => setNewAlertPrice(e.target.value)}
                      placeholder="Price"
                      className="h-7 text-[10px] font-mono flex-1 min-w-0"
                    />
                    <Button
                      size="sm"
                      onClick={createAlert}
                      disabled={alertSubmitting || !newAlertPrice}
                      className="h-7 px-2 text-[10px]"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  {/* Active Alerts */}
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {alerts.filter(a => a.isActive && !a.triggered).map(a => (
                      <div key={a.id} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="font-semibold">{a.symbol}</span>
                          <span className={a.condition === 'above' ? 'text-emerald-400' : 'text-red-400'}>{a.condition}</span>
                          <span className="font-mono">{formatPrice(a.price)}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => deleteAlert(a.id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {alerts.filter(a => a.isActive && !a.triggered).length === 0 && (
                      <div className="text-[10px] text-muted-foreground text-center py-2">No active alerts</div>
                    )}
                  </div>
                  {/* Triggered Alerts */}
                  {alerts.filter(a => a.triggered).length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground font-semibold">Triggered</div>
                      {alerts.filter(a => a.triggered).slice(0, 3).map(a => (
                        <div key={a.id} className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5 opacity-50 line-through">
                          <div className="flex items-center gap-2 text-[10px]">
                            <span>{a.symbol}</span>
                            <span>{a.condition}</span>
                            <span className="font-mono">{formatPrice(a.price)}</span>
                          </div>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => deleteAlert(a.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* RIGHT: Tabs */}
        <div className="w-full lg:w-[420px] flex flex-col border-border overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-10 p-0">
              <TabsTrigger value="trades" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <BarChart3 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Trades</span><span className="sm:hidden">Trd</span>
              </TabsTrigger>
              <TabsTrigger value="stats" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <PieChart className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Stats</span><span className="sm:hidden">Sts</span>
              </TabsTrigger>
              <TabsTrigger value="agent" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <Brain className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Agent</span><span className="sm:hidden">Ag</span>
              </TabsTrigger>
              <TabsTrigger value="mt5" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <Radio className="w-3.5 h-3.5" /> <span className="hidden sm:inline">MT5</span><span className="sm:hidden">M5</span>
              </TabsTrigger>
              <TabsTrigger value="news" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <Newspaper className="w-3.5 h-3.5" /> <span className="hidden sm:inline">News</span><span className="sm:hidden">Nw</span>
              </TabsTrigger>
              <TabsTrigger value="log" className="rounded-none data-[state=active]:bg-muted data-[state=active]:shadow-none text-xs h-full flex-1 gap-1">
                <Clock className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log</span><span className="sm:hidden">Lg</span>
              </TabsTrigger>
            </TabsList>

            {/* TRADES TAB */}
            <TabsContent value="trades" className="flex-1 overflow-hidden flex flex-col m-0">
              {/* Stats bar */}
              {tradeStats && (
                <div className="grid grid-cols-4 gap-0 border-b border-border text-center">
                  {[
                    { label: 'Win Rate', value: tradeStats.winRate + '%', color: Number(tradeStats.winRate) >= 50 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Total P/L', value: formatPnL(tradeStats.totalPnL as number), color: (tradeStats.totalPnL as number) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Open', value: String(tradeStats.openPositions), color: 'text-foreground' },
                    { label: 'Closed', value: String(tradeStats.closedPositions), color: 'text-muted-foreground' },
                  ].map((s, i) => (
                    <div key={i} className="py-2 border-r border-border last:border-r-0">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                      <div className={cn('text-sm font-bold font-mono', s.color)}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Header with New Trade button */}
              <div className="px-3 py-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Open Positions ({openTrades.length})
                </div>
                <Button
                  size="sm"
                  onClick={() => setTradeDialogOpen(true)}
                  className="h-7 gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="w-3 h-3" /> New Trade
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto px-3">
                <div className="space-y-1">
                  {openTrades.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8">No open positions</div>
                  )}
                  {openTrades.map(t => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="glass-card rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <CircleDot className={cn('w-3 h-3', t.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')} fill="currentColor" />
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
                          <div className="text-red-400">{t.stopLoss ? formatPrice(t.stopLoss) : '\u2014'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">TP</span>
                          <div className="text-emerald-400">{t.takeProfit ? formatPrice(t.takeProfit) : '\u2014'}</div>
                        </div>
                      </div>
                      {t.strategy && <div className="text-[10px] text-muted-foreground mt-1">{t.strategy}</div>}
                    </motion.div>
                  ))}
                </div>

                {/* Recent Closed */}
                {closedTrades.length > 0 && (
                  <div className="mt-4 mb-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Closed</div>
                    <div className="space-y-1 pb-3">
                      {closedTrades.slice(0, 10).map(t => (
                        <div key={t.id} className="rounded-lg p-2 bg-muted/30 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{t.symbol}</span>
                            <span className={cn('text-xs', t.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{t.direction}</span>
                          </div>
                          <span className={cn('text-sm font-mono font-bold', pnlColor(t.pnl))}>{formatPnL(t.pnl)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* STATS TAB */}
            <TabsContent value="stats" className="flex-1 overflow-y-auto m-0 p-3 space-y-3">
              {perfLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-lg" />
                  ))}
                </div>
              ) : perfStats ? (
                <>
                  {/* Summary Cards 2x3 */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Win Rate', value: perfStats.winRate.toFixed(1) + '%', color: perfStats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400', icon: Trophy },
                      { label: 'Total P/L', value: formatPnL(perfStats.totalPnL), color: perfStats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400', icon: DollarSign },
                      { label: 'Profit Factor', value: perfStats.profitFactor.toFixed(2), color: perfStats.profitFactor >= 1.5 ? 'text-emerald-400' : perfStats.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400', icon: TrendingUp },
                      { label: 'Avg Win', value: '+$' + perfStats.avgWin.toFixed(2), color: 'text-emerald-400', icon: ArrowUpRight },
                      { label: 'Avg Loss', value: '-$' + perfStats.avgLoss.toFixed(2), color: 'text-red-400', icon: ArrowDownRight },
                      { label: 'Win Streak', value: perfStats.maxConsecutiveWins + ' / ' + perfStats.maxConsecutiveLosses, color: 'text-foreground', icon: Flame },
                    ].map((s, i) => (
                      <div key={i} className="glass-card rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <s.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
                        </div>
                        <div className={cn('text-base font-bold font-mono', s.color)}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Largest Win/Loss */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="glass-card rounded-lg p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Largest Win</div>
                      <div className="text-base font-bold font-mono text-emerald-400">+${perfStats.largestWin.toFixed(2)}</div>
                    </div>
                    <div className="glass-card rounded-lg p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Largest Loss</div>
                      <div className="text-base font-bold font-mono text-red-400">-${perfStats.largestLoss.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Equity Curve */}
                  {perfStats.equityCurve && perfStats.equityCurve.length > 1 && (
                    <Card className="glass-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-2">
                          <LineChart className="w-3.5 h-3.5" />
                          Equity Curve
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <div className="h-[120px]">
                          <EquityCurveChart data={perfStats.equityCurve} />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Daily P/L */}
                  {perfStats.dailyBreakdown && perfStats.dailyBreakdown.length > 0 && (
                    <Card className="glass-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5" />
                          Daily P/L (Last 7 Days)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3">
                        <div className="flex items-end gap-2 h-[80px]">
                          {perfStats.dailyBreakdown.slice(-7).map((d, i) => {
                            const maxPnl = Math.max(...perfStats.dailyBreakdown.slice(-7).map(x => Math.abs(x.pnl)));
                            const h = maxPnl > 0 ? (Math.abs(d.pnl) / maxPnl) * 60 : 4;
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <span className={cn('text-[9px] font-mono font-bold', d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(0)}
                                </span>
                                <div
                                  className={cn('w-full rounded-sm min-h-[4px]', d.pnl >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60')}
                                  style={{ height: Math.max(4, h) + 'px' }}
                                />
                                <span className="text-[8px] text-muted-foreground">
                                  {d.date.slice(5)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Strategy Breakdown Table */}
                  {perfStats.strategyBreakdown && perfStats.strategyBreakdown.length > 0 && (
                    <Card className="glass-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-2">
                          <Hash className="w-3.5 h-3.5" />
                          Strategy Breakdown
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left p-2 text-muted-foreground font-medium">Strategy</th>
                                <th className="text-center p-2 text-muted-foreground font-medium">Trades</th>
                                <th className="text-center p-2 text-muted-foreground font-medium">Win %</th>
                                <th className="text-right p-2 text-muted-foreground font-medium">P/L</th>
                              </tr>
                            </thead>
                            <tbody>
                              {perfStats.strategyBreakdown.map((s, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                  <td className={cn('p-2 font-semibold', STRATEGY_COLORS[s.strategy] || 'text-foreground')}>{s.strategy}</td>
                                  <td className="p-2 text-center font-mono">{s.trades}</td>
                                  <td className={cn('p-2 text-center font-mono font-bold', s.winRate >= 50 ? 'text-emerald-400' : 'text-red-400')}>
                                    {s.winRate.toFixed(0)}%
                                  </td>
                                  <td className={cn('p-2 text-right font-mono font-bold', s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                    {formatPnL(s.pnl)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <div className="text-center text-xs text-muted-foreground py-8">No performance data available</div>
              )}
            </TabsContent>

            {/* AGENT TAB */}
            <TabsContent value="agent" className="flex-1 overflow-y-auto m-0 p-3 space-y-3">
              {/* Risk Exposure Meter */}
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Gauge className="w-4 h-4" />
                    Risk Exposure
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-2">
                    <RiskGauge
                      current={openTrades.length}
                      max={maxConcurrent}
                      lotExposure={openTrades.reduce((sum, t) => sum + t.lotSize, 0)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-center mt-2">
                    <div className="rounded-md bg-muted/30 p-2">
                      <div className="text-muted-foreground">Positions</div>
                      <div className="font-mono font-bold">{openTrades.length} / {maxConcurrent}</div>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <div className="text-muted-foreground">Lot Exposure</div>
                      <div className="font-mono font-bold">{openTrades.reduce((s, t) => s + t.lotSize, 0).toFixed(2)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                      onClick={() => handleAgentToggle('isRunning', !agentState?.isRunning)}
                      className="gap-1"
                    >
                      {agentState?.isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {agentState?.isRunning ? 'Stop' : 'Start'}
                    </Button>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Auto-Trade</div>
                      <div className="text-xs text-muted-foreground">{agentState?.autoTrade ? 'Executing signals automatically' : 'Manual mode \u2014 signals only'}</div>
                    </div>
                    <Switch
                      checked={agentState?.autoTrade || false}
                      onCheckedChange={(v) => handleAgentToggle('autoTrade', v)}
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
                      onChange={e => updateAgent({ balance: Number(e.target.value) })}
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
                      onChange={e => updateAgent({ maxRiskPercent: Number(e.target.value) })}
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
                      onChange={e => updateAgent({ dailyRiskLimit: Number(e.target.value) })}
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
                      onChange={e => updateAgent({ maxDrawdownPercent: Number(e.target.value) })}
                      className="w-full h-1.5 accent-red-400"
                    />
                  </div>
                </CardContent>
              </Card>

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
                    <Badge variant="outline" className={cn(
                      'ml-auto',
                      mt5Connected ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
                    )}>
                      {mt5Connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mt5Orders.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {mt5Orders.map((o: Record<string, unknown>, i: number) => (
                        <div key={i} className={cn(
                          'rounded-lg p-2 bg-muted/30',
                          o.status === 'OPEN' ? 'border-l-2 border-primary' : 'opacity-50'
                        )}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CircleDot className={cn('w-2.5 h-2.5', o.type === 'BUY' ? 'text-emerald-400' : 'text-red-400')} fill="currentColor" />
                              <span className="text-sm font-bold">{String(o.symbol)}</span>
                              <Badge variant="outline" className={cn(
                                'text-[10px]',
                                o.type === 'BUY' ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
                              )}>
                                {String(o.type)} {String(o.lots)}
                              </Badge>
                            </div>
                            <span className={cn('text-xs font-mono font-bold', (o.profit as number) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
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

            {/* NEWS TAB */}
            <TabsContent value="news" className="flex-1 overflow-y-auto m-0 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-primary" />
                  Forex News
                </div>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]" onClick={fetchNews}>
                  <RefreshCw className={cn('w-3 h-3', newsLoading && 'animate-spin')} />
                  Refresh
                </Button>
              </div>

              {newsLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : news.length > 0 ? (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {news.map((item, i) => (
                    <motion.a
                      key={i}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="block rounded-lg p-3 bg-muted/30 hover:bg-muted/60 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {item.snippet && (
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{item.snippet}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {item.source && <span className="text-[9px] font-semibold text-amber-400">{item.source}</span>}
                        {item.date && <span className="text-[9px] text-muted-foreground">{item.date}</span>}
                      </div>
                    </motion.a>
                  ))}
                </div>
              ) : (
                <div className="text-center text-xs text-muted-foreground py-8">
                  No news available. Click refresh to load.
                </div>
              )}
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
      <footer className="mt-auto border-t border-border bg-card/50 backdrop-blur-xl px-3 sm:px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-muted-foreground gap-1 sm:gap-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <span>Balance: <strong className="text-foreground">${agentState?.balance?.toLocaleString() || '1,000'}</strong></span>
          <Separator orientation="vertical" className="h-3 hidden sm:block" />
          <span>Strategies: <strong className="text-foreground">{agentState?.strategies || 'RSI,MACD,Bollinger'}</strong></span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <span>TF: <strong className="text-foreground">{timeframe}</strong></span>
          <Separator orientation="vertical" className="h-3 hidden sm:block" />
          <span>Scan: <strong className="text-foreground">{SCAN_INTERVALS.find(si => si.value === scanInterval)?.label || '2m'}</strong></span>
          <Separator orientation="vertical" className="h-3 hidden sm:block" />
          <span>Last: <strong className="text-foreground">{agentState?.lastScanAt ? new Date(agentState.lastScanAt).toLocaleTimeString() : 'Never'}</strong></span>
        </div>
      </footer>
    </div>
  );
}

// ==================== RISK GAUGE COMPONENT ====================
function RiskGauge({ current, max, lotExposure }: { current: number; max: number; lotExposure: number }) {
  const ratio = max > 0 ? Math.min(current / max, 1) : 0;
  const color = ratio < 0.5 ? '#22c55e' : ratio < 0.8 ? '#f59e0b' : '#ef4444';
  const angle = -135 + ratio * 270;
  const radians = (angle * Math.PI) / 180;
  const cx = 60;
  const cy = 60;
  const r = 42;
  const x = cx + r * Math.cos(radians);
  const y = cy + r * Math.sin(radians);

  return (
    <svg width="120" height="80" viewBox="0 0 120 80">
      {/* Background arc */}
      <path
        d="M 18 60 A 42 42 0 0 1 102 60"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Green zone */}
      <path
        d="M 18 60 A 42 42 0 0 1 60 18"
        fill="none"
        stroke="rgba(34,197,94,0.2)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Amber zone */}
      <path
        d="M 60 18 A 42 42 0 0 1 94 36"
        fill="none"
        stroke="rgba(245,158,11,0.2)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Red zone */}
      <path
        d="M 94 36 A 42 42 0 0 1 102 60"
        fill="none"
        stroke="rgba(239,68,68,0.2)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={color} />
      {/* Labels */}
      <text x="14" y="75" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">LOW</text>
      <text x="48" y="14" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">MED</text>
      <text x="88" y="75" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">HIGH</text>
      {/* Center value */}
      <text x={cx} y={cy + 18} fill={color} fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        {lotExposure.toFixed(2)} lots
      </text>
    </svg>
  );
}

// ==================== EQUITY CURVE CHART ====================
function EquityCurveChart({ data }: { data: { date: string; equity: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const container = canvas.parentElement;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 8, right: 4, bottom: 16, left: 4 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const values = data.map(d => d.equity);
    const minV = Math.min(...values) * 0.998;
    const maxV = Math.max(...values) * 1.002;
    const rangeV = maxV - minV || 1;

    const toX = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
    const toY = (v: number) => PAD.top + (1 - (v - minV) / rangeV) * chartH;

    // Fill area
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].equity));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(data[i].equity));
    }
    ctx.lineTo(toX(data.length - 1), H - PAD.bottom);
    ctx.lineTo(toX(0), H - PAD.bottom);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    if (data[data.length - 1].equity >= data[0].equity) {
      grad.addColorStop(0, 'rgba(34,197,94,0.15)');
      grad.addColorStop(1, 'rgba(34,197,94,0.01)');
    } else {
      grad.addColorStop(0, 'rgba(239,68,68,0.15)');
      grad.addColorStop(1, 'rgba(239,68,68,0.01)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].equity));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(data[i].equity));
    }
    ctx.strokeStyle = data[data.length - 1].equity >= data[0].equity ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // End dot
    const lastX = toX(data.length - 1);
    const lastY = toY(data[data.length - 1].equity);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = data[data.length - 1].equity >= data[0].equity ? '#22c55e' : '#ef4444';
    ctx.fill();

  }, [data]);

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// ==================== ENHANCED CANDLESTICK CHART COMPONENT ====================
function CandlestickChart({ candles, indicators }: { candles: CandleData[]; indicators: IndicatorData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);
  const mouseRef = useRef({ x: -1, y: -1 });
  const [hoverInfo, setHoverInfo] = useState<{
    candle: CandleData | null;
    x: number;
    y: number;
  } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current = { x, y };

    const PAD = { top: 10, right: 60, bottom: 24, left: 4 };
    const chartW = rect.width - PAD.left - PAD.right;
    const candleW = chartW / candles.length;
    const idx = Math.floor((x - PAD.left) / candleW);
    if (idx >= 0 && idx < candles.length) {
      setHoverInfo({ candle: candles[idx], x, y });
    } else {
      setHoverInfo(null);
    }
  }, [candles]);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1, y: -1 };
    setHoverInfo(null);
  }, []);

  // Track container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Reserve space for volume bars (15%) and RSI sub-chart (60px)
    const volumeH = rect.height * 0.15;
    const rsiH = 60;
    const mainChartH = rect.height - volumeH - rsiH;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 10, right: 60, bottom: 0, left: 4 };
    const chartW = W - PAD.left - PAD.right;

    // === MAIN CHART ===
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

    const priceToY = (p: number) => PAD.top + (1 - (p - minP) / range) * mainChartH;
    const yToPrice = (y: number) => minP + (1 - (y - PAD.top) / mainChartH) * range;

    // Clear
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, W, H);

    // Grid lines (main chart)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
      const y = PAD.top + (i / gridLines) * mainChartH;
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
      { key: 'ema21', color: 'rgba(6,182,212,0.6)' },
      { key: 'ema50', color: 'rgba(245,158,11,0.5)' },
    ];
    for (const { key, color } of emaConfigs) {
      if (!indicators[key]) continue;
      const y = priceToY(indicators[key]!);
      if (y >= PAD.top && y <= PAD.top + mainChartH) {
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

      ctx.fillStyle = lastPrice >= candles[candles.length - 1].open ? '#22c55e' : '#ef4444';
      ctx.fillRect(W - PAD.right, y - 9, PAD.right, 18);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(lastPrice.toFixed(5), W - PAD.right + 4, y + 3);
    }

    // === CROSSHAIR ===
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    if (mx > PAD.left && mx < W - PAD.right && my > PAD.top && my < PAD.top + mainChartH) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      // Vertical
      ctx.beginPath();
      ctx.moveTo(mx, PAD.top);
      ctx.lineTo(mx, PAD.top + mainChartH);
      ctx.stroke();
      // Horizontal
      ctx.beginPath();
      ctx.moveTo(PAD.left, my);
      ctx.lineTo(W - PAD.right, my);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price label on Y axis
      const crossPrice = yToPrice(my);
      ctx.fillStyle = 'rgba(100,100,100,0.9)';
      ctx.fillRect(W - PAD.right, my - 9, PAD.right, 18);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(crossPrice.toFixed(5), W - PAD.right + 4, my + 3);
    }

    // === VOLUME BARS ===
    const volumeTop = PAD.top + mainChartH + 4;
    const maxVol = Math.max(...candles.map(c => c.volume), 1);
    const volumeChartH = volumeH - 8;

    // Separator
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top + mainChartH + 2);
    ctx.lineTo(W - PAD.right, PAD.top + mainChartH + 2);
    ctx.stroke();

    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'left';
    ctx.fillText('VOL', W - PAD.right + 4, volumeTop + volumeChartH / 2 + 3);

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = PAD.left + i * candleW + candleW / 2;
      const isUp = c.close >= c.open;
      const barH = (c.volume / maxVol) * volumeChartH;
      ctx.fillStyle = isUp ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
      ctx.fillRect(x - bodyW / 2, volumeTop + volumeChartH - barH, bodyW, barH);
    }

    // === RSI SUB-CHART ===
    const rsiTop = volumeTop + volumeH + 2;

    // RSI separator
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, rsiTop);
    ctx.lineTo(W - PAD.right, rsiTop);
    ctx.stroke();

    // RSI label
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'left';
    ctx.fillText('RSI', W - PAD.right + 4, rsiTop + 10);

    if (indicators.rsi !== undefined) {
      const rsiChartH = rsiH - 12;
      const rsiToY = (v: number) => rsiTop + 6 + (1 - v / 100) * rsiChartH;

      // Color zones
      // Overbought zone (70-100) - red
      ctx.fillStyle = 'rgba(239,68,68,0.06)';
      ctx.fillRect(PAD.left, rsiToY(100), chartW, rsiToY(70) - rsiToY(100));
      // Oversold zone (0-30) - green
      ctx.fillStyle = 'rgba(34,197,94,0.06)';
      ctx.fillRect(PAD.left, rsiToY(30), chartW, rsiToY(0) - rsiToY(30));

      // Level lines
      [30, 50, 70].forEach(level => {
        const ly = rsiToY(level);
        ctx.strokeStyle = level === 50 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, ly);
        ctx.lineTo(W - PAD.right, ly);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Level labels
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.textAlign = 'left';
      ctx.fillText('70', W - PAD.right + 4, rsiToY(70) + 3);
      ctx.fillText('30', W - PAD.right + 4, rsiToY(30) + 3);

      // RSI line as a bar fill from 50
      const rsiVal = indicators.rsi;
      const rsiY = rsiToY(rsiVal);
      const rsi50Y = rsiToY(50);
      const barTop = Math.min(rsiY, rsi50Y);
      const barHeight = Math.abs(rsiY - rsi50Y);

      ctx.fillStyle = rsiVal > 70 ? 'rgba(239,68,68,0.5)' : rsiVal < 30 ? 'rgba(34,197,94,0.5)' : 'rgba(168,85,247,0.3)';
      ctx.fillRect(PAD.left + chartW / 2 - 20, barTop, 40, barHeight);

      // RSI value text
      ctx.fillStyle = rsiVal > 70 ? '#ef4444' : rsiVal < 30 ? '#22c55e' : 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(rsiVal.toFixed(1), PAD.left + chartW / 2, barTop - 4);
    }

    // Time labels
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const timeStep = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += timeStep) {
      const x = PAD.left + i * candleW + candleW / 2;
      const d = new Date(candles[i].time);
      ctx.fillText(d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'), x, H - 2);
    }

  }, [candles, indicators]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {candles.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <Skeleton className="w-full h-full rounded-lg" />
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
          {/* Hover tooltip */}
          <AnimatePresence>
            {hoverInfo?.candle && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute pointer-events-none z-10 bg-card/95 backdrop-blur-sm border border-border rounded-md px-3 py-2 shadow-lg"
                style={{
                  left: Math.min(hoverInfo.x + 12, containerWidth - 180),
                  top: Math.max(10, hoverInfo.y - 60),
                }}
              >
                <div className="text-[10px] font-mono space-y-0.5">
                  <div className="text-muted-foreground">
                    {new Date(hoverInfo.candle.time).toLocaleDateString()} {new Date(hoverInfo.candle.time).toLocaleTimeString()}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3">
                    <span className="text-muted-foreground">O:</span>
                    <span className={hoverInfo.candle.close >= hoverInfo.candle.open ? 'text-emerald-400' : 'text-red-400'}>
                      {hoverInfo.candle.open.toFixed(5)}
                    </span>
                    <span className="text-muted-foreground">H:</span>
                    <span className="text-foreground">{hoverInfo.candle.high.toFixed(5)}</span>
                    <span className="text-muted-foreground">L:</span>
                    <span className="text-foreground">{hoverInfo.candle.low.toFixed(5)}</span>
                    <span className="text-muted-foreground">C:</span>
                    <span className={hoverInfo.candle.close >= hoverInfo.candle.open ? 'text-emerald-400' : 'text-red-400'}>
                      {hoverInfo.candle.close.toFixed(5)}
                    </span>
                    <span className="text-muted-foreground">Vol:</span>
                    <span className="text-foreground">{hoverInfo.candle.volume.toLocaleString()}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
