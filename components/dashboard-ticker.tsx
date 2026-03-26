'use client';

import { useEffect, useState } from 'react';
import { Brain, Wifi, Clock, Zap, TrendingUp } from 'lucide-react';

interface DashboardTickerProps {
  totalCustomers?: number;
  highRiskCount?: number;
  accuracy?: number;
}

export function DashboardTicker({ totalCustomers = 5000, highRiskCount = 1228, accuracy = 82.9 }: DashboardTickerProps) {
  const [time, setTime] = useState('');
  const [ping, setPing] = useState(12);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setPing(Math.floor(Math.random() * 8) + 8), 3000);
    return () => clearInterval(interval);
  }, []);

  const items = [
    {
      icon: Wifi,
      label: 'Status',
      value: 'LIVE',
      color: 'text-emerald-400',
      dot: true,
    },
    {
      icon: Brain,
      label: 'XGBoost Model',
      value: `${accuracy}% ACC`,
      color: 'text-violet-400',
    },
    {
      icon: TrendingUp,
      label: 'High Risk',
      value: highRiskCount.toLocaleString(),
      color: 'text-rose-400',
    },
    {
      icon: Zap,
      label: 'Customers',
      value: totalCustomers.toLocaleString(),
      color: 'text-cyan-400',
    },
    {
      icon: Clock,
      label: 'Updated',
      value: time,
      color: 'text-amber-400',
    },
    {
      icon: Wifi,
      label: 'Latency',
      value: `${ping}ms`,
      color: 'text-green-400',
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-r from-black/40 via-[#0a0a1a]/60 to-black/40 backdrop-blur-xl mb-8 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, white 2px, white 3px)',
      }} />
      {/* Glow left */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-violet-500/10 to-transparent pointer-events-none" />
      {/* Glow right */}
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-cyan-500/10 to-transparent pointer-events-none" />

      <div className="flex items-center h-10 px-4 gap-6 overflow-x-auto scrollbar-none">
        {/* Brand chip */}
        <div className="flex items-center gap-2 shrink-0 border-r border-white/10 pr-6">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60">Enterprise ML</span>
        </div>

        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-center gap-1.5 shrink-0 border-r border-white/5 pr-6 last:border-r-0">
              <Icon className={`w-3 h-3 ${item.color} opacity-70`} />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">{item.label}</span>
              <span className={`text-[9px] font-black tabular-nums ${item.color}`}>{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
