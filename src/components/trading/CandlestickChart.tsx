'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

export interface CandleData { time: number; open: number; high: number; low: number; close: number; volume: number; }
export interface IndicatorData { rsi?: number; macdLine?: number; macdSignal?: number; macdHistogram?: number; bollingerUpper?: number; bollingerMiddle?: number; bollingerLower?: number; ema9?: number; ema21?: number; ema50?: number; ema200?: number; atr?: number; adx?: number; }

export default function CandlestickChart({ candles, indicators }: { candles: CandleData[]; indicators: IndicatorData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);
  const mouseRef = useRef({ x: -1, y: -1 });
  const [hoverInfo, setHoverInfo] = useState<{ candle: CandleData | null; x: number; y: number } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current = { x, y };
    const PAD = { top: 10, right: 60, bottom: 24, left: 4 };
    const chartW = rect.width - PAD.left - PAD.right;
    const candleW = chartW / candles.length;
    const idx = Math.floor((x - PAD.left) / candleW);
    if (idx >= 0 && idx < candles.length) setHoverInfo({ candle: candles[idx], x, y });
    else setHoverInfo(null);
  }, [candles]);

  const handleMouseLeave = useCallback(() => { mouseRef.current = { x: -1, y: -1 }; setHoverInfo(null); }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const volumeH = rect.height * 0.15;
    const rsiH = 60;
    const mainChartH = rect.height - volumeH - rsiH;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const W = rect.width; const H = rect.height;
    const PAD = { top: 10, right: 60, bottom: 0, left: 4 };
    const chartW = W - PAD.left - PAD.right;
    const allHighs = candles.map(c => c.high);
    const allLows = candles.map(c => c.low);
    const prices = [...allHighs, ...allLows];
    if (indicators.bollingerUpper) prices.push(indicators.bollingerUpper);
    if (indicators.bollingerLower) prices.push(indicators.bollingerLower);
    const minP = Math.min(...prices) * 0.999;
    const maxP = Math.max(...prices) * 1.001;
    const range = maxP - minP;
    const candleW = chartW / candles.length;
    const bodyW = Math.max(1, candleW * 0.6);
    const priceToY = (p: number) => PAD.top + (1 - (p - minP) / range) * mainChartH;
    const yToPrice = (y: number) => minP + (1 - (y - PAD.top) / mainChartH) * range;

    ctx.fillStyle = 'transparent'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 6; i++) {
      const y = PAD.top + (i / 6) * mainChartH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText(yToPrice(y).toFixed(5), W - PAD.right + 4, y + 3);
    }

    const emaConfigs: { key: keyof IndicatorData; color: string }[] = [
      { key: 'ema9', color: 'rgba(34,197,94,0.6)' }, { key: 'ema21', color: 'rgba(6,182,212,0.6)' }, { key: 'ema50', color: 'rgba(245,158,11,0.5)' },
    ];
    for (const { key, color } of emaConfigs) {
      if (!indicators[key]) continue;
      const y = priceToY(indicators[key]!);
      if (y >= PAD.top && y <= PAD.top + mainChartH) {
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    if (indicators.bollingerUpper && indicators.bollingerLower) {
      ctx.fillStyle = 'rgba(139,92,246,0.05)';
      ctx.fillRect(PAD.left, priceToY(indicators.bollingerUpper), chartW, priceToY(indicators.bollingerLower) - priceToY(indicators.bollingerUpper));
    }

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]; const x = PAD.left + i * candleW + candleW / 2;
      const isUp = c.close >= c.open; const color = isUp ? '#22c55e' : '#ef4444';
      const oY = priceToY(c.open); const cY = priceToY(c.close); const hY = priceToY(c.high); const lY = priceToY(c.low);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();
      const bodyTop = Math.min(oY, cY); const bodyH = Math.max(1, Math.abs(cY - oY));
      if (isUp) { ctx.fillStyle = '#0d1117'; ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x - bodyW / 2, bodyTop, bodyW, bodyH); }
      else { ctx.fillStyle = color; ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH); }
    }

    if (candles.length > 0) {
      const last = candles[candles.length - 1]; const y = priceToY(last.close);
      ctx.strokeStyle = last.close >= last.open ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = last.close >= last.open ? '#22c55e' : '#ef4444'; ctx.fillRect(W - PAD.right, y - 9, PAD.right, 18);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'; ctx.fillText(last.close.toFixed(5), W - PAD.right + 4, y + 3);
    }

    const mx = mouseRef.current.x; const my = mouseRef.current.y;
    if (mx > PAD.left && mx < W - PAD.right && my > PAD.top && my < PAD.top + mainChartH) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(mx, PAD.top); ctx.lineTo(mx, PAD.top + mainChartH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD.left, my); ctx.lineTo(W - PAD.right, my); ctx.stroke(); ctx.setLineDash([]);
      const crossPrice = yToPrice(my); ctx.fillStyle = 'rgba(100,100,100,0.9)'; ctx.fillRect(W - PAD.right, my - 9, PAD.right, 18);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.fillText(crossPrice.toFixed(5), W - PAD.right + 4, my + 3);
    }

    const volumeTop = PAD.top + mainChartH + 4; const maxVol = Math.max(...candles.map(c => c.volume), 1); const volumeChartH = volumeH - 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top + mainChartH + 2); ctx.lineTo(W - PAD.right, PAD.top + mainChartH + 2); ctx.stroke();
    ctx.font = '8px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.textAlign = 'left';
    ctx.fillText('VOL', W - PAD.right + 4, volumeTop + volumeChartH / 2 + 3);
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]; const x = PAD.left + i * candleW + candleW / 2; const isUp = c.close >= c.open;
      const barH = (c.volume / maxVol) * volumeChartH;
      ctx.fillStyle = isUp ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
      ctx.fillRect(x - bodyW / 2, volumeTop + volumeChartH - barH, bodyW, barH);
    }

    const rsiTop = volumeTop + volumeH + 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, rsiTop); ctx.lineTo(W - PAD.right, rsiTop); ctx.stroke();
    ctx.font = '8px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.textAlign = 'left'; ctx.fillText('RSI', W - PAD.right + 4, rsiTop + 10);

    if (indicators.rsi !== undefined) {
      const rsiChartH = rsiH - 12; const rsiToY = (v: number) => rsiTop + 6 + (1 - v / 100) * rsiChartH;
      ctx.fillStyle = 'rgba(239,68,68,0.06)'; ctx.fillRect(PAD.left, rsiToY(100), chartW, rsiToY(70) - rsiToY(100));
      ctx.fillStyle = 'rgba(34,197,94,0.06)'; ctx.fillRect(PAD.left, rsiToY(30), chartW, rsiToY(0) - rsiToY(30));
      [30, 50, 70].forEach(level => {
        const ly = rsiToY(level); ctx.strokeStyle = level === 50 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(PAD.left, ly); ctx.lineTo(W - PAD.right, ly); ctx.stroke(); ctx.setLineDash([]);
      });
      ctx.font = '8px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.textAlign = 'left';
      ctx.fillText('70', W - PAD.right + 4, rsiToY(70) + 3); ctx.fillText('30', W - PAD.right + 4, rsiToY(30) + 3);
      const rsiVal = indicators.rsi; const rsiY = rsiToY(rsiVal); const rsi50Y = rsiToY(50);
      ctx.fillStyle = rsiVal > 70 ? 'rgba(239,68,68,0.5)' : rsiVal < 30 ? 'rgba(34,197,94,0.5)' : 'rgba(168,85,247,0.3)';
      ctx.fillRect(PAD.left + chartW / 2 - 20, Math.min(rsiY, rsi50Y), 40, Math.abs(rsiY - rsi50Y));
      ctx.fillStyle = rsiVal > 70 ? '#ef4444' : rsiVal < 30 ? '#22c55e' : 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText(rsiVal.toFixed(1), PAD.left + chartW / 2, Math.min(rsiY, rsi50Y) - 4);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    const timeStep = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += timeStep) {
      const x = PAD.left + i * candleW + candleW / 2; const d = new Date(candles[i].time);
      ctx.fillText(d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'), x, H - 2);
    }
  }, [candles, indicators]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {candles.length === 0 ? (
        <div className="flex items-center justify-center h-full"><Skeleton className="w-full h-full rounded-lg" /></div>
      ) : (
        <>
          <canvas ref={canvasRef} className="w-full h-full" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
          <AnimatePresence>
            {hoverInfo?.candle && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute pointer-events-none z-10 bg-card/95 backdrop-blur-sm border border-border rounded-md px-3 py-2 shadow-lg"
                style={{ left: Math.min(hoverInfo.x + 12, containerWidth - 180), top: Math.max(10, hoverInfo.y - 60) }}>
                <div className="text-[10px] font-mono space-y-0.5">
                  <div className="text-muted-foreground">{new Date(hoverInfo.candle.time).toLocaleDateString()} {new Date(hoverInfo.candle.time).toLocaleTimeString()}</div>
                  <div className="grid grid-cols-2 gap-x-3">
                    <span className="text-muted-foreground">O:</span><span className={hoverInfo.candle.close >= hoverInfo.candle.open ? 'text-emerald-400' : 'text-red-400'}>{hoverInfo.candle.open.toFixed(5)}</span>
                    <span className="text-muted-foreground">H:</span><span className="text-foreground">{hoverInfo.candle.high.toFixed(5)}</span>
                    <span className="text-muted-foreground">L:</span><span className="text-foreground">{hoverInfo.candle.low.toFixed(5)}</span>
                    <span className="text-muted-foreground">C:</span><span className={hoverInfo.candle.close >= hoverInfo.candle.open ? 'text-emerald-400' : 'text-red-400'}>{hoverInfo.candle.close.toFixed(5)}</span>
                    <span className="text-muted-foreground">Vol:</span><span className="text-foreground">{hoverInfo.candle.volume.toLocaleString()}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
