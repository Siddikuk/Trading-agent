'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Gauge, Shield, Target, Play, Square, Zap, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import RiskGauge from './RiskGauge';
import type { AgentState, Trade } from './types';

interface AgentTabProps {
  agentState: AgentState | null;
  openTrades: Trade[];
  maxConcurrent: number;
  isScanning: boolean;
  onAgentToggle: (key: 'isRunning' | 'autoTrade', value: boolean) => void;
  onUpdateAgent: (updates: Record<string, unknown>) => void;
  onScan: () => void;
}

export default function AgentTab({
  agentState, openTrades, maxConcurrent, isScanning,
  onAgentToggle, onUpdateAgent, onScan,
}: AgentTabProps) {
  return (
    <div className="flex-1 overflow-y-auto m-0 p-3 space-y-3">
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Risk Exposure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-2">
            <RiskGauge
              current={openTrades.length}
              max={maxConcurrent}
              lotExposure={openTrades.reduce((sum, t) => sum + t.lotSize, 0)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-center mt-2">
            <div className="rounded-md bg-muted/30 p-2">
              <div className="text-muted-foreground">Positions</div>
              <div className="font-mono font-bold">{openTrades.length} / {maxConcurrent}</div>
            </div>
            <div className="rounded-md bg-muted/30 p-2">
              <div className="text-muted-foreground">Lot Exposure</div>
              <div className="font-mono font-bold">{openTrades.reduce((s, t) => s + t.lotSize, 0).toFixed(2)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Agent Control
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Agent Status</div>
              <div className="text-xs text-muted-foreground">{agentState?.isRunning ? 'AI analyzing news, sentiment & technicals' : 'AI agent is stopped'}</div>
            </div>
            <Button
              variant={agentState?.isRunning ? 'destructive' : 'default'}
              size="sm"
              onClick={() => onAgentToggle('isRunning', !agentState?.isRunning)}
              className="gap-1"
            >
              {agentState?.isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {agentState?.isRunning ? 'Stop' : 'Start'}
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Auto-Trade</div>
              <div className="text-xs text-muted-foreground">{agentState?.autoTrade ? 'AI executes trades automatically' : 'Signals only — no auto execution'}</div>
            </div>
            <Switch
              checked={agentState?.autoTrade || false}
              onCheckedChange={(v) => onAgentToggle('autoTrade', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4" />
            Risk Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Balance</span>
              <span className="text-sm font-mono font-bold text-emerald-400">
                ${agentState?.balance?.toLocaleString() || '1,000'}
              </span>
            </div>
            <input type="range" min={100} max={100000} step={100}
              value={agentState?.balance || 1000}
              onChange={e => onUpdateAgent({ balance: Number(e.target.value) })}
              className="w-full h-1.5 accent-emerald-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Risk per Trade</span>
              <span className="text-sm font-mono font-bold">{agentState?.maxRiskPercent || 2}%</span>
            </div>
            <input type="range" min={0.5} max={10} step={0.5}
              value={agentState?.maxRiskPercent || 2}
              onChange={e => onUpdateAgent({ maxRiskPercent: Number(e.target.value) })}
              className="w-full h-1.5 accent-amber-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Daily Risk Limit</span>
              <span className="text-sm font-mono font-bold">{agentState?.dailyRiskLimit || 5}%</span>
            </div>
            <input type="range" min={1} max={20} step={1}
              value={agentState?.dailyRiskLimit || 5}
              onChange={e => onUpdateAgent({ dailyRiskLimit: Number(e.target.value) })}
              className="w-full h-1.5 accent-red-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Max Drawdown</span>
              <span className="text-sm font-mono font-bold">{agentState?.maxDrawdownPercent || 10}%</span>
            </div>
            <input type="range" min={5} max={50} step={5}
              value={agentState?.maxDrawdownPercent || 10}
              onChange={e => onUpdateAgent({ maxDrawdownPercent: Number(e.target.value) })}
              className="w-full h-1.5 accent-red-400" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={onScan} disabled={isScanning || !agentState?.isRunning} className="w-full gap-2 h-10">
        {isScanning ? (
          <><RefreshCw className="w-4 h-4 animate-spin" /> Scanning...</>
        ) : (
          <><Zap className="w-4 h-4" /> AI Scan</>
        )}
      </Button>
    </div>
  );
}
