'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lightbulb, TrendingUp, Zap, ChevronRight, Activity, ArrowRightCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { formatINR, formatINRCompact } from '@/lib/currency';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Customer } from '@/lib/api-client';

interface Insight {
  id: string;
  title: string;
  description: string;
  type: 'danger' | 'warning' | 'info' | 'success';
}

interface TopRiskCustomer extends Customer {
  recommendedStrategy?: string;
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [topAtRisk, setTopAtRisk] = useState<TopRiskCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights');
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      setInsights(data.insights || []);
      setTopAtRisk(data.topAtRisk || []);
    } catch (e) {
      setError('Failed to generate insights. Ensure the ML pipeline has been run.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground animate-pulse">Generating AI Correlated Insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500/40" />
        <p className="text-sm font-bold text-muted-foreground">{error}</p>
        <Button onClick={loadData} variant="outline" size="sm">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 enterprise-gradient">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-gradient">
          AI Insights
          <span className="ml-3 text-[10px] bg-secondary/20 text-secondary border border-secondary/20 px-2.5 py-1 rounded-full uppercase font-black tracking-widest align-middle">Automated</span>
        </h1>
        <p className="text-sm font-medium text-muted-foreground/80">
          Programmatic business intelligence and retention strategies via XGBoost.
        </p>
      </div>

      {/* Programmatic Insights Overview */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {insights.map((insight, i) => (
            <Card key={`insight-${insight.id || i}`} className={cn(
              "glass premium-shadow overflow-hidden transition-all duration-300",
              insight.type === 'danger' ? 'border-red-500/20 bg-red-500/5' :
              insight.type === 'warning' ? 'border-orange-500/20 bg-orange-500/5' :
              insight.type === 'success' ? 'border-green-500/20 bg-green-500/5' :
              'border-blue-500/20 bg-blue-500/5'
            )}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "p-2 rounded-xl",
                    insight.type === 'danger' ? 'bg-red-500/20 text-red-500' :
                    insight.type === 'warning' ? 'bg-orange-500/20 text-orange-500' :
                    insight.type === 'success' ? 'bg-green-500/20 text-green-500' :
                    'bg-blue-500/20 text-blue-500'
                  )}>
                    {insight.type === 'danger' ? <AlertTriangle className="w-5 h-5" /> : 
                     insight.type === 'warning' ? <Zap className="w-5 h-5" /> :
                     insight.type === 'success' ? <TrendingUp className="w-5 h-5" /> :
                     <Lightbulb className="w-5 h-5" />}
                  </div>
                </div>
                <h3 className="text-lg font-black text-foreground mb-1 tracking-tight">{insight.title}</h3>
                <p className="text-xs font-semibold text-muted-foreground leading-relaxed">{insight.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Top 10 High-Risk Strategic Recommendations */}
      <Card className="glass premium-shadow border-white/5 overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-6">
          <CardTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            Automated Retention Workflows
            <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Recommended</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">AI-generated strategies for the 10 most valuable accounts at critical risk.</p>
        </CardHeader>
        <CardContent className="pt-8">
          {topAtRisk.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Activity className="w-8 h-8 opacity-20 mb-4" />
              <p className="text-xs font-black uppercase tracking-widest">No critical accounts identified.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {topAtRisk.map((customer, i) => (
                <div key={customer.id || `customer-${i}`} className="p-6 rounded-2xl bg-black/20 border border-white/5 shadow-inner hover:bg-black/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6">
                  
                  {/* Customer Block */}
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.15)] flex-shrink-0">
                      <span className="text-xl font-black text-red-500">#{i + 1}</span>
                    </div>
                    <div>
                      <h4 className="font-black text-lg text-foreground tracking-tight uppercase">{customer.id}</h4>
                      <p className="text-xs font-bold text-muted-foreground mt-0.5 uppercase tracking-widest">
                        {customer.contractType} · {customer.tenure} Months · LTV: {formatINRCompact(customer.lifetimeValue)}
                      </p>
                    </div>
                  </div>

                  {/* Danger Zone Metrics */}
                  <div className="flex gap-8">
                    <div className="text-right">
                      <div className="text-sm font-black text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 inline-block mb-1">
                        {formatNumber(customer.churnProbability * 100, 1)}% Risk
                      </div>
                      <p className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest">ML Output</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20 inline-block mb-1">
                        {formatINR(customer.predictedRevLoss)}
                      </div>
                      <p className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest">MRR At Risk</p>
                    </div>
                  </div>

                  {/* Recommendation Command */}
                  <div className="flex-1 md:max-w-[320px] p-4 rounded-xl bg-primary/10 border border-primary/20 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Zap className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[9px] font-black uppercase text-primary tracking-[0.2em]">Strategy</span>
                    </div>
                    <p className="text-xs font-bold text-foreground/90 italic">
                      "{customer.recommendedStrategy}"
                    </p>
                  </div>
                  
                  {/* Action Link */}
                  <div className="flex-shrink-0">
                    <Link href={`/dashboard/customers?search=${customer.id}`}>
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-white/10 group">
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Button>
                    </Link>
                  </div>

                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
