'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  rawValue: number;
  displayValue: string;
  sub: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  index: number;
  trend?: string;
  trendUp?: boolean;
}

export function KpiCard({ label, displayValue, sub, icon: Icon, color, bg, index, trend, trendUp }: KpiCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    const t = setTimeout(() => {
      el.style.transition = 'opacity 0.6s cubic-bezier(0.23,1,0.32,1), transform 0.6s cubic-bezier(0.23,1,0.32,1)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 80 + index * 100);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div ref={cardRef}>
      <Card className={cn(
        'glass premium-shadow overflow-hidden group border-white/5 relative',
        'hover:scale-[1.025] hover:border-white/10 transition-all duration-500',
        'after:absolute after:inset-0 after:bg-gradient-to-br after:from-white/[0.03] after:to-transparent after:pointer-events-none',
      )}>
        {/* Shimmer sweep */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none z-10" />
        <CardContent className="p-6 relative">
          <div className="flex items-center justify-between mb-5">
            <div className={cn(
              'p-2.5 rounded-xl border border-white/5 relative transition-all duration-500',
              bg,
              'group-hover:scale-110 group-hover:shadow-lg',
            )}>
              <Icon className={cn('w-4 h-4', color)} />
              {/* Icon glow */}
              <div className={cn('absolute inset-0 rounded-xl blur-sm opacity-0 group-hover:opacity-60 transition-opacity duration-500', bg)} />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                Live
              </span>
              {trend && (
                <span className={cn(
                  'text-[9px] font-black uppercase tracking-widest',
                  trendUp ? 'text-green-400' : 'text-red-400',
                )}>
                  {trend}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-black text-foreground tracking-tighter tabular-nums">
              {displayValue}
            </div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{label}</div>
            <p className="text-[10px] font-medium text-muted-foreground/50 pt-0.5">{sub}</p>
          </div>
          {/* Bottom gradient line */}
          <div className={cn(
            'absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500',
            `bg-gradient-to-r from-transparent ${color.replace('text-', 'via-')} to-transparent`,
          )} />
        </CardContent>
      </Card>
    </div>
  );
}
