'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain, ArrowUpRight, ArrowDownRight, Newspaper,
  TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronUp,
  Shield, Target, BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import type { SignalResult, AIAnalysis } from './types';
import { STRATEGY_COLORS } from './types';

interface SignalAnalysisProps {
  selectedSymbol: string;
  timeframe: string;
  combinedSignal: Record<string, unknown> | null;
  signalResults: SignalResult[];
  aiAnalysis: AIAnalysis | null;
  isAIAnalyzing: boolean;
  formatPrice: (p: number) => string;
}

// Safe price formatter — handles undefined/null without crashing
function safePrice(p: number | undefined | null): string {
  return typeof p === 'number' && isFinite(p) ? p.toFixed(5) : '---';
}

function SentimentBar({ score }: { score: number }) {
  const pct = ((score + 100) / 200) * 100;
  const label = score > 30 ? 'Bullish' : score < -30 ? 'Bearish' : 'Neutral';
  const color = score > 30 ? 'bg-emerald-400' : score < -30 ? 'bg-red-400' : 'bg-amber-400';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground flex items-center gap-1">
          <Newspaper className="w-3 h-3" /> News Sentiment
        </span>
        <span className={cn('font-bold', score > 30 ? 'text-emerald-400' : score < -30 ? 'text-red-400' : 'text-amber-400')}>
          {label} ({score > 0 ? '+' : ''}{score})
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-px h-full bg-border mx-auto" />
        </div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={cn('h-full rounded-full', color)}
        />
      </div>
    </div>
  );
}

