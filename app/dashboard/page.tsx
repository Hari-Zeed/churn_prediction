'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchAnalytics, fetchHighRiskCustomers, type AnalyticsKPIs, type RiskBucket, type Customer } from '@/lib/api-client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  TrendingUp, Users, ShieldCheck, Activity, Brain, AlertCircle, IndianRupee,
  RefreshCcw, Phone, Mail, Gift, ChevronRight, Sparkles, Cpu, Target,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { formatINR, formatINRCompact } from '@/lib/currency';
import { useAnimatedCounter } from '@/hooks/use-animated-counter';
import { DashboardTicker } from '@/components/dashboard-ticker';
import { KpiCard } from '@/components/kpi-card';

/* ─── Skeleton loader ──────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="glass premium-shadow rounded-2xl p-6 overflow-hidden relative shimmer-card border border-white/5">
      <div className="flex items-center justify-between mb-5">
        <div className="w-10 h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="w-8 h-3 rounded-full bg-white/5 animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="w-24 h-8 rounded-lg bg-white/5 animate-pulse" />
        <div className="w-32 h-3 rounded-full bg-white/5 animate-pulse" />
        <div className="w-20 h-2 rounded-full bg-white/5 animate-pulse" />
      </div>
    </div>
  );
}

function SkeletonPage() {
  return (
    <div className="space-y-10 pb-20">
      {/* Ticker skeleton */}
      <div className="h-10 rounded-2xl bg-white/5 animate-pulse shimmer-card" />
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="w-72 h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="w-96 h-4 rounded-full bg-white/5 animate-pulse" />
      </div>
      {/* KPI grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      {/* Chart skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="h-80 rounded-2xl bg-white/5 animate-pulse shimmer-card" />
        <div className="h-80 rounded-2xl bg-white/5 animate-pulse shimmer-card" />
      </div>
      {/* Table skeleton */}
      <div className="h-64 rounded-2xl bg-white/5 animate-pulse shimmer-card" />
    </div>
  );
}

/* ─── Animated ring component ──────────────────────────── */
function AnimatedRing({ tier, index, isMuted }: { tier: RiskBucket; index: number; isMuted: boolean }) {
  const radius = 80 - index * 20;
  const circumference = radius * 2 * Math.PI;
  const [dashOffset, setDashOffset] = useState(circumference);

  useEffect(() => {
    const t = setTimeout(() => {
      const targetOffset = circumference - (tier.value / 100) * circumference;
      setDashOffset(targetOffset);
    }, 400 + index * 200);
    return () => clearTimeout(t);
  }, [circumference, tier.value, index]);

  return (
    <svg
      className="absolute inset-0 w-full h-full -rotate-90 overflow-visible pointer-events-none"
      style={{ opacity: isMuted ? 0.15 : 1, transition: 'opacity 0.4s ease' }}
    >
      {/* Track */}
      <circle cx="96" cy="96" r={radius} fill="none" stroke={tier.color} strokeWidth="10" opacity={0.08} />
      {/* Progress */}
      <circle
        cx="96" cy="96" r={radius}
        fill="none"
        stroke={tier.color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transition: `stroke-dashoffset 1.2s cubic-bezier(0.23,1,0.32,1) ${index * 0.15}s`,
          filter: `drop-shadow(0 0 8px ${tier.color}80)`,
        }}
      />
    </svg>
  );
}

