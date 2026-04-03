'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Settings, Plug, Unplug, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
  mt5BridgeUrl: string | null;
  mt5Connected: boolean;
  onSetBridgeUrl: (url: string) => void;
  onTestBridge: () => void;
  onOpenWizard: () => void;
}

export default function SettingsDialog({
  open, onOpenChange, strategiesEnabled, setStrategiesEnabled,
  scanInterval, setScanInterval, defaultLotSize, setDefaultLotSize,
  maxConcurrent, setMaxConcurrent, updateAgent,
  mt5BridgeUrl, mt5Connected, onSetBridgeUrl, onTestBridge, onOpenWizard,
}: SettingsDialogProps) {
  const [bridgeUrlInput, setBridgeUrlInput] = useState('');
  const [bridgeTesting, setBridgeTesting] = useState(false);

  const handleBridgeSave = async () => {
    if (!bridgeUrlInput.trim()) return;
    onSetBridgeUrl(bridgeUrlInput.trim());
  };

  const handleTestBridge = async () => {
    setBridgeTesting(true);
    await onTestBridge();
    setBridgeTesting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Agent Settings
          </DialogTitle>
          <DialogDescription>Configure trading strategies and parameters</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* MT5 Bridge Section */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
              <Plug className="w-3.5 h-3.5" />
              MT5 Bridge Connection
            </Label>
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                mt5Connected ? 'bg-emerald-400' : 'bg-red-400'
              )} />
              <Badge variant="outline" className={cn(
                'text-[10px]',
                mt5Connected ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'
              )}>
                {mt5Connected ? 'Connected' : 'Disconnected'}
              </Badge>
              {!mt5Connected && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary ml-auto" onClick={onOpenWizard}>
                  Setup Guide
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="http://your-vps-ip:8080"
                value={bridgeUrlInput || mt5BridgeUrl || ''}
                onChange={e => setBridgeUrlInput(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
                onKeyDown={e => { if (e.key === 'Enter') handleBridgeSave(); }}
              />
              <Button
                size="sm"
                variant={mt5Connected ? 'destructive' : 'default'}
                className="h-8 text-xs"
                onClick={handleBridgeSave}
                disabled={!bridgeUrlInput.trim() && !mt5BridgeUrl}
              >
                {mt5Connected ? <Unplug className="w-3.5 h-3.5" /> : <Plug className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={handleTestBridge}
                disabled={bridgeTesting || !mt5BridgeUrl}
              >
                <RefreshCw className={cn('w-3.5 h-3.5', bridgeTesting && 'animate-spin')} />
              </Button>
            </div>
          </div>
          <Separator />
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
