'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Activity, TrendingUp, TrendingDown, Minus,
  RefreshCw, ChevronDown, ChevronUp, Shield, Zap,
  Clock, DollarSign, BarChart2, AlertCircle, CheckCircle2,
  Circle, Wifi, WifiOff, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentState {
  id: string;
  isRunning: boolean;
  autoTrade: boolean;
  balance: number;
  currency: string;
  maxRiskPercent: number;
  watchSymbols: string;
  lastScanAt: string | null;
  mt5Connected: boolean;
  updatedAt: string;
}

interface Signal {
  id: string;
  symbol: string;
  direction: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  strategy: string;
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
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number | null;
  status: string;
  openTime: string;
  closeTime: string | null;
  strategy: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  symbol: string | null;
  details: string | null;
  createdAt: string;
}

interface ParsedIndicators {
  reasoning?: string;
  skip_reason?: string;
  skipReason?: string;
  risk_reward?: number;
  riskReward?: number;
  riskRewardRatio?: number;
  confluence?: string;
  sentiment_score?: number;
  sentimentScore?: number;
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
  const decimals = symbol.includes('JPY') ? 3 : symbol.includes('XAU') ? 2 : 5;
  return price.toFixed(decimals);
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

function confidenceBar(conf: number): string {
  if (conf >= 70) return 'bg-emerald-500';
  if (conf >= 50) return 'bg-amber-500';
  return 'bg-slate-500';
}

function actionIcon(action: string) {
  if (action.includes('TRADE') || action.includes('ORDER')) return <ArrowUpRight size={12} className="text-emerald-400 shrink-0" />;
  if (action.includes('CLOSE')) return <ArrowDownRight size={12} className="text-rose-400 shrink-0" />;
  if (action.includes('HALT') || action.includes('ERROR') || action.includes('FAIL')) return <AlertCircle size={12} className="text-rose-400 shrink-0" />;
  if (action.includes('SCAN') || action.includes('CYCLE')) return <RefreshCw size={12} className="text-sky-400 shrink-0" />;
  if (action.includes('CLAUDE') || action.includes('DECISION')) return <Bot size={12} className="text-violet-400 shrink-0" />;
  if (action.includes('SIGNAL')) return <Zap size={12} className="text-amber-400 shrink-0" />;
  return <Circle size={12} className="text-slate-600 shrink-0" />;
}

// ─── SignalCard ────────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false);
  const ind = parseIndicators(signal.indicators);
  const reasoning = ind.reasoning ?? ind.skip_reason ?? ind.skipReason ?? null;
  const rr = ind.risk_reward ?? ind.riskReward ?? ind.riskRewardRatio ?? null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 transition-colors ${directionBg(signal.direction)}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white tracking-wide">{signal.symbol}</span>
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{signal.timeframe}</span>
          <span className="text-xs text-slate-600">{timeAgo(signal.createdAt)}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1.5 bg-slate-700/70 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${confidenceBar(signal.confidence)}`}
            style={{ width: `${signal.confidence}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-300 w-8 text-right">{Math.round(signal.confidence)}%</span>
        {rr !== null && (
          <span className="text-xs text-slate-500 w-16 text-right">R:R {Number(rr).toFixed(2)}</span>
        )}
      </div>

