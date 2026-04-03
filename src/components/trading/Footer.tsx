'use client';

import React from 'react';
import { Separator } from '@/components/ui/separator';
import { SCAN_INTERVALS } from './types';
import type { AgentState } from './types';

interface FooterProps {
  agentState?: AgentState | null;
  timeframe?: string;
  scanInterval?: number;
}

export default function Footer({ agentState, timeframe, scanInterval }: FooterProps) {
  return (
    <footer className="mt-auto border-t border-border bg-card/50 backdrop-blur-xl px-3 sm:px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-muted-foreground gap-1 sm:gap-0">
      <div className="flex items-center gap-3 sm:gap-4">
        <span>Balance: <strong className="text-foreground">${agentState?.balance?.toLocaleString() || '1,000'}</strong></span>
        <Separator orientation="vertical" className="h-3 hidden sm:block" />
        <span>Strategies: <strong className="text-foreground">{agentState?.strategies || 'RSI,MACD,Bollinger'}</strong></span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <span>TF: <strong className="text-foreground">{timeframe || '1h'}</strong></span>
        <Separator orientation="vertical" className="h-3 hidden sm:block" />
        <span>Scan: <strong className="text-foreground">{SCAN_INTERVALS.find(si => si.value === (scanInterval ?? 120))?.label || '2m'}</strong></span>
        <Separator orientation="vertical" className="h-3 hidden sm:block" />
        <span>Last: <strong className="text-foreground">{agentState?.lastScanAt ? new Date(agentState.lastScanAt).toLocaleTimeString() : 'Never'}</strong></span>
      </div>
    </footer>
  );
}
