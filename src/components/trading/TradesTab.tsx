'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Plus, CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import type { Trade } from './types';

interface TradesTabProps {
  trades: Trade[];
  openTrades: Trade[];
  formatPrice: (p: number) => string;
  formatPnL: (p: number | null) => string;
  pnlColor: (p: number | null) => string;
  tradeStats: Record<string, unknown> | null;
  onNewTrade: () => void;
}

export default function TradesTab({ trades, openTrades, formatPrice, formatPnL, pnlColor, tradeStats, onNewTrade }: TradesTabProps) {
  const closedTrades = trades.filter(t => t.status !== 'OPEN');

  return (
    <div className="flex-1 overflow-hidden flex flex-col m-0">
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

      <div className="px-3 py-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Open Positions ({openTrades.length})
        </div>
        <Button size="sm" onClick={onNewTrade} className="h-7 gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700">
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
    </div>
  );
}