/* ─── Main page ─────────────────────────────────────────── */
export default function DashboardPage() {
  const [kpis, setKpis] = useState<AnalyticsKPIs | null>(null);
  const [riskDistribution, setRiskDistribution] = useState<RiskBucket[]>([]);
  const [churnHistogram, setChurnHistogram] = useState<{ range: string; count: number }[]>([]);
  const [highRiskCustomers, setHighRiskCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRiskFilter, setActiveRiskFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, topRisk] = await Promise.all([
        fetchAnalytics(),
        fetchHighRiskCustomers(5),
      ]);
      setKpis(analyticsRes.kpis);
      setRiskDistribution(analyticsRes.riskDistribution ?? []);
      setChurnHistogram(analyticsRes.churnHistogram ?? []);
      setHighRiskCustomers(topRisk);
      setRefreshKey(k => k + 1);
    } catch {
      setError('Failed to load dashboard data. Please ensure the ML pipeline has been run.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  /* Animated KPI counters */
  const totalCustomersAnim = useAnimatedCounter(kpis?.totalCustomers ?? 0, 1600, 200);
  const activeCustomersAnim = useAnimatedCounter(kpis ? kpis.totalCustomers - kpis.highRiskCount : 0, 1600, 300);
  const highRiskAnim = useAnimatedCounter(kpis?.highRiskCount ?? 0, 1600, 400);

  if (loading) return <SkeletonPage />;

  if (error || !kpis) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-6 text-center animate-fade-in">
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 animate-float">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">No ML Data Found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {error ?? 'Run the ML pipeline to populate the database with real predictions.'}
          </p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2 rounded-xl">
          <RefreshCcw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Total Customers',
      rawValue: kpis.totalCustomers,
      displayValue: totalCustomersAnim.toLocaleString(),
      sub: 'In ML dataset',
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      trend: '↑ 2.1%',
      trendUp: true,
    },
    {
      label: 'Active Customers',
      rawValue: kpis.totalCustomers - kpis.highRiskCount,
      displayValue: activeCustomersAnim.toLocaleString(),
      sub: 'Low & Medium Risk Base',
      icon: Brain,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      trend: '↑ 0.8%',
      trendUp: true,
    },
    {
      label: 'Predicted Churn',
      rawValue: kpis.highRiskCount,
      displayValue: highRiskAnim.toLocaleString(),
      sub: 'Requiring immediate action',
      icon: AlertCircle,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      trend: '↓ 3.2%',
      trendUp: false,
    },
    {
      label: 'Retention Rate',
      rawValue: kpis.retentionRate,
      displayValue: `${formatNumber(kpis.retentionRate, 2)}%`,
      sub: 'Projected retained users',
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      trend: '↑ 1.4%',
      trendUp: true,
    },
    {
      label: 'Revenue at Risk',
      rawValue: kpis.revenueImpact,
      displayValue: formatINRCompact(kpis.revenueImpact),
      sub: 'Predicted monthly loss',
      icon: IndianRupee,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      trend: '↓ 5.1%',
      trendUp: false,
    },
    {
      label: 'Avg Lifetime Value',
      rawValue: kpis.avgLifetimeValue,
      displayValue: formatINRCompact(kpis.avgLifetimeValue),
      sub: 'Est. duration × margin',
      icon: TrendingUp,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      trend: '↑ 4.7%',
      trendUp: true,
    },
  ];

  /* Histogram bucket colours */
  const HIST_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#dc2626', '#991b1b', '#7f1d1d', '#450a0a', '#1a0000'];

  return (
    <div key={refreshKey} className="space-y-10 pb-20">

      {/* Live Status Ticker */}
      <DashboardTicker
        totalCustomers={kpis.totalCustomers}
        highRiskCount={kpis.highRiskCount}
        accuracy={82.9}
      />

      {/* ── Header ─────────────────────────── */}
      <div
        ref={headerRef}
        className="relative rounded-3xl overflow-hidden border border-white/5 p-8 dot-grid-bg"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(0,0,0,0) 50%, rgba(6,182,212,0.05) 100%)',
        }}
      >
        {/* Decorative orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 animate-slide-up" style={{ animationDelay: '0ms' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 animate-float">
                <Cpu className="w-5 h-5 text-violet-400" />
              </div>
              <span className="live-badge">ML-Powered Intelligence</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-gradient leading-none">
              Intelligence
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-cyan-400 to-blue-400">
                Overview
              </span>
            </h1>
            <p className="text-sm font-medium text-muted-foreground/70 max-w-lg">
              Real churn predictions from XGBoost model trained on{' '}
              <span className="font-black text-foreground">{kpis.totalCustomers.toLocaleString()}</span>{' '}
              customer records. Updated live.
            </p>
          </div>

          <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">82.9% Accuracy</span>
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={refreshing}
              className="rounded-xl border-white/10 bg-white/5 backdrop-blur-sm font-bold text-xs h-9 gap-2 hover:bg-white/10 transition-all"
            >
              <RefreshCcw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {metricCards.map((card, i) => (
          <KpiCard key={i} {...card} index={i} />
        ))}
      </div>

      {/* ── Charts Row ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Risk Segmentation */}
        <Card
          className="glass premium-shadow border-white/5 overflow-hidden animate-slide-up"
          style={{ animationDelay: '200ms' }}
        >
          <CardHeader className="border-b border-white/5 bg-white/[0.02] pb-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  Risk Segmentation
                  <span className="text-[9px] bg-rose-500/15 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">ML Output</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground/60">Interactive risk profiling across active customer base.</p>
              </div>
              {activeRiskFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveRiskFilter(null)}
                  className="h-7 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-lg"
                >
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-8 flex flex-col md:flex-row items-center justify-center gap-8">
            {/* Animated Rings */}
            <div className="relative w-48 h-48 flex-shrink-0">
              {riskDistribution.map((tier, i) => (
                <AnimatedRing
                  key={`ring-${i}-${tier.name}`}
                  tier={tier}
                  index={i}
                  isMuted={!!(activeRiskFilter && activeRiskFilter !== tier.name)}
                />
              ))}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black tracking-tighter text-foreground">
                  {activeRiskFilter
                    ? riskDistribution.find(r => r.name === activeRiskFilter)?.value + '%'
                    : '100%'}
                </span>
                <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mt-1">
                  {activeRiskFilter ? activeRiskFilter : 'Total Base'}
                </span>
              </div>
            </div>

            {/* Interactive Legend */}
            <div className="flex-1 w-full flex flex-col gap-2.5">
              {riskDistribution.map((tier, i) => {
                const isMuted = !!(activeRiskFilter && activeRiskFilter !== tier.name);
                const growths = ['+2.4%', '-1.2%', '+0.8%'];
                const growth = growths[i] ?? '+0.0%';
                const growthColor = tier.name === 'High Risk'
                  ? growth.startsWith('-') ? 'text-emerald-400' : 'text-rose-400'
                  : growth.startsWith('+') ? 'text-emerald-400' : 'text-rose-400';
                return (
                  <button
                    key={`legend-${i}-${tier.name}`}
                    onClick={() => setActiveRiskFilter(activeRiskFilter === tier.name ? null : tier.name)}
                    className={cn(
                      'flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 w-full text-left group/tier',
                      isMuted ? 'opacity-30 border-white/5 bg-transparent' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-3 h-3">
                        <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: tier.color }} />
                        <span className="relative block w-full h-full rounded-full" style={{ background: tier.color, boxShadow: `0 0 8px ${tier.color}` }} />
                      </div>
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-xs font-bold text-foreground">{tier.name}</span>
                        <span className="text-[9px] text-muted-foreground/50">{tier.count.toLocaleString()} customers</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-black text-foreground tabular-nums">{tier.value}%</span>
                      <span className={cn('text-[9px] font-black uppercase tracking-widest', growthColor)}>{growth} WoW</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Churn Probability Histogram */}
        <Card
          className="glass premium-shadow border-white/5 overflow-hidden animate-slide-up"
          style={{ animationDelay: '300ms' }}
        >
          <CardHeader className="border-b border-white/5 bg-white/[0.02] pb-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Churn Probability Curve
                  <span className="text-[9px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Histogram</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground/60">Distribution of ML risk scores across customer base.</p>
              </div>
              <select className="bg-white/5 border border-white/10 text-[9px] uppercase font-black tracking-widest rounded-lg px-3 py-1.5 text-muted-foreground outline-none hover:text-foreground hover:border-white/20 transition-all cursor-pointer appearance-none">
                <option>All Contracts</option>
                <option>Month-to-Month</option>
                <option>Annual Plan</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="pt-6 pb-2">
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={churnHistogram} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {churnHistogram.map((_, i) => (
                    <linearGradient key={i} id={`hg-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={HIST_COLORS[i] ?? '#6366f1'} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={HIST_COLORS[i] ?? '#6366f1'} stopOpacity={0.3} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                <XAxis dataKey="range" stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} dy={8} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    backgroundColor: 'rgba(10,10,26,0.92)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '14px',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 20px 60px -10px rgba(0,0,0,0.6)',
                    padding: '10px 16px',
                  }}
                  formatter={(val: number) => [<span key="v" className="font-black text-white">{val}</span>, <span key="l" className="text-[9px] font-bold uppercase tracking-widest text-white/40">Customers</span>]}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', fontSize: '10px', marginBottom: '6px' }}
                />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} animationDuration={1400} animationEasing="ease-out" maxBarSize={48}>
                  {churnHistogram.map((_, i) => (
                    <Cell key={i} fill={`url(#hg-${i})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── High-Risk Intelligence Feed ─────── */}
      <Card
        className="glass premium-shadow border-white/5 overflow-hidden animate-slide-up"
        style={{ animationDelay: '400ms' }}
      >
        <CardHeader className="border-b border-white/5 bg-white/[0.02] pb-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-3">
                High-Risk Intelligence Feed
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground/60">Top customers by predicted churn probability — immediate action required.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/40 hover:text-foreground gap-1.5 rounded-xl"
            >
              View All <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-5 pb-6">
          {highRiskCustomers.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Activity className="w-5 h-5 mr-2 opacity-40" />
              <span className="text-sm font-medium">No high-risk customers found.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {highRiskCustomers.map((customer, i) => {
                const isTop = i === 0;
                const prob = customer.churnProbability * 100;
                const barColor = prob >= 80 ? '#ef4444' : prob >= 60 ? '#f97316' : '#eab308';
                return (
                  <div
                    key={customer.id || `hrc-${i}`}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group',
                      'hover:scale-[1.01] hover:shadow-lg',
                      'opacity-0 animate-slide-right',
                      isTop
                        ? 'border-rose-500/25 bg-rose-500/[0.04] hover:bg-rose-500/[0.07] shadow-[0_0_0_1px_rgba(244,63,94,0.15)]'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]',
                    )}
                    style={{ animationDelay: `${500 + i * 80}ms`, animationFillMode: 'forwards' }}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank avatar */}
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border flex-shrink-0 relative',
                        isTop
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                          : 'bg-white/5 border-white/10 text-muted-foreground',
                      )}>
                        {isTop && <div className="absolute inset-0 rounded-xl bg-rose-500/10 animate-pulse" />}
                        <span className="relative">#{i + 1}</span>
                      </div>
                      {/* Customer info */}
                      <div>
                        <p className="text-sm font-black text-foreground uppercase tracking-tight group-hover:text-primary transition-colors">
                          {customer.id}
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mt-0.5">
                          {customer.contractType} · Rev Risk: {formatINR(customer.predictedRevLoss)}/mo
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-5">
                      {/* Action buttons — appear on hover */}
                      <div className="hidden sm:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                        <button className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all" title="Call">
                          <Phone className="w-3 h-3" />
                        </button>
                        <button className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all" title="Email">
                          <Mail className="w-3 h-3" />
                        </button>
                        <button className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all" title="Send Offer">
                          <Gift className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Risk score */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-2xl font-black tabular-nums" style={{ color: barColor }}>
                          {formatNumber(prob, 2)}%
                        </div>
                        <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">Churn Risk</div>
                      </div>

                      {/* Risk bar */}
                      <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 hidden md:block flex-shrink-0">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${prob}%`,
                            background: barColor,
                            boxShadow: `0 0 10px ${barColor}80`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
