'use client';

import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  History,
  AlertCircle,
  Loader2,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils/format';

export interface PredictionHistoryRecord {
  id: string;
  customerId: string;
  churnProbability: number;
  predictedChurn: number;
  churnVelocity: number;
  churnTrend: string;
  createdAt: string;
}

interface CustomerPredictionHistoryProps {
  customerId: string;
  currentProbability?: number;
  currentTrend?: string;
  currentVelocity?: number;
}

export function CustomerPredictionHistory({
  customerId,
  currentProbability,
  currentTrend = 'Stable',
  currentVelocity = 0,
}: CustomerPredictionHistoryProps) {
  const [history, setHistory] = useState<PredictionHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/history`);
        if (!res.ok) {
          throw new Error(`Failed to load history (${res.status})`);
        }
        const json = await res.json();
        if (isMounted) {
          setHistory(json.history || []);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Error loading history');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (customerId) {
      loadHistory();
    }
    return () => {
      isMounted = false;
    };
  }, [customerId]);

  // Combine historical records with the current live prediction (chronologically oldest to newest)
  // History is returned newest-first from API, so reverse it for chronological chart
  const chronologicalHistory = [...history].reverse();

  // Build chart dataset
  const chartData = chronologicalHistory.map((item, idx) => {
    const dateObj = new Date(item.createdAt);
    const dateLabel = isNaN(dateObj.getTime())
      ? `Run #${idx + 1}`
      : dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return {
      run: `T-${chronologicalHistory.length - idx}`,
      date: dateLabel,
      probability: Math.round(item.churnProbability * 1000) / 10, // e.g. 45.2%
      velocity: item.churnVelocity,
      trend: item.churnTrend,
      isCurrent: false,
    };
  });

  // If current prediction is available, append as the latest live data point
  if (currentProbability !== undefined && chartData.length > 0) {
    chartData.push({
      run: 'Current',
      date: 'Latest Run',
      probability: Math.round(currentProbability * 1000) / 10,
      velocity: currentVelocity,
      trend: currentTrend,
      isCurrent: true,
    });
  } else if (chartData.length === 0 && currentProbability !== undefined) {
    chartData.push({
      run: 'Current',
      date: 'Baseline',
      probability: Math.round(currentProbability * 1000) / 10,
      velocity: currentVelocity,
      trend: currentTrend,
      isCurrent: true,
    });
  }

  // Determine trend aesthetic theme
  const latestTrend = currentTrend || (history[0]?.churnTrend ?? 'Stable');
  const isIncreasing = latestTrend.includes('Increasing');
  const isImproving = latestTrend.includes('Improving');

  const theme = isIncreasing
    ? {
        color: '#f43f5e',
        gradientStop: 'rgba(244, 63, 94, 0.35)',
        badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        icon: TrendingUp,
        label: 'Risk Escalating',
      }
    : isImproving
    ? {
        color: '#10b981',
        gradientStop: 'rgba(16, 185, 129, 0.35)',
        badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        icon: TrendingDown,
        label: 'Risk Diminishing',
      }
    : {
        color: '#06b6d4',
        gradientStop: 'rgba(6, 182, 212, 0.35)',
        badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
        icon: Activity,
        label: 'Stable Trajectory',
      };

  const TrendIcon = theme.icon;

  if (loading) {
    return (
      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-center gap-3 py-10">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Loading Prediction Timeline...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Prediction history unavailable: {error}</span>
      </div>
    );
  }

  const minProb = Math.min(...chartData.map((d) => d.probability));
  const maxProb = Math.max(...chartData.map((d) => d.probability));
  const deltaOverall = chartData.length > 1
    ? chartData[chartData.length - 1].probability - chartData[0].probability
    : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/30 backdrop-blur-md p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-white/5 border border-white/10">
            <History className="w-4 h-4 text-foreground/80" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">
              Prediction History & Velocity Trend
            </h4>
            <p className="text-[10px] text-muted-foreground font-medium">
              Tracking model iterations (Last {chartData.length} checkpoints)
            </p>
          </div>
        </div>

        {/* Visual Risk Status Badge */}
        <div className={cn(
          "px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5",
          theme.badgeBg
        )}>
          <TrendIcon className="w-3 h-3" />
          <span>{latestTrend}</span>
        </div>
      </div>

      {/* Sparkline Chart */}
      <div className="relative pt-2">
        {chartData.length <= 1 ? (
          <div className="h-28 flex flex-col items-center justify-center rounded-xl bg-black/20 border border-dashed border-white/10 text-center px-4">
            <Activity className="w-5 h-5 text-muted-foreground/60 mb-1" />
            <p className="text-xs font-bold text-foreground/80">Initial Baseline Established</p>
            <p className="text-[10px] text-muted-foreground">
              Churn probability is currently {currentProbability !== undefined ? `${formatNumber(currentProbability * 100, 1)}%` : 'recorded'}. Historical trend lines populate as new batch predictions execute.
            </p>
          </div>
        ) : (
          <div className="w-full h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.color} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={theme.color} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="run"
                  stroke="rgba(255,255,255,0.25)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.25)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  domain={[Math.max(0, Math.floor(minProb - 5)), Math.min(100, Math.ceil(maxProb + 5))]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl bg-card/95 border border-white/10 shadow-2xl backdrop-blur-xl text-[11px] space-y-1">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
                            <Calendar className="w-3 h-3" />
                            <span>{data.date}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Risk Probability:</span>
                            <span className="font-black text-foreground text-xs">{data.probability}%</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Velocity:</span>
                            <span className={cn(
                              "font-bold",
                              data.velocity > 0 ? "text-rose-400" : data.velocity < 0 ? "text-emerald-400" : "text-muted-foreground"
                            )}>
                              {data.velocity >= 0 ? '+' : ''}{formatNumber(data.velocity * 100, 2)}pp
                            </span>
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-black pt-1 border-t border-white/5">
                            Status: <span className="text-foreground">{data.trend}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="probability"
                  stroke={theme.color}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#historyGradient)"
                  dot={{ r: 3, fill: theme.color, strokeWidth: 1.5, stroke: '#0f172a' }}
                  activeDot={{ r: 5, fill: '#ffffff', stroke: theme.color, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Trajectory KPIs */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
        <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">
            Net Trajectory
          </p>
          <p className={cn(
            "text-xs font-black",
            deltaOverall > 0 ? "text-rose-400" : deltaOverall < 0 ? "text-emerald-400" : "text-muted-foreground"
          )}>
            {deltaOverall >= 0 ? '+' : ''}{formatNumber(deltaOverall, 1)}pp
          </p>
        </div>

        <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">
            Range Low / Peak
          </p>
          <p className="text-xs font-black text-foreground">
            {formatNumber(minProb, 1)}% / {formatNumber(maxProb, 1)}%
          </p>
        </div>

        <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">
            Historical Points
          </p>
          <p className="text-xs font-black text-foreground">
            {chartData.length} records
          </p>
        </div>
      </div>
    </div>
  );
}
