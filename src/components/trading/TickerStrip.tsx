'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { Quote, DataSource } from './types';
import { Badge } from '@/components/ui/badge';

interface TickerStripProps {
  quotes: Quote[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  formatPrice: (p: number) => string;
  dataSource: DataSource;
}

export default function TickerStrip({
  quotes, selectedSymbol, onSelect, formatPrice, dataSource,
}: TickerStripProps) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto px-3 pb-2 scrollbar-none">
      {quotes.map(q => (
        <button
          key={q.symbol}
          onClick={() => onSelect(q.displaySymbol)}
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
      {/* Data source indicator badge */}
      {dataSource && (
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 ml-1 text-[9px] px-1.5 py-0 font-semibold',
            dataSource === 'MT5'
              ? 'border-emerald-400/30 text-emerald-400 bg-emerald-400/5'
              : 'border-amber-400/30 text-amber-400 bg-amber-400/5'
          )}
        >
          <span className={cn(
            'inline-block w-1 h-1 rounded-full mr-1',
            dataSource === 'MT5' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
          )} />
          {dataSource === 'MT5' ? 'LIVE' : 'DELAYED'}
        </Badge>
      )}
    </div>
  );
}
