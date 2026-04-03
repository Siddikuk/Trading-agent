'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Radio, Plug, Unplug, RefreshCw, CircleDot, X, AlertTriangle, DollarSign, TrendingUp, Shield, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { MT5Account, MT5Position } from './types';

interface MT5TabProps {
  connected: boolean;
  account: MT5Account | null;
  positions: MT5Position[];
  onConnect: (url: string) => void;
  onDisconnect: () => void;
  onClosePosition: (ticket: number) => void;
  onCloseAll: () => void;
  onRefresh: () => void;
}

export default function MT5Tab({
  connected, account, positions, onConnect, onDisconnect,
  onClosePosition, onCloseAll, onRefresh,
}: MT5TabProps) {
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [closing, setClosing] = useState<number | null>(null);
  const [showCloseAllConfirm, setShowCloseAllConfirm] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  // Auto-refresh every 5s when connected
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      onRefresh();
      setLastRefresh(new Date().toLocaleTimeString());
    }, 5000);
    return () => clearInterval(interval);
  }, [connected, onRefresh]);

  const handleConnect = async () => {
    if (!bridgeUrl.trim()) return;
    setConnecting(true);
    onConnect(bridgeUrl.trim());
    setTimeout(() => setConnecting(false), 3000);
  };

  const handleClosePosition = async (ticket: number) => {
    setClosing(ticket);
    await onClosePosition(ticket);
    setTimeout(() => setClosing(null), 1000);
  };

  const handleCloseAll = async () => {
    await onCloseAll();
    setShowCloseAllConfirm(false);
  };

  const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);
  const totalLots = positions.reduce((sum, p) => sum + p.lots, 0);

  return (
    <div className="flex-1 overflow-y-auto m-0 p-3 space-y-3">
      {/* Connection Section */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="w-4 h-4" />
            MT5 Live Connection
            <div className={cn(
              'ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold',
              connected ? 'bg-emerald-500/10 text-emerald-400' : connecting ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
            )}>
              <div className={cn(
                'w-1.5 h-1.5 rounded-full',
                connected ? 'bg-emerald-400 animate-pulse' : connecting ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
              )} />
              {connected ? 'LIVE' : connecting ? 'CONNECTING...' : 'OFFLINE'}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!connected ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="http://your-vps-ip:8080"
                  value={bridgeUrl}
                  onChange={e => setBridgeUrl(e.target.value)}
                  className="h-8 text-xs font-mono flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
                />
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={handleConnect}
                  disabled={connecting || !bridgeUrl.trim()}
                >
                  <Plug className="w-3.5 h-3.5" />
                  {connecting ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Enter the URL of your MT5 Python bridge (FastAPI server on your VPS)
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 text-red-400 border-red-400/20 hover:bg-red-400/10"
                onClick={onDisconnect}
              >
                <Unplug className="w-3.5 h-3.5" />
                Disconnect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={onRefresh}
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </Button>
              {lastRefresh && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  Updated {lastRefresh}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Info Card */}
      {connected && account && (
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground">
              <DollarSign className="w-3.5 h-3.5" />
              Account Overview
              <Badge variant="outline" className="ml-auto text-[9px] font-mono">
                1:{account.leverage}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <AccountStat label="Balance" value={`${account.currency} ${account.balance.toFixed(2)}`} />
              <AccountStat label="Equity" value={`${account.currency} ${account.equity.toFixed(2)}`} />
              <AccountStat
                label="Margin"
                value={`${account.currency} ${account.margin.toFixed(2)}`}
                icon={<Shield className="w-3 h-3 text-amber-400" />}
              />
              <AccountStat
                label="Free Margin"
                value={`${account.currency} ${account.freeMargin.toFixed(2)}`}
              />
              <AccountStat
                label="Floating P/L"
                value={`${account.profit >= 0 ? '+' : ''}${account.currency} ${account.profit.toFixed(2)}`}
                valueClass={account.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
                icon={<TrendingUp className={cn('w-3 h-3', account.profit >= 0 ? 'text-emerald-400' : 'text-red-400')} />}
              />
              <AccountStat
                label="Margin Level"
                value={account.marginLevel > 0 ? `${account.marginLevel.toFixed(1)}%` : '—'}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positions */}
      {connected && (
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="w-3.5 h-3.5" />
              Open Positions
              <Badge variant="outline" className="ml-auto text-[10px] font-mono">
                {positions.length} position{positions.length !== 1 ? 's' : ''}
                {totalLots > 0 && ` · ${totalLots.toFixed(2)} lots`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {positions.length > 0 && (
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-[10px] text-muted-foreground font-semibold">TOTAL P/L</span>
                <span className={cn(
                  'text-sm font-bold font-mono',
                  totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
                </span>
              </div>
            )}

            {positions.length > 0 ? (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {positions.map(pos => (
                  <PositionRow
                    key={pos.ticket}
                    position={pos}
                    closing={closing === pos.ticket}
                    onClose={() => handleClosePosition(pos.ticket)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-muted-foreground">No open positions</p>
              </div>
            )}

            {positions.length > 1 && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  {showCloseAllConfirm ? (
                    <div className="flex items-center gap-2 w-full">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[10px] text-amber-400">Close all {positions.length} positions?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-[10px] ml-auto"
                        onClick={handleCloseAll}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => setShowCloseAllConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] w-full text-red-400 border-red-400/20 hover:bg-red-400/10"
                      onClick={() => setShowCloseAllConfirm(true)}
                    >
                      Close All Positions ({positions.length})
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Not connected placeholder */}
      {!connected && (
        <Card className="glass-card border-border/50">
          <CardContent className="py-10 text-center">
            <Radio className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">MT5 Bridge Not Connected</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-xs mx-auto">
              Connect to your MT5 Python bridge to view live positions, account data, and execute trades in real-time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function AccountStat({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/20 rounded-md p-2">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <span className={cn('text-xs font-bold font-mono', valueClass || '')}>
        {value}
      </span>
    </div>
  );
}

function PositionRow({
  position,
  closing,
  onClose,
}: {
  position: MT5Position;
  closing: boolean;
  onClose: () => void;
}) {
  const isBuy = position.type === 0;
  const symbol = position.symbol.replace('USD', '/USD');
  const pips = isBuy
    ? (position.price_current - position.price_open) * 10000
    : (position.price_open - position.price_current) * 10000;

  return (
    <div className="rounded-lg p-2.5 bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            isBuy ? 'bg-emerald-400' : 'bg-red-400'
          )} />
          <span className="text-xs font-bold">{symbol}</span>
          <Badge variant="outline" className={cn(
            'text-[9px] px-1.5 py-0',
            isBuy ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
          )}>
            {isBuy ? 'BUY' : 'SELL'}
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono">
            {position.lots.toFixed(2)} lots
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xs font-bold font-mono',
            position.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
          )}>
            {position.profit >= 0 ? '+' : ''}{position.profit.toFixed(2)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
            onClick={onClose}
            disabled={closing}
          >
            {closing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 text-[9px] text-muted-foreground font-mono">
        <div>
          <span className="block">Open</span>
          <span className="text-foreground/70">{position.price_open.toFixed(5)}</span>
        </div>
        <div>
          <span className="block">Current</span>
          <span className="text-foreground/70">{position.price_current.toFixed(5)}</span>
        </div>
        <div>
          <span className="block">SL / TP</span>
          <span className="text-foreground/70">
            {position.sl > 0 ? position.sl.toFixed(5) : '—'} / {position.tp > 0 ? position.tp.toFixed(5) : '—'}
          </span>
        </div>
        <div>
          <span className="block">Pips</span>
          <span className={cn(position.profit >= 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
            {pips >= 0 ? '+' : ''}{pips.toFixed(1)}
          </span>
        </div>
      </div>
      {position.comment && (
        <div className="text-[9px] text-muted-foreground/50 mt-1 truncate">
          #{position.ticket} · {position.comment}
        </div>
      )}
    </div>
  );
}
