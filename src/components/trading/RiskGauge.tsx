'use client';

import React from 'react';

interface RiskGaugeProps {
  current: number;
  max: number;
  lotExposure: number;
}

export default function RiskGauge({ current, max, lotExposure }: RiskGaugeProps) {
  const ratio = max > 0 ? Math.min(current / max, 1) : 0;
  const color = ratio < 0.5 ? '#22c55e' : ratio < 0.8 ? '#f59e0b' : '#ef4444';
  const angle = -135 + ratio * 270;
  const radians = (angle * Math.PI) / 180;
  const cx = 60;
  const cy = 60;
  const r = 42;
  const x = cx + r * Math.cos(radians);
  const y = cy + r * Math.sin(radians);

  return (
    <svg width="120" height="80" viewBox="0 0 120 80">
      <path d="M 18 60 A 42 42 0 0 1 102 60" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round" />
      <path d="M 18 60 A 42 42 0 0 1 60 18" fill="none" stroke="rgba(34,197,94,0.2)" strokeWidth="8" strokeLinecap="round" />
      <path d="M 60 18 A 42 42 0 0 1 94 36" fill="none" stroke="rgba(245,158,11,0.2)" strokeWidth="8" strokeLinecap="round" />
      <path d="M 94 36 A 42 42 0 0 1 102 60" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="8" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={color} />
      <text x="14" y="75" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">LOW</text>
      <text x="48" y="14" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">MED</text>
      <text x="88" y="75" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">HIGH</text>
      <text x={cx} y={cy + 18} fill={color} fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        {lotExposure.toFixed(2)} lots
      </text>
    </svg>
  );
}
