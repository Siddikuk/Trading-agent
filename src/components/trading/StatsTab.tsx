'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Trophy, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, Flame, LineChart, Hash, Calendar, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { STRATEGY_COLORS, formatPnL } from './types';
import type { PerformanceStats } from './types';
import EquityCurveChart from './EquityCurveChart';

interface StatsTabProps {
  stats: PerformanceStats | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function StatsTab({ stats, loading, onRefresh }: StatsTabProps) {
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto m-0 p-3 space-y-3">
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 overflow-y-auto m-0 p-3">
        <div className="text-center text-xs text-muted-foreground py-8">No performance data available</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto m-0 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          Performance
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]" onClick={onRefresh}>
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Win Rate', value: stats.winRate.toFixed(1) + '%', color: stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400', icon: Trophy },
          { label: 'Total P/L', value: formatPnL(stats.totalPnL), color: stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400', icon: DollarSign },
          { label: 'Profit Factor', value: stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1.5 ? 'text-emerald-400' : stats.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400', icon: TrendingUp },
          { label: 'Avg Win', value: '+$' + stats.avgWin.toFixed(2), color: 'text-emerald-400', icon: ArrowUpRight },
          { label: 'Avg Loss', value: '-$' + stats.avgLoss.toFixed(2), color: 'text-red-400', icon: ArrowDownRight },
          { label: 'Win Streak', value: stats.maxConsecutiveWins + ' / ' + stats.maxConsecutiveLosses, color: 'text-foreground', icon: Flame },
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

      <div className="grid grid-cols-2 gap-2">
        <div className="glass-card rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Largest Win</div>
          <div className="text-base font-bold font-mono text-emerald-400">+${stats.largestWin.toFixed(2)}</div>
        </div>
        <div className="glass-card rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Largest Loss</div>
          <div className="text-base font-bold font-mono text-red-400">-${stats.largestLoss.toFixed(2)}</div>
        </div>
      </div>

      {stats.equityCurve && stats.equityCurve.length > 1 && (
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <LineChart className="w-3.5 h-3.5" />
              Equity Curve
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="h-[120px]">
              <EquityCurveChart data={stats.equityCurve} />
            </div>
          </CardContent>
        </Card>
      )}

      {stats.dailyBreakdown && stats.dailyBreakdown.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              Daily P/L (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="flex items-end gap-2 h-[80px]">
              {stats.dailyBreakdown.slice(-7).map((d, i) => {
                const maxPnl = Math.max(...stats.dailyBreakdown.slice(-7).map(x => Math.abs(x.pnl)));
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
                    <span className="text-[8px] text-muted-foreground">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {stats.strategyBreakdown && stats.strategyBreakdown.length > 0 && (
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
                  {stats.strategyBreakdown.map((s, i) => (
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
    </div>
  );
}
