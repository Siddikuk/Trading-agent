'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Newspaper, RefreshCw, ExternalLink, ShieldCheck, Shield, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import type { NewsItem } from './types';

interface NewsTabProps {
  news: NewsItem[];
  loading: boolean;
  onRefresh: () => void;
}

function ReliabilityBadge({ reliability }: { reliability?: string }) {
  if (!reliability) return null;

  switch (reliability) {
    case 'HIGH':
      return (
        <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-500/30 text-emerald-400 gap-0.5">
          <ShieldCheck className="w-2.5 h-2.5" /> Verified
        </Badge>
      );
    case 'MEDIUM':
      return (
        <Badge variant="outline" className="text-[8px] px-1 py-0 border-amber-500/30 text-amber-400 gap-0.5">
          <Shield className="w-2.5 h-2.5" /> Source
        </Badge>
      );
    case 'LOW':
      return (
        <Badge variant="outline" className="text-[8px] px-1 py-0 border-muted-foreground/30 text-muted-foreground gap-0.5">
          <ShieldAlert className="w-2.5 h-2.5" /> Unverified
        </Badge>
      );
    default:
      return null;
  }
}

export default function NewsTab({ news, loading, onRefresh }: NewsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto m-0 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          Market News
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]" onClick={onRefresh}>
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <p className="text-[9px] text-muted-foreground mb-3 leading-relaxed">
        Real market-moving news: geopolitics, central bank decisions, economic data releases, sanctions, trade wars. No tutorials. No ads.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : news.length > 0 ? (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {news.map((item, i) => (
            <motion.a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn(
                'block rounded-lg p-3 transition-colors group',
                item.reliability === 'HIGH'
                  ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10'
                  : 'bg-muted/30 hover:bg-muted/60 border border-transparent',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {item.title}
                </h4>
                <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {item.snippet && (
                <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{item.snippet}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                {item.source && (
                  <span className={cn(
                    'text-[9px] font-semibold',
                    item.reliability === 'HIGH' ? 'text-emerald-400'
                      : item.reliability === 'MEDIUM' ? 'text-amber-400'
                        : 'text-muted-foreground',
                  )}>
                    {item.source}
                  </span>
                )}
                {item.date && <span className="text-[9px] text-muted-foreground">{item.date}</span>}
                <div className="ml-auto">
                  <ReliabilityBadge reliability={item.reliability} />
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      ) : (
        <div className="text-center text-xs text-muted-foreground py-8 space-y-2">
          <Newspaper className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p>No quality news found.</p>
          <p className="text-[10px]">This may be due to heavy filtering or search API limits. Click refresh to try again.</p>
        </div>
      )}
    </div>
  );
}
