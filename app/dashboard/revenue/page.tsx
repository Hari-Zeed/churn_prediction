'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchAnalytics, type AnalyticsResponse } from '@/lib/api-client';
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatNumber } from '@/lib/utils/format';
import { formatINR, formatINRCompact } from '@/lib/currency';
import { IndianRupee, TrendingDown, Target, Zap, AlertCircle } from 'lucide-react';

export default function RevenueImpactPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAnalytics();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(var(--primary),0.3)]" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Quantifying Revenue Metrics...</p>
      </div>
    );
  }

  if (!data || !data.kpis) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground/20" />
        <p className="text-sm font-bold text-muted-foreground">No revenue data found. Run the ML pipeline.</p>
      </div>
    );
  }

  const { totalMonthlyRev, revenueImpact } = data.kpis;
  const safeRevenue = totalMonthlyRev - revenueImpact;
  
  // Predict recovery of 35% of at-risk revenue through targeted retention
  const recoveryOpportunity = revenueImpact * 0.35;
  const projectedLoss = revenueImpact - recoveryOpportunity;

  const pieData = [
    { name: 'Safe Revenue', value: safeRevenue, color: '#10b981' },
    { name: 'Revenue at Risk', value: revenueImpact, color: '#ef4444' }
  ];

  return (
    <div className="space-y-10 pb-20 enterprise-gradient">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient flex items-center gap-3">
            Revenue Impact
            <span className="text-[10px] bg-green-500/20 text-green-500 border border-green-500/20 px-2.5 py-1 rounded-full uppercase font-black tracking-widest align-middle">Financials</span>
          </h1>
          <p className="text-sm font-medium text-muted-foreground/80">
            Financial projections based on XGBoost churn probability metrics.
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm" className="gap-2 rounded-xl h-9">
          <Zap className="w-3.5 h-3.5 text-primary" /> Recalculate
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass premium-shadow border-white/5 overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-2xl border border-red-500/20 bg-red-500/10">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-[10px] font-black px-2 py-0.5 rounded border text-red-500 border-red-500/20 bg-red-500/10">
                CRITICAL
              </div>
            </div>
            <div className="text-4xl font-black text-foreground tracking-tighter">{formatINRCompact(revenueImpact)}</div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Monthly Revenue at Risk</div>
            <p className="text-[10px] text-muted-foreground/50 mt-2 font-medium">Total MRR tied to accounts with &gt; 50% churn probability.</p>
          </CardContent>
        </Card>

        <Card className="glass premium-shadow border-white/5 overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-2xl border border-orange-500/20 bg-orange-500/10">
                <IndianRupee className="w-5 h-5 text-orange-500" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Projection</span>
            </div>
            <div className="text-4xl font-black text-foreground tracking-tighter">{formatINRCompact(projectedLoss)}</div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Likely Revenue Loss</div>
            <p className="text-[10px] text-muted-foreground/50 mt-2 font-medium">Expected loss if standard 35% retention mitigations fail.</p>
          </CardContent>
        </Card>

        <Card className="glass premium-shadow border-green-500/10 bg-green-500/5 overflow-hidden relative group hover:scale-[1.02] transition-transform duration-500">
          <div className="absolute top-0 right-0 p-32 bg-green-500/10 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none" />
          <CardContent className="p-8 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-2xl border border-green-500/20 bg-green-500/20">
                <Target className="w-5 h-5 text-green-400" />
              </div>
              <div className="text-[10px] font-black px-2 py-0.5 rounded border text-green-400 border-green-400/20 bg-green-400/10 animate-pulse">
                OPPORTUNITY
              </div>
            </div>
            <div className="text-4xl font-black text-green-400 tracking-tighter">{formatINRCompact(recoveryOpportunity)}</div>
            <div className="text-[11px] font-bold text-green-500/70 uppercase tracking-widest mt-1">Recovery Opportunity</div>
            <p className="text-[10px] text-green-500/40 mt-2 font-medium">Estimated MRR salvageable via AI retention strategies.</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Revenue Breakdown */}
        <Card className="glass premium-shadow border-white/5">
          <CardHeader className="border-b border-white/5 bg-black/10 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground">Portfolio Revenue Composition</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Proportion of global MRR currently at risk.</p>
          </CardHeader>
          <CardContent className="pt-8 w-full flex flex-col md:flex-row items-center justify-center gap-8">
            <div className="w-[200px] h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '12px' }}
                    formatter={(val: number) => [formatINR(val), 'MRR']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: d.color }} />
                  <div>
                    <div className="text-sm font-bold text-foreground">{d.name}</div>
                    <div className="text-xl font-black tracking-tight" style={{ color: d.color }}>{formatINRCompact(d.value)}</div>
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t border-white/5">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total MRR</div>
                <div className="text-2xl font-black text-foreground">{formatINRCompact(totalMonthlyRev)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Impact by Contract Type */}
        <Card className="glass premium-shadow border-white/5">
          <CardHeader className="border-b border-white/5 bg-black/10 pb-6">
            <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              Risk by Contract Type
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Revenue vulnerability segmented by customer commitment lengths.</p>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.revenueByContract} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.2} />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '12px', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' }}
                  formatter={(value: number) => [formatINR(value), 'Revenue']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenueAtRisk" 
                  name="MRR At Risk" 
                  stroke="#ef4444" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRisk)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
