'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Newspaper, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import type { NewsItem } from './types';

interface NewsTabProps {
  news: NewsItem[];
  loading: boolean;
  onRefresh: () => void;
}

export default function NewsTab({ news, loading, onRefresh }: NewsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto m-0 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          Forex News
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]" onClick={onRefresh}>
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

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
              className="block rounded-lg p-3 bg-muted/30 hover:bg-muted/60 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {item.title}
                </h4>
                <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {item.snippet && (
                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{item.snippet}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                {item.source && <span className="text-[9px] font-semibold text-amber-400">{item.source}</span>}
                {item.date && <span className="text-[9px] text-muted-foreground">{item.date}</span>}
              </div>
            </motion.a>
          ))}
        </div>
      ) : (
        <div className="text-center text-xs text-muted-foreground py-8">
          No news available. Click refresh to load.
        </div>
      )}
    </div>
  );
}
