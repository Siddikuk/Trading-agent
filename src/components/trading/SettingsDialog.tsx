'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SCAN_INTERVALS, STRATEGY_COLORS } from './types';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategiesEnabled: Record<string, boolean>;
  setStrategiesEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  scanInterval: number;
  setScanInterval: React.Dispatch<React.SetStateAction<number>>;
  defaultLotSize: number;
  setDefaultLotSize: React.Dispatch<React.SetStateAction<number>>;
  maxConcurrent: number;
  setMaxConcurrent: React.Dispatch<React.SetStateAction<number>>;
  updateAgent: (updates: Record<string, unknown>) => void;
}

export default function SettingsDialog({
  open, onOpenChange, strategiesEnabled, setStrategiesEnabled,
  scanInterval, setScanInterval, defaultLotSize, setDefaultLotSize,
  maxConcurrent, setMaxConcurrent, updateAgent,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Agent Settings
          </DialogTitle>
          <DialogDescription>Configure trading strategies and parameters</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Active Strategies</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['RSI', 'MACD', 'Bollinger', 'Trend'] as const).map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer rounded-md p-2 hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={strategiesEnabled[s]}
                    onCheckedChange={(checked) => {
                      const next = { ...strategiesEnabled, [s]: !!checked };
                      setStrategiesEnabled(next);
                      const activeStrats = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
                      updateAgent({ strategies: activeStrats.join(',') });
                    }}
                  />
                  <span className={cn('text-xs font-medium', STRATEGY_COLORS[s])}>{s}</span>
                </label>
              ))}
            </div>
          </div>
          <Separator />
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Auto-Scan Interval</Label>
            <Select value={String(scanInterval)} onValueChange={(v) => setScanInterval(parseInt(v, 10))}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCAN_INTERVALS.map(si => (
                  <SelectItem key={si.value} value={String(si.value)} className="text-xs">{si.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Default Lot Size</Label>
            <Input
              type="number" min={0.01} max={1.00} step={0.01}
              value={defaultLotSize}
              onChange={e => setDefaultLotSize(parseFloat(e.target.value) || 0.01)}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Max Concurrent Positions</Label>
            <Input
              type="number" min={1} max={10} step={1}
              value={maxConcurrent}
              onChange={e => setMaxConcurrent(parseInt(e.target.value, 10) || 1)}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
