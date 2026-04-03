'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Brain, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import type { SignalResult } from './types';
import { STRATEGY_COLORS } from './types';

interface SignalAnalysisProps {
  selectedSymbol: string;
  timeframe: string;
  combinedSignal: Record<string, unknown> | null;
  signalResults: SignalResult[];
  formatPrice: (p: number) => string;
}

export default function SignalAnalysis({ selectedSymbol, timeframe, combinedSignal, signalResults, formatPrice }: SignalAnalysisProps) {
  return (
    <div className="border-t border-border px-3 py-3 bg-card/30">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">AI Signal Analysis {'\u2014'} {selectedSymbol} {timeframe}</span>
        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary ml-auto">AI Powered</Badge>
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
    </div>
  );
}
