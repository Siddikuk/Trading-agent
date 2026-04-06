'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Activity, TrendingUp, TrendingDown, Minus,
  RefreshCw, Shield, Zap, Clock, DollarSign, BarChart2,
  AlertCircle, CheckCircle2, Circle, Wifi, WifiOff,
  ArrowUpRight, ArrowDownRight, Newspaper, ExternalLink,
  ChevronDown, ChevronUp, Filter,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentState {
  isRunning: boolean;
  autoTrade: boolean;
  balance: number;
  currency: string;
  maxRiskPercent: number;
  watchSymbols: string;
  lastScanAt: string | null;
  mt5Connected: boolean;
}

interface Signal {
  id: string;
  symbol: string;
  direction: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  timeframe: string;
  indicators: string;
  executed: boolean;
  createdAt: string;
}

interface Trade {
  id: string;
  symbol: string;
  direction: string;
  lotSize: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  status: string;
  openTime: string;
  closeTime: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  symbol: string | null;
  details: string | null;
  createdAt: string;
}

interface NewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date: string;
  reliability: string;
}

interface CalendarEvent {
  title: string;
  country: string;
  impact: string;      // "High" | "Medium"
  minutesAway: number;
  forecast: string;
  previous: string;
  eventTime: string;
}

interface ParsedIndicators {
  reasoning?: string;
  skip_reason?: string;
  skipReason?: string;
  risk_reward?: number;
  riskReward?: number;
  riskRewardRatio?: number;
  confluence?: string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol.includes('JPY')) return price.toFixed(3);
  if (symbol.includes('XAU') || symbol.includes('BTC')) return price.toFixed(2);
  return price.toFixed(5);
}

function parseIndicators(raw: string): ParsedIndicators {
  try { return JSON.parse(raw); } catch { return {}; }
}

function directionBg(dir: string): string {
  if (dir === 'BUY') return 'bg-emerald-500/10 border-emerald-500/30';
  if (dir === 'SELL') return 'bg-rose-500/10 border-rose-500/30';
  return 'bg-slate-800/50 border-slate-700/40';
}

function pnlColor(pnl: number | null): string {
  if (pnl === null) return 'text-slate-400';
  return pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
}

function confidenceColor(conf: number): string {
  if (conf >= 70) return 'bg-emerald-500';
  if (conf >= 50) return 'bg-amber-500';
  return 'bg-slate-500';
}

function reliabilityColor(r: string) {
  if (r === 'HIGH') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
}

