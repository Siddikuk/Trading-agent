'use client';

import React, { useRef, useEffect } from 'react';

interface EquityCurveChartProps {
  data: { date: string; equity: number }[];
}

export default function EquityCurveChart({ data }: EquityCurveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const container = canvas.parentElement;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 8, right: 4, bottom: 16, left: 4 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const values = data.map(d => d.equity);
    const minV = Math.min(...values) * 0.998;
    const maxV = Math.max(...values) * 1.002;
    const rangeV = maxV - minV || 1;

    const toX = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
    const toY = (v: number) => PAD.top + (1 - (v - minV) / rangeV) * chartH;

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].equity));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(data[i].equity));
    }
    ctx.lineTo(toX(data.length - 1), H - PAD.bottom);
    ctx.lineTo(toX(0), H - PAD.bottom);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    if (data[data.length - 1].equity >= data[0].equity) {
      grad.addColorStop(0, 'rgba(34,197,94,0.15)');
      grad.addColorStop(1, 'rgba(34,197,94,0.01)');
    } else {
      grad.addColorStop(0, 'rgba(239,68,68,0.15)');
      grad.addColorStop(1, 'rgba(239,68,68,0.01)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].equity));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(data[i].equity));
    }
    ctx.strokeStyle = data[data.length - 1].equity >= data[0].equity ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.stroke();

    const lastX = toX(data.length - 1);
    const lastY = toY(data[data.length - 1].equity);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = data[data.length - 1].equity >= data[0].equity ? '#22c55e' : '#ef4444';
    ctx.fill();
  }, [data]);

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
