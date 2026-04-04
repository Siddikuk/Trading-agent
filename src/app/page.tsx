'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Activity, Settings, Wifi, WifiOff, Volume2, VolumeX, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

// Trading components
import CandlestickChart, { type CandleData, type IndicatorData } from '@/components/trading/CandlestickChart';
import TickerStrip from '@/components/trading/TickerStrip';
import SettingsDialog from '@/components/trading/SettingsDialog';
import MT5SetupWizard from '@/components/trading/MT5SetupWizard';
import NewTradeDialog from '@/components/trading/NewTradeDialog';
import SignalAnalysis from '@/components/trading/SignalAnalysis';
import PriceAlerts from '@/components/trading/PriceAlerts';
import AgentTab from '@/components/trading/AgentTab';
import TradesTab from '@/components/trading/TradesTab';
import MT5Tab from '@/components/trading/MT5Tab';
import NewsTab from '@/components/trading/NewsTab';
import StatsTab from '@/components/trading/StatsTab';
import ScanLog from '@/components/trading/ScanLog';
import Footer from '@/components/trading/Footer';
import type { Quote, Trade, AgentState, SignalResult, AIAnalysis, NewsItem, PriceAlert, PerformanceStats, MT5Account, MT5Position, DataSource } from '@/components/trading/types';
import { SYMBOLS, TIMEFRAMES } from '@/components/trading/types';

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
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeStats, setTradeStats] = useState<Record<string, unknown> | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('trades');
  const [showSettings, setShowSettings] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Settings state
  const [strategiesEnabled, setStrategiesEnabled] = useState({ RSI: true, MACD: true, Bollinger: true, Trend: true });
  const [scanInterval, setScanInterval] = useState(120);
  const [defaultLotSize, setDefaultLotSize] = useState(0.1);
  const [maxConcurrent, setMaxConcurrent] = useState(3);

  // MT5 state
  const [mt5BridgeUrl, setMt5BridgeUrl] = useState<string | null>(null);
  const [mt5Connected, setMt5Connected] = useState(false);
  const [mt5Account, setMt5Account] = useState<MT5Account | null>(null);
  const [mt5Positions, setMt5Positions] = useState<MT5Position[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const mt5ConnectingRef = useRef(false);

  // News / perf / alerts state
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [newAlertSymbol, setNewAlertSymbol] = useState('EUR/USD');
  const [newAlertCondition, setNewAlertCondition] = useState('above');
  const [newAlertPrice, setNewAlertPrice] = useState('');
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeForm, setTradeForm] = useState({ symbol: 'EUR/USD', direction: 'BUY', lotSize: 0.1, entryPrice: '', stopLoss: '', takeProfit: '', strategy: 'Manual' });
  const [tradeSubmitting, setTradeSubmitting] = useState(false);

  // ==================== MT5 BRIDGE CONNECTION ====================
  // All MT5 communication goes through server-side API proxy (no direct WebSocket from browser)
  // This avoids HTTPS → ws:// mixed content security errors

  const testMT5Connection = useCallback(async (url: string): Promise<boolean> => {
    try {
      // Save URL to server-side config first
      await fetch('/api/forex/mt5/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      // Then test the connection via server-side proxy
      const r = await fetch('/api/forex/mt5/config');
      const d = await r.json();
      return d.connected === true;
    } catch {
      return false;
    }
  }, []);

  // Initialize MT5 from localStorage and auto-test on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('mt5_bridge_url');
    if (savedUrl) {
      setMt5BridgeUrl(savedUrl);
      // Auto-test connection via server proxy
      testMT5Connection(savedUrl).then(ok => setMt5Connected(ok));
    }
  }, [testMT5Connection]);

  const fetchMT5Data = useCallback(async () => {
    if (!mt5BridgeUrl) return;
    try {
      const headers = { 'X-MT5-Bridge-Url': mt5BridgeUrl };
      const [accRes, posRes] = await Promise.allSettled([
        fetch('/api/forex/mt5/account', { headers }),
        fetch('/api/forex/mt5/positions', { headers }),
      ]);
      if (accRes.status === 'fulfilled' && accRes.value.ok) {
        const accData = await accRes.value.json();
        if (accData.balance !== undefined) {
          setMt5Account(accData);
          setMt5Connected(true);
        }
      }
      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const posData = await posRes.value.json();
        if (posData.positions) setMt5Positions(posData.positions);
      }
    } catch {}
  }, [mt5BridgeUrl]);

  // Auto-refresh MT5 data every 5s when connected
  useEffect(() => {
    if (!mt5Connected) return;
    const interval = setInterval(fetchMT5Data, 5000);
    return () => clearInterval(interval);
  }, [mt5Connected, fetchMT5Data]);

  // ==================== DATA FETCHING ====================
  const fetchQuotes = useCallback(async () => {
    try {
      const r = await fetch('/api/forex/market');
      const d = await r.json();
      if (d.data) setQuotes(d.data);
      if (d.dataSource) setDataSource(d.dataSource as DataSource);
    } catch {}
  }, []);

  const fetchAgentState = useCallback(async () => { try { const r = await fetch('/api/forex/agent'); const d = await r.json(); if (d.state) setAgentState(d.state); } catch {} }, []);
  const fetchTrades = useCallback(async () => { try { const r = await fetch('/api/forex/trades'); const d = await r.json(); if (d.trades) setTrades(d.trades); if (d.stats) setTradeStats(d.stats); } catch {} }, []);
  const fetchNews = useCallback(async () => { setNewsLoading(true); try { const r = await fetch('/api/forex/news'); const d = await r.json(); if (d.results) setNews(d.results); } catch {} setNewsLoading(false); }, []);
  const fetchPerformance = useCallback(async () => { setPerfLoading(true); try { const r = await fetch('/api/forex/performance'); const d = await r.json(); if (d) setPerfStats(d); } catch {} setPerfLoading(false); }, []);
  const fetchAlerts = useCallback(async () => { try { const r = await fetch('/api/forex/alerts'); const d = await r.json(); if (d.alerts) setAlerts(d.alerts); } catch {} }, []);

  // Fast mechanical analysis (instant — for chart + indicators)
  const analyzeSymbol = useCallback(async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const r = await fetch('/api/forex/signals?symbol=' + selectedSymbol + '&timeframe=' + timeframe);
      const d = await r.json();
      if (d.candles) setCandles(d.candles);
      if (d.indicators) setIndicators(d.indicators);
      if (d.strategyResults) setSignalResults(d.strategyResults);
      if (d.combinedSignal) setCombinedSignal(d.combinedSignal);
      if (d.combinedSignal && d.combinedSignal.confidence >= 70 && soundEnabled) playAlert(d.combinedSignal.direction + ' ' + d.combinedSignal.symbol + ' ' + d.combinedSignal.confidence + '%');
    } catch {}
    setIsAnalyzing(false);
  }, [selectedSymbol, timeframe, soundEnabled]);

  // Slow AI analysis (10-30s — LLM reasoning with news/sentiment)
  const analyzeSymbolWithAI = useCallback(async (symbol: string, tf: string) => {
    setIsAIAnalyzing(true);
    setAiAnalysis(null);
    if (aiAbortRef.current) aiAbortRef.current.abort();
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    try {
      const r = await fetch('/api/forex/signals?symbol=' + symbol + '&timeframe=' + tf + '&ai=true', { signal: ctrl.signal });
      const d = await r.json();
      if (d.aiAnalysis) {
        setAiAnalysis(d.aiAnalysis);
        if (d.combinedSignal) setCombinedSignal(d.combinedSignal);
        if (d.aiAnalysis.shouldTrade && d.aiAnalysis.confidence >= 70 && soundEnabled) {
          playAlert('AI ' + d.aiAnalysis.direction + ' ' + symbol + ' ' + d.aiAnalysis.confidence + '% confidence');
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error('AI analysis failed:', e);
    }
    setIsAIAnalyzing(false);
  }, [soundEnabled]);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    const ts = new Date().toLocaleTimeString();
    setScanLog(p => [...p, '[' + ts + '] Scanning ' + SYMBOLS.join(', ') + '...']);
    try {
      const r = await fetch('/api/forex/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbols: SYMBOLS, timeframe }) });
      const d = await r.json();
      let found = 0;
      if (d.results) {
        Object.entries(d.results).forEach(([sym, result]: [string, unknown]) => {
          const rv = result as Record<string, unknown>;
          const t = new Date().toLocaleTimeString();
          if (rv.action === 'TRADE_OPENED') {
            setScanLog(p => [...p, '[' + t + '] AI OPENED ' + rv.direction + ' ' + sym + ' @ ' + rv.entryPrice + ' (' + rv.confidence + '%)']);
            if (rv.reasoning) setScanLog(p => [...p, '  Reasoning: ' + String(rv.reasoning).slice(0, 200)]);
            toast({ title: 'AI Trade Opened', description: rv.direction + ' ' + sym + ' @ ' + rv.entryPrice });
          } else if (rv.action === 'SIGNAL_ONLY') { found++; setScanLog(p => [...p, '[' + t + '] SIGNAL: ' + rv.direction + ' ' + sym + ' (' + rv.confidence + '%)']); }
          else if (rv.action === 'HOLD') { setScanLog(p => [...p, '[' + t + '] ' + sym + ': HOLD']); }
        });
      }
      if (found > 0) toast({ title: 'Scan Complete', description: found + ' signal(s) found' });
    } catch (e) { setScanLog(p => [...p, '[' + new Date().toLocaleTimeString() + '] Error: ' + e]); }
    setIsScanning(false);
    fetchTrades();
  }, [timeframe, fetchTrades, toast]);

  const playAlert = async (text: string) => {
    try {
      const r = await fetch('/api/forex/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 1024) }) });
      if (r.ok) { const b = await r.blob(); const u = URL.createObjectURL(b); if (audioRef.current) { audioRef.current.src = u; audioRef.current.play().catch(() => {}); } }
    } catch {}
  };

  const updateAgent = useCallback(async (u: Record<string, unknown>) => { try { const r = await fetch('/api/forex/agent', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) }); const d = await r.json(); if (d.state) setAgentState(d.state); } catch {} }, []);

  const createTrade = async () => {
    setTradeSubmitting(true);
    try {
      const body = { symbol: tradeForm.symbol, direction: tradeForm.direction, lotSize: tradeForm.lotSize, entryPrice: parseFloat(tradeForm.entryPrice) || undefined, stopLoss: parseFloat(tradeForm.stopLoss) || undefined, takeProfit: parseFloat(tradeForm.takeProfit) || undefined, strategy: tradeForm.strategy };
      const r = await fetch('/api/forex/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) { toast({ title: 'Trade Created', description: tradeForm.direction + ' ' + tradeForm.symbol }); setTradeDialogOpen(false); setTradeForm({ symbol: 'EUR/USD', direction: 'BUY', lotSize: 0.1, entryPrice: '', stopLoss: '', takeProfit: '', strategy: 'Manual' }); fetchTrades(); }
    } catch {}
    setTradeSubmitting(false);
  };

  const createAlert = async () => {
    const price = parseFloat(newAlertPrice); if (!price) return;
    setAlertSubmitting(true);
    try { const r = await fetch('/api/forex/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: newAlertSymbol, condition: newAlertCondition, price }) }); if (r.ok) { toast({ title: 'Alert Created', description: newAlertSymbol + ' ' + newAlertCondition + ' ' + price.toFixed(5) }); setNewAlertPrice(''); fetchAlerts(); } } catch {}
    setAlertSubmitting(false);
  };

  const deleteAlert = async (id: string) => { try { await fetch('/api/forex/alerts?id=' + id, { method: 'DELETE' }); fetchAlerts(); } catch {} };

  // ==================== MT5 HANDLERS ====================
  const handleSetBridgeUrl = useCallback(async (url: string) => {
    // Save to localStorage
    localStorage.setItem('mt5_bridge_url', url);
    setMt5BridgeUrl(url);
    mt5ConnectingRef.current = true;
    toast({ title: 'MT5 Bridge', description: 'Testing connection...' });

    // Test connection via server-side proxy
    const ok = await testMT5Connection(url);
    mt5ConnectingRef.current = false;
    if (ok) {
      setMt5Connected(true);
      toast({ title: 'MT5 Bridge', description: 'Connected! Live data flowing.' });
      fetchMT5Data(); // Fetch account + positions immediately
      fetchQuotes();   // Refresh quotes with MT5 data
    } else {
      setMt5Connected(false);
      toast({ title: 'MT5 Bridge', description: 'Connection failed. Check your VPS bridge.', variant: 'destructive' });
    }
  }, [testMT5Connection, fetchMT5Data, fetchQuotes, toast]);

  const handleTestBridge = useCallback(async () => {
    toast({ title: 'MT5 Bridge', description: 'Testing...' });
    const ok = await testMT5Connection(mt5BridgeUrl || '');
    if (ok) {
      setMt5Connected(true);
      toast({ title: 'MT5 Bridge', description: 'Connection successful!' });
    } else {
      setMt5Connected(false);
      toast({ title: 'MT5 Bridge', description: 'Connection failed', variant: 'destructive' });
    }
  }, [testMT5Connection, mt5BridgeUrl, toast]);

  const handleMT5Connect = useCallback((url: string) => {
    handleSetBridgeUrl(url);
  }, [handleSetBridgeUrl]);

  const handleMT5Disconnect = useCallback(async () => {
    // Clear server-side config
    try {
      await fetch('/api/forex/mt5/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: null }),
      });
    } catch {}
    localStorage.removeItem('mt5_bridge_url');
    setMt5BridgeUrl(null);
    setMt5Connected(false);
    setMt5Account(null);
    setMt5Positions([]);
    toast({ title: 'MT5 Bridge', description: 'Disconnected' });
  }, [toast]);

  const handleMT5ClosePosition = useCallback(async (ticket: number) => {
    try {
      const r = await fetch('/api/forex/mt5/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MT5-Bridge-Url': mt5BridgeUrl || '' },
        body: JSON.stringify({ ticket }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: 'Position Closed', description: `Ticket #${ticket} · $${(d.profit ?? 0).toFixed(2)}` });
        fetchMT5Data();
      } else {
        toast({ title: 'Close Failed', description: d.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to close position', variant: 'destructive' });
    }
  }, [fetchMT5Data, toast]);

  const handleMT5CloseAll = useCallback(async () => {
    try {
      const r = await fetch('/api/forex/mt5/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MT5-Bridge-Url': mt5BridgeUrl || '' },
        body: JSON.stringify({ symbol: 'ALL', type: 'ALL' }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: 'All Positions Closed' });
        fetchMT5Data();
      } else {
        toast({ title: 'Close Failed', description: d.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to close positions', variant: 'destructive' });
    }
  }, [fetchMT5Data, toast]);

  // ==================== EFFECTS ====================
  useEffect(() => { fetchQuotes(); fetchAgentState(); fetchTrades(); }, [fetchQuotes, fetchAgentState, fetchTrades]);
  useEffect(() => { analyzeSymbol(); }, [selectedSymbol, timeframe, analyzeSymbol]);
  useEffect(() => { analyzeSymbolWithAI(selectedSymbol, timeframe); }, [selectedSymbol, timeframe]);
  useEffect(() => { const i = setInterval(fetchQuotes, 30000); return () => clearInterval(i); }, [fetchQuotes]);
  useEffect(() => {
    if (agentState?.isRunning && agentState.autoTrade) { scanIntervalRef.current = setInterval(runScan, scanInterval * 1000); return () => { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); }; }
    else { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); }
  }, [agentState?.isRunning, agentState?.autoTrade, runScan, scanInterval]);

  useEffect(() => {
    if (activeTab === 'news' && news.length === 0) fetchNews();
    if (activeTab === 'stats' && !perfStats) fetchPerformance();
    if (activeTab === 'trades') fetchAlerts();
  }, [activeTab, news.length, perfStats, fetchNews, fetchPerformance, fetchAlerts]);

  useEffect(() => { if (tradeDialogOpen) { const p = quotes.find(q => q.displaySymbol === tradeForm.symbol)?.price; if (p) setTradeForm(f => ({ ...f, entryPrice: p.toFixed(5) })); } }, [tradeDialogOpen]);

  // ==================== HELPERS ====================
  const formatPrice = (p: number) => p.toFixed(5);
  const formatPnL = (p: number | null) => { if (p == null) return '\u2014'; return (+p.toFixed(2) >= 0 ? '+$' : '-$') + Math.abs(p).toFixed(2); };
  const pnlColor = (p: number | null) => p == null ? 'text-muted-foreground' : p >= 0 ? 'text-emerald-400' : 'text-red-400';
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : quotes.find(q => q.displaySymbol === selectedSymbol)?.price || 0;
  const currentChange = quotes.find(q => q.displaySymbol === selectedSymbol)?.changePercent || 0;
  const openTrades = trades.filter(t => t.status === 'OPEN');

  const handleAgentToggle = (key: 'isRunning' | 'autoTrade', value: boolean) => {
    updateAgent({ [key]: value });
    if (key === 'isRunning') toast({ title: value ? 'AI Agent Started' : 'AI Agent Stopped', description: value ? 'AI analyzing markets' : 'Agent paused' });
    else toast({ title: value ? 'Auto-Trade Enabled' : 'Auto-Trade Disabled' });
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <audio ref={audioRef} className="hidden" />
      <SettingsDialog
        open={showSettings} onOpenChange={setShowSettings}
        strategiesEnabled={strategiesEnabled} setStrategiesEnabled={setStrategiesEnabled}
        scanInterval={scanInterval} setScanInterval={setScanInterval}
        defaultLotSize={defaultLotSize} setDefaultLotSize={setDefaultLotSize}
        maxConcurrent={maxConcurrent} setMaxConcurrent={setMaxConcurrent}
        updateAgent={updateAgent}
        mt5BridgeUrl={mt5BridgeUrl} mt5Connected={mt5Connected}
        onSetBridgeUrl={handleSetBridgeUrl} onTestBridge={handleTestBridge}
        onOpenWizard={() => setShowWizard(true)}
      />
      <NewTradeDialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen} form={tradeForm} setForm={setTradeForm} submitting={tradeSubmitting} onSubmit={createTrade} quotes={quotes} />
      <MT5SetupWizard open={showWizard} onOpenChange={setShowWizard} onComplete={(url) => { handleSetBridgeUrl(url); setShowWizard(false); toast({ title: 'MT5 Connected!', description: 'Live data is now flowing' }); }} />

      {/* HEADER */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-400" /><span className="font-bold text-base sm:text-lg tracking-tight">TRADING AGENT</span></div>
            {agentState?.isRunning ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow" />LIVE</Badge> : <Badge variant="secondary" className="gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />STOPPED</Badge>}
            {agentState?.autoTrade && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">AUTO</Badge>}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Tooltip><TooltipTrigger asChild><Button variant={soundEnabled ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setSoundEnabled(!soundEnabled)}>{soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</Button></TooltipTrigger><TooltipContent>{soundEnabled ? 'Sound On' : 'Sound Off'}</TooltipContent></Tooltip>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowSettings(true)}><Settings className="w-4 h-4" /></Button>
            <div className={cn('flex items-center gap-1.5 text-xs', mt5Connected ? 'text-emerald-400' : 'text-red-400')}>{mt5Connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}<span className="hidden sm:inline">MT5</span></div>
          </div>
        </div>
        <TickerStrip quotes={quotes} selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} formatPrice={formatPrice} dataSource={dataSource} />
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* LEFT: Chart + Analysis */}
        <div className="flex-1 flex flex-col min-w-0 lg:border-r border-b lg:border-b-0 border-border">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/30">
            <span className="font-semibold text-sm">{selectedSymbol}</span>
            <div className="flex items-center gap-1 ml-2">{TIMEFRAMES.map(tf => <button key={tf} onClick={() => setTimeframe(tf)} className={cn('px-2 py-0.5 rounded text-xs font-mono transition-all', timeframe === tf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>{tf}</button>)}</div>
            <div className="ml-auto flex items-center gap-2">
              {isAnalyzing && <span className="animate-spin text-muted-foreground">⟳</span>}
              <span className={cn('text-xl sm:text-2xl font-bold font-mono', currentChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>{formatPrice(currentPrice)}</span>
            </div>
          </div>
          <div className="flex-1 p-2 sm:p-3 min-h-[300px] sm:min-h-[350px]"><CandlestickChart candles={candles} indicators={indicators} /></div>

          {/* Signal Analysis */}
          <div className="border-t border-border px-3 py-3 bg-card/30">
            <SignalAnalysis selectedSymbol={selectedSymbol} timeframe={timeframe} signalResults={signalResults} combinedSignal={combinedSignal} aiAnalysis={aiAnalysis} isAIAnalyzing={isAIAnalyzing} formatPrice={formatPrice} />
            <PriceAlerts alerts={alerts} open={alertsOpen} setOpen={setAlertsOpen} newAlert={{ symbol: newAlertSymbol, setSymbol: setNewAlertSymbol, condition: newAlertCondition, setCondition: setNewAlertCondition, price: newAlertPrice, setPrice: setNewAlertPrice, submitting: alertSubmitting, onSubmit: createAlert }} onDelete={deleteAlert} onNewTrade={() => setTradeDialogOpen(true)} />
          </div>
        </div>

        {/* RIGHT: Tabs Panel */}
        <div className="w-full lg:w-[400px] flex flex-col border-t lg:border-t-0 border-border overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="flex items-center gap-1 px-2 pt-2 border-b border-border bg-card/30 overflow-x-auto">
              <TabsList className="bg-transparent h-auto p-0 gap-0">{[
                { v: 'trades', l: 'Trades' }, { v: 'agent', l: 'Agent' }, { v: 'mt5', l: 'MT5' }, { v: 'news', l: 'News' }, { v: 'stats', l: 'Stats' }, { v: 'log', l: 'Log' },
              ].map(t => <TabsTrigger key={t.v} value={t.v} className="text-xs px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">{t.l}</TabsTrigger>)}</TabsList>
            </div>
            <TabsContent value="trades" className="flex-1 m-0 overflow-y-auto"><TradesTab trades={trades} openTrades={openTrades} formatPrice={formatPrice} formatPnL={formatPnL} pnlColor={pnlColor} tradeStats={tradeStats} onNewTrade={() => setTradeDialogOpen(true)} /></TabsContent>
            <TabsContent value="agent" className="flex-1 m-0"><AgentTab agentState={agentState} openTrades={openTrades} maxConcurrent={maxConcurrent} isScanning={isScanning} onAgentToggle={handleAgentToggle} onUpdateAgent={updateAgent} onScan={runScan} /></TabsContent>
            <TabsContent value="mt5" className="flex-1 m-0 overflow-y-auto">
              <MT5Tab
                connected={mt5Connected}
                account={mt5Account}
                positions={mt5Positions}
                onConnect={handleMT5Connect}
                onDisconnect={handleMT5Disconnect}
                onClosePosition={handleMT5ClosePosition}
                onCloseAll={handleMT5CloseAll}
                onRefresh={fetchMT5Data}
                onOpenWizard={() => setShowWizard(true)}
              />
            </TabsContent>
            <TabsContent value="news" className="flex-1 m-0 overflow-y-auto"><NewsTab news={news} loading={newsLoading} onRefresh={fetchNews} /></TabsContent>
            <TabsContent value="stats" className="flex-1 m-0 overflow-y-auto"><StatsTab stats={perfStats} loading={perfLoading} onRefresh={fetchPerformance} /></TabsContent>
            <TabsContent value="log" className="flex-1 m-0 overflow-y-auto"><ScanLog log={scanLog} /></TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