function actionIcon(action: string) {
  if (action.includes('TRADE') || action.includes('ORDER')) return <ArrowUpRight size={11} className="text-emerald-400 shrink-0" />;
  if (action.includes('CLOSE')) return <ArrowDownRight size={11} className="text-rose-400 shrink-0" />;
  if (action.includes('HALT') || action.includes('ERROR') || action.includes('FAIL')) return <AlertCircle size={11} className="text-rose-400 shrink-0" />;
  if (action.includes('SCAN') || action.includes('CYCLE')) return <RefreshCw size={11} className="text-sky-400 shrink-0" />;
  if (action.includes('CLAUDE') || action.includes('DECISION')) return <Bot size={11} className="text-violet-400 shrink-0" />;
  if (action.includes('SIGNAL')) return <Zap size={11} className="text-amber-400 shrink-0" />;
  return <Circle size={11} className="text-slate-600 shrink-0" />;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, color = 'emerald', disabled = false }: {
  on: boolean; onChange: () => void; color?: string; disabled?: boolean;
}) {
  const bg = on ? (color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-700';
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-10 h-5 rounded-full transition-colors ${bg} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function useCountdown(lastScanAt: string | null, intervalMinutes = 15): string {
  const [display, setDisplay] = useState('—');
  useEffect(() => {
    const tick = () => {
      if (!lastScanAt) { setDisplay('—'); return; }
      const next = new Date(lastScanAt).getTime() + intervalMinutes * 60 * 1000;
      const remaining = Math.max(0, next - Date.now());
      if (remaining === 0) { setDisplay('scanning…'); return; }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setDisplay(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastScanAt, intervalMinutes]);
  return display;
}

// ─── SignalCard ────────────────────────────────────────────────────────────────

function SignalCard({ signal, active }: { signal: Signal; active: boolean }) {
  const [showFull, setShowFull] = useState(false);
  const ind = parseIndicators(signal.indicators);
  const reasoning = ind.reasoning ?? ind.skip_reason ?? ind.skipReason ?? null;
  const rr = ind.risk_reward ?? ind.riskReward ?? ind.riskRewardRatio ?? null;
  const PREVIEW_LEN = 200;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 transition-all ${directionBg(signal.direction)} ${active ? 'ring-1 ring-violet-500/40' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">{signal.symbol}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            signal.direction === 'BUY'
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
              : signal.direction === 'SELL'
              ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
              : 'border-slate-600 bg-slate-700/40 text-slate-400'
          }`}>
            {signal.direction === 'BUY' ? '▲ BUY' : signal.direction === 'SELL' ? '▼ SELL' : '— HOLD'}
          </span>
          {signal.executed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30 text-violet-300">EXECUTED</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
          <span>{signal.timeframe}</span>
          <span>·</span>
          <span>{timeAgo(signal.createdAt)}</span>
        </div>
      </div>

      {/* Confidence + R:R */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1.5 bg-slate-700/70 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${confidenceColor(signal.confidence)}`}
            style={{ width: `${signal.confidence}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-300 w-8 text-right">{Math.round(signal.confidence)}%</span>
        {rr !== null && (
          <span className="text-xs text-slate-500 w-16 text-right font-mono">R:R {Number(rr).toFixed(2)}</span>
        )}
      </div>

      {/* Price levels */}
      {signal.direction !== 'HOLD' && (
        <div className="grid grid-cols-3 gap-1.5 mb-3 text-xs">
          {[
            { label: 'Entry', value: formatPrice(signal.entryPrice, signal.symbol), color: 'text-white' },
            { label: 'SL', value: formatPrice(signal.stopLoss, signal.symbol), color: 'text-rose-400' },
            { label: 'TP', value: formatPrice(signal.takeProfit, signal.symbol), color: 'text-emerald-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900/60 rounded-lg p-2 text-center">
              <div className="text-slate-500 text-[10px] mb-0.5">{label}</div>
              <div className={`font-mono font-semibold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reasoning — always visible */}
      {reasoning ? (
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/40">
          <div className="flex items-center gap-1.5 mb-2">
            <Bot size={11} className="text-violet-400" />
            <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Claude Reasoning</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {showFull || reasoning.length <= PREVIEW_LEN
              ? reasoning
              : reasoning.slice(0, PREVIEW_LEN) + '…'}
          </p>
          {reasoning.length > PREVIEW_LEN && (
            <button
              onClick={() => setShowFull(v => !v)}
              className="flex items-center gap-1 mt-2 text-[10px] text-slate-500 hover:text-violet-400 transition-colors"
            >
              {showFull ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {showFull ? 'Show less' : 'Read full reasoning'}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30 text-center">
          <p className="text-[10px] text-slate-600 italic">No reasoning available yet — agent hasn't completed a scan cycle</p>
        </div>
      )}
    </motion.div>
  );
}

// ─── NewsCard ─────────────────────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group p-3 rounded-xl border border-slate-800 hover:border-slate-600 bg-slate-900/40 hover:bg-slate-800/60 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${reliabilityColor(item.reliability)}`}>
            {item.source}
          </span>
          {item.date && <span className="text-[10px] text-slate-600">{item.date}</span>}
        </div>
        <ExternalLink size={11} className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-0.5" />
      </div>
      <p className="text-xs text-slate-200 font-medium leading-snug group-hover:text-white transition-colors line-clamp-2">
        {item.title}
      </p>
      {item.snippet && (
        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{item.snippet}</p>
      )}
    </a>
  );
}

// ─── TradeRow ─────────────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: Trade }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-800 last:border-0 text-xs">
      <div className={`w-1 h-6 rounded-full shrink-0 ${trade.direction === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-white">{trade.symbol}</span>
          <span className={`text-[10px] font-bold ${trade.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{trade.direction}</span>
          <span className="text-slate-600 text-[10px]">{trade.lotSize}L</span>
        </div>
        <div className="text-slate-500 text-[10px] font-mono">
          {formatPrice(trade.entryPrice, trade.symbol)}
          {trade.exitPrice ? ` → ${formatPrice(trade.exitPrice, trade.symbol)}` : ''}
        </div>
      </div>
      <div className="text-right shrink-0">
        {trade.status === 'OPEN' ? (
          <span className="text-sky-400 font-semibold">OPEN</span>
        ) : (
          <span className={`font-bold ${pnlColor(trade.pnl)}`}>
            {trade.pnl !== null ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '—'}
          </span>
        )}
        <div className="text-slate-600 text-[10px]">{timeAgo(trade.openTime)}</div>
      </div>
    </div>
  );
}

// ─── AuditRow ─────────────────────────────────────────────────────────────────

function AuditRow({ log }: { log: AuditLog }) {
  let details: Record<string, unknown> = {};
  try { details = JSON.parse(log.details || '{}'); } catch { /* skip */ }
  const summary = String(details.summary ?? details.message ?? details.reason ?? '');

  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-800/70 last:border-0">
      <div className="mt-0.5 shrink-0">{actionIcon(log.action)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">
            {log.action.replace(/_/g, ' ')}
          </span>
          {log.symbol && <span className="text-[10px] text-slate-500">{log.symbol}</span>}
        </div>
        {summary && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{summary}</p>}
      </div>
      <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">{timeAgo(log.createdAt)}</span>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

// All pairs the agent supports — shown as toggles in the watch list
const ALL_SYMBOLS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
  'XAU/USD', 'BTC/USD', 'AUD/USD', 'NZD/USD',
  'USD/CAD', 'GBP/JPY', 'EUR/JPY', 'EUR/GBP',
];

// Normalise any DB symbol format to canonical (EUR/USD)
function normalizeWatchSym(raw: string): string {
  const map: Record<string, string> = {
    'EURUSD=X': 'EUR/USD', 'EURUSD': 'EUR/USD',
    'GBPUSD=X': 'GBP/USD', 'GBPUSD': 'GBP/USD',
    'USDJPY=X': 'USD/JPY', 'USDJPY': 'USD/JPY',
    'USDCHF=X': 'USD/CHF', 'USDCHF': 'USD/CHF',
    'XAUUSD=X': 'XAU/USD', 'XAUUSD': 'XAU/USD', 'GC=F': 'XAU/USD',
    'BTCUSD=X': 'BTC/USD', 'BTCUSD': 'BTC/USD', 'BTC-USD': 'BTC/USD',
    'AUDUSD=X': 'AUD/USD', 'AUDUSD': 'AUD/USD',
    'NZDUSD=X': 'NZD/USD', 'NZDUSD': 'NZD/USD',
    'USDCAD=X': 'USD/CAD', 'USDCAD': 'USD/CAD',
    'GBPJPY=X': 'GBP/JPY', 'GBPJPY': 'GBP/JPY',
    'EURJPY=X': 'EUR/JPY', 'EURJPY': 'EUR/JPY',
    'EURGBP=X': 'EUR/GBP', 'EURGBP': 'EUR/GBP',
  };
  return map[raw.toUpperCase()] ?? raw;
}

export default function Dashboard() {
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [midTab, setMidTab] = useState<'signals' | 'news'>('signals');
  const [filterSymbol, setFilterSymbol] = useState<string | null>(null);
  const _lastRefresh = useRef(Date.now());

  const countdown = useCountdown(agent?.lastScanAt ?? null);

  // Fetch agent/signals/trades/audit every 10s
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [agentRes, sigRes, tradeRes, auditRes] = await Promise.allSettled([
        fetch('/api/forex/agent').then(r => r.json()),
        fetch('/api/forex/db-signals').then(r => r.json()),
        fetch('/api/forex/trades').then(r => r.json()),
        fetch('/api/forex/audit').then(r => r.json()),
      ]);
      if (agentRes.status === 'fulfilled' && agentRes.value?.state) setAgent(agentRes.value.state);
      if (sigRes.status === 'fulfilled' && sigRes.value?.signals) setSignals(sigRes.value.signals);
      if (tradeRes.status === 'fulfilled' && tradeRes.value?.trades) setTrades(tradeRes.value.trades);
      if (auditRes.status === 'fulfilled' && auditRes.value?.logs) setAudit(auditRes.value.logs);
      _lastRefresh.current = Date.now();
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, []);

  // Fetch news + calendar separately (slower, every 5 min)
  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const [newsRes, calRes] = await Promise.allSettled([
        fetch('/api/forex/news').then(r => r.json()),
        fetch('/api/forex/calendar').then(r => r.json()),
      ]);
      if (newsRes.status === 'fulfilled' && newsRes.value?.results) setNews(newsRes.value.results);
      if (calRes.status === 'fulfilled' && calRes.value?.events) setCalendarEvents(calRes.value.events);
    } catch { /* silently fail */ }
    finally { setNewsLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchNews();
    const fast = setInterval(() => fetchAll(true), 10000);
    const slow = setInterval(fetchNews, 300000); // 5 min
    return () => { clearInterval(fast); clearInterval(slow); };
  }, [fetchAll, fetchNews]);

  const toggleAgent = async () => {
    if (!agent || toggling) return;
    setToggling(true);
    try {
      const res = await fetch('/api/forex/agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRunning: !agent.isRunning }),
      });
      if (res.ok) setAgent((await res.json()).state);
    } finally { setToggling(false); }
  };

  const toggleAutoTrade = async () => {
    if (!agent) return;
    const res = await fetch('/api/forex/agent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoTrade: !agent.autoTrade }),
    });
    if (res.ok) setAgent((await res.json()).state);
  };

  const openTrades = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status === 'CLOSED').slice(0, 5);
  const todayPnl = trades
    .filter(t => t.status === 'CLOSED' && t.closeTime && new Date(t.closeTime) > new Date(Date.now() - 86400000))
    .reduce((s, t) => s + (t.pnl ?? 0), 0);

  const watchList = (agent?.watchSymbols ?? '')
    .split(',').map(s => normalizeWatchSym(s.trim())).filter(Boolean);
  const watchSet = new Set(watchList);

  const toggleWatchSymbol = async (sym: string) => {
    if (!agent) return;
    const next = watchSet.has(sym)
      ? watchList.filter(s => s !== sym)
      : [...watchList, sym];
    const res = await fetch('/api/forex/agent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watchSymbols: next.join(',') }),
    });
    if (res.ok) setAgent((await res.json()).state);
  };

  // Symbols that have signals
  const signalSymbols = [...new Set(signals.map(s => s.symbol))];

  const filteredSignals = filterSymbol
    ? signals.filter(s => s.symbol === filterSymbol)
    : signals;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw size={18} className="animate-spin" />
          <span className="text-sm">Connecting to trading database…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">
            <Bot size={18} className="text-violet-400" />
            <span className="font-bold text-white text-sm">AI Trading Agent</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              agent?.isRunning
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${agent?.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {agent?.isRunning ? 'LIVE' : 'IDLE'}
            </div>
            <div className={`hidden sm:flex items-center gap-1 text-xs ${agent?.mt5Connected ? 'text-emerald-400/70' : 'text-slate-600'}`}>
              {agent?.mt5Connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span>MT5</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm">
            <div className="flex items-center gap-1.5">
              <DollarSign size={13} className="text-slate-500" />
              <span className="text-white font-semibold">${(agent?.balance ?? 0).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              <span className="text-slate-600 text-xs">{agent?.currency ?? 'USD'}</span>
            </div>
            <div className={`flex items-center gap-1.5 font-semibold ${todayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {todayPnl >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              <span>{todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)} today</span>
            </div>
            {agent?.isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock size={11} />
                next scan <span className="text-slate-300 font-mono">{countdown}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAll(false)}
              disabled={refreshing}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={toggleAgent}
              disabled={toggling}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                agent?.isRunning
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              {toggling ? '…' : agent?.isRunning ? 'Stop Agent' : 'Start Agent'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Grid ── */}
      <div className="max-w-screen-2xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[260px_1fr_290px] gap-5 items-start">

        {/* ── Left: Controls ── */}
        <div className="space-y-4">

          {/* Agent controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={13} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Agent Controls</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <span className={`w-2 h-2 rounded-full ${agent?.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  Running
                </div>
                <Toggle on={agent?.isRunning ?? false} onChange={toggleAgent} disabled={toggling} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Zap size={13} className={agent?.autoTrade ? 'text-amber-400' : 'text-slate-600'} />
                  Auto-Trade
                </div>
                <Toggle on={agent?.autoTrade ?? false} onChange={toggleAutoTrade} color="amber" />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Last scan</span>
                <span className="text-slate-300 font-mono">{agent?.lastScanAt ? timeAgo(agent.lastScanAt) : '—'}</span>
              </div>
              {agent?.isRunning && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Next scan</span>
                  <span className="text-slate-300 font-mono">{countdown}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Max risk / trade</span>
                <span className="text-slate-300">{agent?.maxRiskPercent ?? 2}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Open positions</span>
                <span className={openTrades.length > 0 ? 'text-sky-400 font-semibold' : 'text-slate-400'}>
                  {openTrades.length}
                </span>
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={13} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight">
              ${(agent?.balance ?? 0).toLocaleString('en', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-600 mb-4">{agent?.currency ?? 'USD'} balance</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Today P&amp;L</span>
                <span className={`font-semibold ${todayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total closed</span>
                <span className="text-slate-300">{trades.filter(t => t.status === 'CLOSED').length} trades</span>
              </div>
            </div>
          </div>

          {/* Watch list — interactive toggles */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Watch List</span>
              </div>
              <span className="text-xs text-slate-600">{watchList.length} active</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_SYMBOLS.map(sym => {
                const active = watchSet.has(sym);
                const sig = signals.find(s => s.symbol === sym);
                const dir = sig?.direction;
                return (
                  <button
                    key={sym}
                    onClick={() => toggleWatchSymbol(sym)}
                    className={`text-xs px-2 py-1.5 rounded-lg border font-mono font-semibold text-left transition-all ${
                      !active
                        ? 'bg-slate-800/40 border-slate-700/50 text-slate-600 hover:text-slate-400 hover:border-slate-600'
                        : dir === 'BUY'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                        : dir === 'SELL'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                        : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                    title={active ? `Remove ${sym} from watch list` : `Add ${sym} to watch list`}
                  >
                    <span className={`mr-1 ${active ? 'opacity-100' : 'opacity-30'}`}>
                      {active ? '●' : '○'}
                    </span>
                    {sym}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-700 mt-2">Click to add/remove from scan</p>
          </div>
        </div>

        {/* ── Middle: Signals / News tabs ── */}
        <div>
          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-4 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
            <button
              onClick={() => setMidTab('signals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                midTab === 'signals'
                  ? 'bg-slate-700 text-white shadow'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Zap size={12} />
              Signals
              {signals.length > 0 && (
                <span className={`text-[10px] px-1.5 rounded-full ${midTab === 'signals' ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-500'}`}>
                  {signals.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setMidTab('news')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                midTab === 'news'
                  ? 'bg-slate-700 text-white shadow'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Newspaper size={12} />
              News
              {newsLoading
                ? <RefreshCw size={10} className="animate-spin text-slate-500" />
                : news.length > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${midTab === 'news' ? 'bg-sky-500/30 text-sky-300' : 'bg-slate-700 text-slate-500'}`}>
                    {news.length}
                  </span>
                )
              }
            </button>
          </div>

          {/* Signals tab */}
          {midTab === 'signals' && (
            <div>
              {/* Symbol filter */}
              {signalSymbols.length > 1 && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Filter size={12} className="text-slate-600" />
                  <button
                    onClick={() => setFilterSymbol(null)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      filterSymbol === null
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    All
                  </button>
                  {signalSymbols.map(sym => (
                    <button
                      key={sym}
                      onClick={() => setFilterSymbol(f => f === sym ? null : sym)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all font-mono ${
                        filterSymbol === sym
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                          : 'border-slate-700 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              )}

              {filteredSignals.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
                  <Bot size={28} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No signals yet</p>
                  <p className="text-slate-700 text-xs mt-1">
                    {agent?.isRunning
                      ? 'Agent is scanning — signals appear after the first cycle completes'
                      : 'Start the agent to begin scanning markets'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {filteredSignals.map(sig => (
                      <SignalCard
                        key={sig.id}
                        signal={sig}
                        active={filterSymbol === sig.symbol}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* News tab */}
          {midTab === 'news' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-slate-500">
                  {news.length > 0
                    ? `${news.length} articles from Reuters, BBC, ForexLive & more`
                    : 'Loading news feeds…'}
                </p>
                <button
                  onClick={fetchNews}
                  disabled={newsLoading}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <RefreshCw size={11} className={newsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {/* Economic calendar */}
              {calendarEvents.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                    Upcoming Economic Events
                  </p>
                  <div className="space-y-1">
                    {calendarEvents.slice(0, 6).map((ev, i) => {
                      const isHigh = ev.impact === 'High';
                      const when = ev.minutesAway < 0
                        ? `${Math.abs(ev.minutesAway)}m ago`
                        : ev.minutesAway < 60
                        ? `in ${ev.minutesAway}m ⚠`
                        : ev.minutesAway < 120
                        ? `in ${Math.floor(ev.minutesAway / 60)}h ${ev.minutesAway % 60}m`
                        : `in ~${Math.floor(ev.minutesAway / 60)}h`;
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] ${
                            isHigh ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/8 border border-amber-500/15'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isHigh ? 'bg-red-400' : 'bg-amber-400'}`} />
                          <span className={`font-bold flex-shrink-0 ${isHigh ? 'text-red-300' : 'text-amber-300'}`}>{ev.country}</span>
                          <span className="text-slate-300 flex-1 truncate">{ev.title}</span>
                          {ev.forecast && <span className="text-slate-500 flex-shrink-0">F:{ev.forecast}</span>}
                          <span className={`flex-shrink-0 font-medium ${isHigh ? 'text-red-300' : 'text-amber-300'}`}>{when}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {news.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
                  <Newspaper size={28} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">{newsLoading ? 'Fetching news…' : 'No news loaded'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {news.map((item, i) => <NewsCard key={i} item={item} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Trades + Audit ── */}
        <div className="space-y-4">

          {/* Open positions */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} className="text-sky-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Positions</span>
              {openTrades.length > 0 && (
                <span className="ml-auto text-xs font-bold text-sky-400 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5 rounded-full">
                  {openTrades.length}
                </span>
              )}
            </div>
            {openTrades.length === 0 ? (
              <div className="py-6 text-center">
                <CheckCircle2 size={18} className="text-slate-700 mx-auto mb-1.5" />
                <p className="text-xs text-slate-600">No open positions</p>
              </div>
            ) : (
              openTrades.map(t => <TradeRow key={t.id} trade={t} />)
            )}
          </div>

          {/* Recent closed */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={13} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Closed</span>
            </div>
            {closedTrades.length === 0 ? (
              <div className="py-6 text-center">
                <Minus size={18} className="text-slate-700 mx-auto mb-1.5" />
                <p className="text-xs text-slate-600">No closed trades yet</p>
              </div>
            ) : (
              closedTrades.map(t => <TradeRow key={t.id} trade={t} />)
            )}
          </div>

          {/* Audit log */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={13} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Audit Log</span>
              <span className="ml-auto text-xs text-slate-600">{audit.length}</span>
            </div>
            {audit.length === 0 ? (
              <div className="py-6 text-center">
                <Circle size={18} className="text-slate-700 mx-auto mb-1.5" />
                <p className="text-xs text-slate-600">No activity yet</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {audit.map(log => <AuditRow key={log.id} log={log} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/50 mt-8 py-4 text-center text-xs text-slate-700">
        AI Trading Agent · Claude claude-sonnet-4-6 · Signals refresh every 10s · News every 5min
      </footer>
    </div>
  );
}
