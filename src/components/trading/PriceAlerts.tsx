'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Bell, ChevronRight, Plus, X, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SYMBOLS, formatPrice } from './types';
import type { PriceAlert } from './types';

interface NewAlertForm {
  symbol: string;
  setSymbol: (v: string) => void;
  condition: string;
  setCondition: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}

interface PriceAlertsProps {
  alerts: PriceAlert[];
  open: boolean;
  setOpen: (open: boolean) => void;
  newAlert: NewAlertForm;
  onDelete: (id: string) => void;
  onNewTrade: () => void;
}

export default function PriceAlerts({
  alerts, open, setOpen, newAlert, onDelete, onNewTrade,
}: PriceAlertsProps) {
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-md p-1.5 transition-colors">
          <Bell className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold">Price Alerts</span>
          <Badge variant="secondary" className="text-[10px] ml-auto">{alerts.filter(a => a.isActive && !a.triggered).length}</Badge>
          <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <Select value={newAlert.symbol} onValueChange={newAlert.setSymbol}>
              <SelectTrigger className="w-[100px] h-7 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYMBOLS.map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newAlert.condition} onValueChange={newAlert.setCondition}>
              <SelectTrigger className="w-[80px] h-7 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="above" className="text-xs">Above</SelectItem>
                <SelectItem value="below" className="text-xs">Below</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number" step="0.00001" value={newAlert.price}
              onChange={e => newAlert.setPrice(e.target.value)}
              placeholder="Price" className="h-7 text-[10px] font-mono flex-1 min-w-0"
            />
            <Button size="sm" onClick={newAlert.onSubmit} disabled={newAlert.submitting || !newAlert.price} className="h-7 px-2 text-[10px]">
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {alerts.filter(a => a.isActive && !a.triggered).map(a => (
              <div key={a.id} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-semibold">{a.symbol}</span>
                  <span className={a.condition === 'above' ? 'text-emerald-400' : 'text-red-400'}>{a.condition}</span>
                  <span className="font-mono">{formatPrice(a.price)}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDelete(a.id)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {alerts.filter(a => a.isActive && !a.triggered).length === 0 && (
              <div className="text-[10px] text-muted-foreground text-center py-2">No active alerts</div>
            )}
          </div>
          {alerts.filter(a => a.triggered).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground font-semibold">Triggered</div>
              {alerts.filter(a => a.triggered).slice(0, 3).map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5 opacity-50 line-through">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span>{a.symbol}</span>
                    <span>{a.condition}</span>
                    <span className="font-mono">{formatPrice(a.price)}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDelete(a.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
