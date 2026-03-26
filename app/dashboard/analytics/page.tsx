'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchAnalytics, type AnalyticsResponse } from '@/lib/api-client';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  AreaChart, Area, ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TrendingUp, Users, Brain, Activity, ArrowRightCircle, RefreshCcw, AlertCircle, IndianRupee } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { formatINR, formatINRCompact } from '@/lib/currency';
import Link from 'next/link';

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAnalytics();
      setData(res);
    } catch {
      setError('Failed to load analytics. Ensure the ML pipeline has been run.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse">Initializing Analytics Matrix...</p>
      </div>
    );
  }

  if (error || !data?.kpis) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <AlertCircle className="w-10 h-10 text-red-500/40" />
        <p className="text-sm font-bold text-muted-foreground">{error ?? 'No analytics data. Run the ML pipeline first.'}</p>
        <Button onClick={loadData} variant="outline" size="sm" className="gap-2">
          <RefreshCcw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const { kpis, riskDistribution, churnHistogram, engagementTrend, revenueByContract, retentionTrends, tenureVsRisk } = data;

  return (
    <div className="space-y-10 pb-20 enterprise-gradient">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient">
            Analytics Matrix
            <span className="ml-3 text-[10px] bg-secondary/20 text-secondary border border-secondary/20 px-2.5 py-1 rounded-full uppercase font-black tracking-widest align-middle">ML-Driven</span>
          </h1>
          <p className="text-sm font-medium text-muted-foreground/80">
            Churn analytics derived from XGBoost predictions on {kpis.totalCustomers.toLocaleString()} customers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={loadData} variant="outline" size="sm" className="gap-2 rounded-xl h-9">
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Link href="/dashboard/analytics/model-eval">
            <Button size="sm" className="gap-2 rounded-xl h-9 font-bold text-xs">
              <Brain className="w-3.5 h-3.5" /> Model Evaluation
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { label: 'Total Revenue at Risk', value: formatINRCompact(kpis.revenueImpact), icon: IndianRupee, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: 'Avg Lifetime Value', value: formatINRCompact(kpis.avgLifetimeValue), icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Avg Churn Risk', value: `${formatNumber(kpis.avgChurnProbability, 2)}%`, icon: Brain, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        ].map((c, i) => (
          <Card key={i} className="glass premium-shadow border-white/5 overflow-hidden hover:scale-[1.02] transition-all duration-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn('p-2.5 rounded-xl border border-white/5', c.bg)}>
                  <c.icon className={cn('w-4 h-4', c.color)} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-foreground tracking-tighter">{c.value}</div>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Churn Probability Histogram */}
        <Card className="glass premium-shadow border-white/5 lg:col-span-2 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Churn Probability Histogram
              <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">ML Output</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Distribution of model-predicted churn probabilities across all customers.</p>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={churnHistogram ?? []} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.3} strokeDasharray="3 3" />
                <XAxis dataKey="range" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={{ stroke: 'var(--color-border)', opacity: 0.5 }} />
                <Tooltip
                  cursor={{ fill: 'var(--color-muted)', opacity: 0.2 }}
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--color-border)', borderRadius: '12px', backdropFilter: 'blur(10px)', color: '#f8fafc', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                  formatter={(val: number) => [val.toLocaleString(), 'Customers']}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Bar 
                  dataKey="count" 
                  name="Customers" 
                  fill="url(#histGradient)" 
                  radius={[6, 6, 0, 0]} 
                  isAnimationActive={true}
                  animationDuration={1500}
                >
                  {(churnHistogram ?? []).map((entry, index) => (
                    <Cell key={`cell-${index}`} className="hover:opacity-80 transition-opacity cursor-pointer duration-300" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Distribution Pie */}
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Risk Profile
              <span className="text-[10px] bg-red-500/20 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Assessment</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Churn risk segmentation from model output.</p>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <defs>
                  <filter id="pieGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <Pie
                  data={riskDistribution ?? []}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={6}
                  dataKey="value"
                  stroke="var(--color-background)"
                  strokeWidth={3}
                  isAnimationActive={true}
                  animationDuration={1800}
                >
                  {(riskDistribution ?? []).map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      className="hover:opacity-80 hover:scale-105 origin-center transition-all duration-300 cursor-pointer" 
                      style={{ filter: 'url(#pieGlow)' }}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--color-border)', borderRadius: '12px', backdropFilter: 'blur(10px)', color: '#f8fafc', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                  formatter={(val: number, name: string, props: any) => [`${val}%`, props.payload.name]}
                  labelStyle={{ display: 'none' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 mt-2">
              {(riskDistribution ?? []).map((tier, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tier.color }} />
                    <span className="text-[10px] font-bold text-muted-foreground">{tier.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-foreground">{tier.count.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">({tier.value}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enterprise Chart Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue at Risk by Contract (Area Chart) */}
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Revenue Risk by Contract
              <span className="text-[10px] bg-red-500/20 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Impact</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Total vs At-Risk Monthly Revenue based on ML predictions.</p>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueByContract ?? []} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="totalRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="riskRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.3} strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} dy={10} fontWeight="bold" />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={{ stroke: 'var(--color-border)', opacity: 0.5 }} tickFormatter={(val) => `₹${val/1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--color-border)', borderRadius: '12px', backdropFilter: 'blur(10px)', color: '#f8fafc', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                  formatter={(val: number) => [formatINR(val), '']}
                  labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px', fontWeight: 'bold' }} />
                <Area 
                  type="monotone" 
                  dataKey="totalRevenue" 
                  name="Total Revenue" 
                  stroke="var(--color-primary)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#totalRevGrad)" 
                  activeDot={{ r: 6, strokeWidth: 2, fill: 'var(--color-background)', stroke: 'var(--color-primary)' }}
                  isAnimationActive={true}
                  animationDuration={2000}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenueAtRisk" 
                  name="At-Risk Revenue" 
                  stroke="var(--color-destructive)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#riskRevGrad)"
                  activeDot={{ r: 6, strokeWidth: 2, fill: 'var(--color-background)', stroke: 'var(--color-destructive)', className: 'animate-pulse' }}
                  isAnimationActive={true}
                  animationDuration={2000}
                  animationBegin={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Retention Trend by Tenure */}
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Retention vs Tenure Bracket
              <span className="text-[10px] bg-green-500/20 text-green-500 border border-green-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Growth</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Predicted retention rate segmented by customer lifetime duration.</p>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={retentionTrends ?? []} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="retentionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-green-500)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--color-green-500)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.3} strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} dy={10} fontWeight="bold" />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={{ stroke: 'var(--color-border)', opacity: 0.5 }} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                <Tooltip
                  cursor={{ fill: 'var(--color-muted)', opacity: 0.2 }}
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--color-border)', borderRadius: '12px', backdropFilter: 'blur(10px)', color: '#f8fafc', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#22c55e', fontWeight: 'bold' }}
                  formatter={(val: number) => [`${val}%`, 'Predicted Retention']}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Bar 
                  dataKey="retentionRate" 
                  name="Predicted Retention" 
                  fill="url(#retentionGrad)" 
                  radius={[6, 6, 0, 0]} 
                  isAnimationActive={true}
                  animationDuration={1500}
                >
                  {(retentionTrends ?? []).map((entry, index) => (
                    <Cell key={`cell-${index}`} className="hover:opacity-80 transition-opacity cursor-pointer duration-300" style={{ filter: entry.retentionRate > 80 ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.4))' : 'none' }} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Enterprise Chart Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tenure vs Churn Probability Scatter */}
        <Card className="glass premium-shadow border-white/5 overflow-hidden lg:col-span-1">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Tenure Risk Cluster
              <span className="text-[10px] bg-purple-500/20 text-purple-500 border border-purple-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Scatter</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Customer distribution by tenure vs churn probability (random sample).</p>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: -20 }}>
                <CartesianGrid stroke="var(--color-border)" opacity={0.3} strokeDasharray="3 3" />
                <XAxis type="number" dataKey="tenure" name="Tenure" unit="m" stroke="var(--color-muted-foreground)" tickLine={false} axisLine={{ stroke: 'var(--color-border)', opacity: 0.5 }} fontSize={11} fontWeight="bold" />
                <YAxis type="number" dataKey="churnProbability" name="Churn Risk" unit="%" stroke="var(--color-muted-foreground)" tickLine={false} axisLine={{ stroke: 'var(--color-border)', opacity: 0.5 }} fontSize={11} fontWeight="bold" />
                <ZAxis type="category" dataKey="riskLevel" name="Risk" />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-border)', strokeWidth: 1.5 }} 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--color-border)', borderRadius: '12px', backdropFilter: 'blur(10px)', color: '#f8fafc', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }} 
                  itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                />
                <Scatter name="Customers" data={tenureVsRisk ?? []} isAnimationActive={true} animationDuration={2000}>
                  {(tenureVsRisk ?? []).map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.riskLevel === 'High' ? 'var(--color-destructive)' : entry.riskLevel === 'Medium' ? 'var(--color-orange-500)' : 'var(--color-green-500)'} 
                      opacity={0.8}
                      className="hover:opacity-100 hover:r-[6] transition-all cursor-crosshair duration-200"
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Engagement Trend */}
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Customer Engagement by Quartile
              <span className="text-[10px] bg-blue-500/20 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Feature</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Average engagement score (engineered feature) across customer quartiles.</p>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={engagementTrend ?? []} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b82f6" opacity={0.5} />
                    <stop offset="100%" stopColor="#8b5cf6" opacity={1} />
                  </linearGradient>
                  <filter id="glowLine">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.3} strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} dy={10} fontWeight="bold" />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={{ stroke: 'var(--color-border)', opacity: 0.5 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--color-border)', borderRadius: '12px', backdropFilter: 'blur(10px)', color: '#f8fafc', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#8b5cf6', fontWeight: 'bold' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}
                />
                <Line
                  type="monotone"
                  name="Avg Engagement Score"
                  dataKey="avgEngagement"
                  stroke="url(#lineGrad)"
                  strokeWidth={4}
                  filter="url(#glowLine)"
                  dot={{ r: 5, fill: 'var(--color-background)', strokeWidth: 2, stroke: '#8b5cf6' }}
                  activeDot={{ r: 8, fill: 'var(--color-background)', stroke: '#8b5cf6', strokeWidth: 3, className: 'animate-pulse' }}
                  isAnimationActive={true}
                  animationDuration={2000}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Link to Model Evaluation */}
      <Card className="glass premium-shadow border-primary/20 bg-primary/5 overflow-hidden">
        <CardContent className="p-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-primary/20 border border-primary/20">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-black text-lg text-foreground">Model Evaluation Metrics</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                View Accuracy, Precision, Recall, F1 Score, and ROC-AUC for the trained XGBoost model.
              </p>
            </div>
          </div>
          <Link href="/dashboard/analytics/model-eval">
            <Button className="font-black uppercase tracking-widest text-[11px] gap-2">
              View Metrics <ArrowRightCircle className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
