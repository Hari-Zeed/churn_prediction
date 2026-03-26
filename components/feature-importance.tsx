'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils/format';

interface Feature {
  feature: string;
  impact: number;  // 0-100
}

interface FeatureImportanceProps {
  features: Feature[];
  className?: string;
}

const IMPACT_COLOR = (impact: number) => {
  if (impact >= 70) return 'from-red-500 to-rose-400';
  if (impact >= 50) return 'from-orange-500 to-amber-400';
  if (impact >= 30) return 'from-yellow-500 to-lime-400';
  return 'from-blue-500 to-cyan-400';
};

export function FeatureImportance({ features, className }: FeatureImportanceProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const timers = features.map((feat, i) => {
      return setTimeout(() => {
        const el = barRefs.current[i];
        if (el) el.style.width = `${feat.impact}%`;
      }, 150 + i * 120);
    });
    return () => timers.forEach(clearTimeout);
  }, [features]);

  return (
    <div className={cn('space-y-5', className)}>
      {features.map((feat, i) => (
        <div key={`feat-${i}`}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {feat.feature}
            </span>
            <span className="text-sm font-black text-foreground tabular-nums">
              {formatNumber(feat.impact)}%
            </span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              ref={(el) => { barRefs.current[i] = el; }}
              className={cn(
                'absolute top-0 left-0 h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out',
                IMPACT_COLOR(feat.impact),
              )}
              style={{ width: '0%', boxShadow: '0 0 8px 2px rgba(139,92,246,0.4)' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