export default function SignalAnalysis({
  selectedSymbol, timeframe, combinedSignal, signalResults,
  aiAnalysis, isAIAnalyzing, formatPrice,
}: SignalAnalysisProps) {
  const [reasonExpanded, setReasonExpanded] = useState(false);

  // Show loading skeleton while AI is analyzing
  if (isAIAnalyzing && !aiAnalysis) {
    return (
      <div className="border-t border-border px-3 py-3 bg-card/30">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm font-semibold">AI Analyzing {'\u2014'} {selectedSymbol} {timeframe}</span>
          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary ml-auto gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="h-20 bg-muted/50 rounded-lg animate-pulse" />
          <div className="h-4 bg-muted/30 rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-muted/30 rounded w-1/2 animate-pulse" />
        </div>
      </div>
    );
  }

  // Use AI analysis if available, otherwise fall back to mechanical
  const isAI = !!aiAnalysis;

  return (
    <div className="border-t border-border px-3 py-3 bg-card/30">
      <div className="flex items-center gap-2 mb-3">
        <Brain className={cn('w-4 h-4', isAI ? 'text-primary' : 'text-muted-foreground')} />
        <span className="text-sm font-semibold">
          {isAI ? 'AI Analysis' : 'Signal Analysis'} {'\u2014'} {selectedSymbol} {timeframe}
        </span>
        <Badge variant="outline" className={cn(
          'text-[10px] ml-auto gap-1',
          isAI ? 'border-primary/30 text-primary' : 'border-muted-foreground/30 text-muted-foreground'
        )}>
          {isAI ? (
            <>
              <Shield className="w-3 h-3" /> LLM Powered
            </>
          ) : (
            <>
              <BarChart3 className="w-3 h-3" /> Indicators
            </>
          )}
        </Badge>
      </div>

      {/* AI Analysis Panel */}
      {isAI && aiAnalysis && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Main Signal Card */}
          <div className={cn(
            'rounded-lg p-3',
            aiAnalysis.shouldTrade
              ? (aiAnalysis.direction === 'BUY' ? 'glass-card glow-green' : 'glass-card glow-red')
              : 'glass-card bg-muted/30'
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {aiAnalysis.direction === 'BUY'
                  ? <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                  : aiAnalysis.direction === 'SELL'
                    ? <ArrowDownRight className="w-5 h-5 text-red-400" />
                    : <Minus className="w-5 h-5 text-amber-400" />
                }
                <span className={cn(
                  'text-lg font-bold',
                  aiAnalysis.direction === 'BUY' ? 'text-emerald-400'
                    : aiAnalysis.direction === 'SELL' ? 'text-red-400'
                      : 'text-amber-400'
                )}>
                  {aiAnalysis.direction}
                </span>
                <Badge variant="outline" className={cn(
                  aiAnalysis.direction === 'BUY' ? 'border-emerald-400/30 text-emerald-400'
                    : aiAnalysis.direction === 'SELL' ? 'border-red-400/30 text-red-400'
                      : 'border-amber-400/30 text-amber-400'
                )}>
                  {aiAnalysis.confidence}% confidence
                </Badge>
              </div>
              {aiAnalysis.shouldTrade ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                  TRADE SIGNAL
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">NO TRADE</Badge>
              )}
            </div>

            {aiAnalysis.shouldTrade && (
              <div className="grid grid-cols-3 gap-3 text-xs font-mono mb-2">
                <div>
                  <span className="text-muted-foreground">Entry</span>
                  <div>{safePrice(aiAnalysis.entryPrice)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">SL</span>
                  <div className="text-red-400">{safePrice(aiAnalysis.stopLoss)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">TP</span>
                  <div className="text-emerald-400">{safePrice(aiAnalysis.takeProfit)}</div>
                </div>
              </div>
            )}

            {!aiAnalysis.shouldTrade && aiAnalysis.skipReason && (
              <p className="text-xs text-amber-400 mb-2">
                <Target className="w-3 h-3 inline mr-1" />
                {aiAnalysis.skipReason}
              </p>
            )}
          </div>

          {/* AI Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            {/* Confidence */}
            <div className="rounded-md bg-muted/30 p-2 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Confidence</div>
              <div className={cn(
                'text-sm font-bold font-mono',
                aiAnalysis.confidence >= 70 ? 'text-emerald-400'
                  : aiAnalysis.confidence >= 50 ? 'text-amber-400'
                    : 'text-red-400'
              )}>
                {aiAnalysis.confidence}%
              </div>
              <Progress value={aiAnalysis.confidence} className="h-1 mt-1" />
            </div>
            {/* Risk/Reward */}
            <div className="rounded-md bg-muted/30 p-2 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">R:R Ratio</div>
              <div className={cn(
                'text-sm font-bold font-mono',
                aiAnalysis.riskRewardRatio >= 2 ? 'text-emerald-400'
                  : aiAnalysis.riskRewardRatio >= 1.5 ? 'text-amber-400'
                    : 'text-red-400'
              )}>
                {aiAnalysis.riskRewardRatio.toFixed(1)}:1
              </div>
              <Progress value={Math.min(100, aiAnalysis.riskRewardRatio * 25)} className="h-1 mt-1" />
            </div>
            {/* News Sources */}
            <div className="rounded-md bg-muted/30 p-2">
              <div className="text-[10px] text-muted-foreground mb-1 text-center">News Sources</div>
              {aiAnalysis.newsSources && aiAnalysis.newsSources.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-center">
                  {aiAnalysis.newsSources.slice(0, 4).map((src, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 font-mono border-border/50">
                      {src.replace('www.', '').split('.').slice(0, -1).join('.')}
                    </Badge>
                  ))}
                  {aiAnalysis.newsSources.length > 4 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                      +{aiAnalysis.newsSources.length - 4}
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="text-sm font-bold font-mono text-muted-foreground text-center">0</div>
              )}
            </div>
          </div>

          {/* Sentiment Bar */}
          <SentimentBar score={aiAnalysis.sentimentScore} />

          {/* AI Reasoning (expandable) */}
          {aiAnalysis.reasoning && (
            <div className="rounded-md bg-muted/20 border border-border/50">
              <button
                onClick={() => setReasonExpanded(!reasonExpanded)}
                className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1">
                  <Brain className="w-3 h-3" /> AI Reasoning
                </span>
                {reasonExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {reasonExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="px-2.5 pb-2.5"
                >
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                    {aiAnalysis.reasoning}
                  </p>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Fallback: Mechanical Analysis (shown when no AI analysis available) */}
      {!isAI && combinedSignal && (
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
            <div><span className="text-muted-foreground">Entry</span><br />{safePrice(combinedSignal.entryPrice as number)}</div>
            <div><span className="text-muted-foreground">SL</span><br /><span className="text-red-400">{safePrice(combinedSignal.stopLoss as number)}</span></div>
            <div><span className="text-muted-foreground">TP</span><br /><span className="text-emerald-400">{safePrice(combinedSignal.takeProfit as number)}</span></div>
          </div>
          {combinedSignal.reason && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{String(combinedSignal.reason)}</p>
          )}
        </motion.div>
      )}

      {/* Strategy Breakdown Grid (mechanical fallback) */}
      {!isAI && (
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
      )}
    </div>
  );
}
