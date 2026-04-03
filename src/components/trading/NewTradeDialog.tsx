'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Plus, ArrowUpRight, ArrowDownRight, Zap, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SYMBOLS } from './types';
import type { Quote } from './types';

interface TradeForm {
  symbol: string;
  direction: string;
  lotSize: number;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  strategy: string;
}

interface NewTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: TradeForm;
  setForm: React.Dispatch<React.SetStateAction<TradeForm>>;
  submitting: boolean;
  onSubmit: () => void;
  quotes: Quote[];
}

export default function NewTradeDialog({
  open, onOpenChange, form, setForm, submitting, onSubmit, quotes,
}: NewTradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            New Trade
          </DialogTitle>
          <DialogDescription>Create a new manual trade entry</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Symbol</Label>
              <Select value={form.symbol} onValueChange={v => setForm(f => ({ ...f, symbol: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SYMBOLS.map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Strategy</Label>
              <Select value={form.strategy} onValueChange={v => setForm(f => ({ ...f, strategy: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['RSI', 'MACD', 'Bollinger', 'Trend', 'Manual'].map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Direction</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setForm(f => ({ ...f, direction: 'BUY' }))}
                className={cn(
                  'flex-1 h-10 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1.5',
                  form.direction === 'BUY'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                    : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
                )}
              >
                <ArrowUpRight className="w-4 h-4" /> BUY
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, direction: 'SELL' }))}
                className={cn(
                  'flex-1 h-10 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1.5',
                  form.direction === 'SELL'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
                )}
              >
                <ArrowDownRight className="w-4 h-4" /> SELL
              </button>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Lot Size</Label>
            <Input
              type="number" min={0.01} max={1.00} step={0.01}
              value={form.lotSize}
              onChange={e => setForm(f => ({ ...f, lotSize: parseFloat(e.target.value) || 0.01 }))}
              className="h-9 text-xs font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Entry Price</Label>
              <Input type="number" step="0.00001" value={form.entryPrice}
                onChange={e => setForm(f => ({ ...f, entryPrice: e.target.value }))}
                className="h-9 text-xs font-mono" placeholder="Market" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Stop Loss</Label>
              <Input type="number" step="0.00001" value={form.stopLoss}
                onChange={e => setForm(f => ({ ...f, stopLoss: e.target.value }))}
                className="h-9 text-xs font-mono" placeholder="Optional" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Take Profit</Label>
              <Input type="number" step="0.00001" value={form.takeProfit}
                onChange={e => setForm(f => ({ ...f, takeProfit: e.target.value }))}
                className="h-9 text-xs font-mono" placeholder="Optional" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            className={cn(
              'text-xs gap-1.5',
              form.direction === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-red-600 hover:bg-red-700'
            )}
          >
            {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {form.direction} {form.symbol}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