      {/* Price levels */}
      {signal.direction !== 'HOLD' && (
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
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

      {/* Reasoning */}
      {reasoning && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full text-left"
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            <span className={expanded ? '' : 'truncate'}>
              {expanded ? 'Hide reasoning' : reasoning.slice(0, 90) + (reasoning.length > 90 ? '…' : '')}
            </span>
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <p className="mt-2 text-xs text-slate-400 leading-relaxed bg-slate-900/60 rounded-lg p-3 border border-slate-700/40">
                  {reasoning}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// ─── TradeRow ─────────────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: Trade }) {
  const isOpen = trade.status === 'OPEN';
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-800 last:border-0 text-xs">
      <div className={`w-1 h-6 rounded-full shrink-0 ${trade.direction === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-white">{trade.symbol}</span>
          <span className={`text-[10px] font-bold ${trade.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{trade.direction}</span>
          <span className="text-slate-600 text-[10px]">{trade.lotSize} lot</span>
        </div>
        <div className="text-slate-500 text-[10px] font-mono">
          {formatPrice(trade.entryPrice, trade.symbol)}
          {trade.exitPrice ? ` → ${formatPrice(trade.exitPrice, trade.symbol)}` : ''}
        </div>
      </div>
      <div className="text-right shrink-0">
        {isOpen ? (
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
      <div className="mt-0.5">{actionIcon(log.action)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">
            {log.action.replace(/_/g, ' ')}
          </span>
          {log.symbol && <span className="text-[10px] text-slate-500">{log.symbol}</span>}
        </div>
        {summary && (
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed truncate">{summary}</p>
        )}
      </div>
      <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">{timeAgo(log.createdAt)}</span>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, color = 'emerald' }: { on: boolean; onChange: () => void; color?: string }) {
  const bg = on ? (color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-700';
  return (
    <button onClick={onChange} className={`relative w-10 h-5 rounded-full transition-colors ${bg}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ─── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(lastScanAt: string | null, intervalMinutes = 15): string {
  const [display, setDisplay] = useState('—');
  useEffect(() => {
    const tick = () => {
      if (!lastScanAt) { setDisplay('—'); return; }
      const next = new Date(lastScanAt).getTime() + intervalMinutes * 60 * 1000;
      const remaining = Math.max(0, next - Date.now());
      if (remaining === 0) { setDisplay('Now'); return; }
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const _lastRefresh = useRef(Date.now());

  const countdown = useCountdown(agent?.lastScanAt ?? null);

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

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => fetchAll(true), 10000);
    return () => clearInterval(id);
  }, [fetchAll]);

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

  const watchList = agent?.watchSymbols?.split(',').map(s => s.trim()).filter(Boolean) ?? [];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw size={20} className="animate-spin" />
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
            <Bot size={20} className="text-violet-400" />
            <span className="font-bold text-white tracking-tight text-sm">AI Trading Agent</span>
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
              <DollarSign size={14} className="text-slate-500" />
              <span className="text-white font-semibold">${(agent?.balance ?? 0).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              <span className="text-slate-500 text-xs">{agent?.currency ?? 'USD'}</span>
            </div>
            <div className={`flex items-center gap-1.5 font-semibold ${todayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {todayPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)} today</span>
            </div>
            {agent?.isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock size={12} />
                next scan <span className="text-slate-300 font-mono">{countdown}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAll(false)}
              disabled={refreshing}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
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

        {/* ── Left ── */}
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
                <Toggle on={agent?.isRunning ?? false} onChange={toggleAgent} />
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

          {/* Watch list */}
          {watchList.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={13} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Watch List</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {watchList.map(sym => {
                  const clean = sym.replace('=X', '');
                  const sig = signals.find(s =>
                    s.symbol === sym ||
                    s.symbol === clean ||
                    s.symbol.replace('/', '') === clean
                  );
                  const dir = sig?.direction;
                  return (
                    <span key={sym} className={`text-xs px-2.5 py-1 rounded-lg border font-mono font-semibold ${
                      dir === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : dir === 'SELL' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      {clean}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Middle: Signals ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-amber-400" />
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Latest Signals</h2>
              <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">{signals.length}</span>
            </div>
            {signals[0] && (
              <span className="text-xs text-slate-600">Updated {timeAgo(signals[0].createdAt)}</span>
            )}
          </div>

          {signals.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <Bot size={28} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No signals yet</p>
              <p className="text-slate-700 text-xs mt-1">
                {agent?.isRunning ? 'Agent is scanning — signals appear here after each cycle' : 'Start the agent to begin scanning markets'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {signals.map(sig => <SignalCard key={sig.id} signal={sig} />)}
              </AnimatePresence>
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
        AI Trading Agent · Powered by Claude claude-sonnet-4-6 · Refreshes every 10s
      </footer>
    </div>
  );
}
