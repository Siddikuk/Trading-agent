'use client';

import React from 'react';

interface ScanLogProps {
  log: string[];
}

export default function ScanLog({ log }: ScanLogProps) {
  return (
    <div className="flex-1 overflow-y-auto m-0 p-3">
      <div className="space-y-1 font-mono text-xs">
        <div className="text-muted-foreground mb-2">Agent Activity Log</div>
        {log.length === 0 && (
          <div className="text-muted-foreground py-8 text-center">No activity yet. Start the agent to begin scanning.</div>
        )}
        {log.slice(-50).reverse().map((entry, i) => (
          <div key={i} className="animate-slide-up text-muted-foreground">
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
}
