'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { Quote } from './types';

interface TickerStripProps {
  quotes: Quote[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  formatPrice: (p: number) => string;
}

export default function TickerStrip({
  quotes, selectedSymbol, onSelect, formatPrice,
}: TickerStripProps) {
  return (
    <div className="flex gap-0 overflow-x-auto px-3 pb-2 scrollbar-none">
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
    </div>
  );
}
