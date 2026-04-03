'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Radio, CircleDot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MT5TabProps {
  connected: boolean;
  orders: unknown[];
}

export default function MT5Tab({ connected, orders }: MT5TabProps) {
  return (
    <div className="flex-1 overflow-y-auto m-0 p-3">
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="w-4 h-4" />
            MT5 Bridge
            <Badge variant="outline" className={cn(
              'ml-auto',
              connected ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
            )}>
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {orders.map((o: Record<string, unknown>, i: number) => (
                <div key={i} className={cn(
                  'rounded-lg p-2 bg-muted/30',
                  o.status === 'OPEN' ? 'border-l-2 border-primary' : 'opacity-50'
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CircleDot className={cn('w-2.5 h-2.5', o.type === 'BUY' ? 'text-emerald-400' : 'text-red-400')} fill="currentColor" />
                      <span className="text-sm font-bold">{String(o.symbol)}</span>
                      <Badge variant="outline" className={cn(
                        'text-[10px]',
                        o.type === 'BUY' ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
                      )}>
                        {String(o.type)} {String(o.lots)}
                      </Badge>
                    </div>
                    <span className={cn('text-xs font-mono font-bold', (o.profit as number) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      ${(o.profit as number) >= 0 ? '+' : ''}{(o.profit as number).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-xs text-muted-foreground py-8">
              {connected ? 'No orders' : 'Bridge not connected'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
