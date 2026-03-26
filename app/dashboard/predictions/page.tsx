'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchPredictions, triggerRetrain, type Customer } from '@/lib/api-client';
import {
  AlertCircle, TrendingUp, Brain, Activity, ChevronRight,
  ArrowUpRight, ArrowDownRight, Zap, RefreshCcw, ShieldCheck, Eye, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatNumber } from '@/lib/utils/format';
import { formatINRCompact } from '@/lib/currency';

export default function PredictionsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRetraining, setIsRetraining] = useState(false);
  const [retrainLogs, setRetrainLogs] = useState<string[]>([]);
  const [isRetrainModalOpen, setIsRetrainModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('All');

  const loadData = useCallback(async (risk?: string) => {
    setLoading(true);
    try {
      const res = await fetchPredictions(1, 50, risk === 'All' ? undefined : risk, 'churnProbability', 'desc');
      setCustomers(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    loadData(filter);
  };

  const handleReTrainModel = async () => {
    setIsRetraining(true);
    setRetrainLogs([]);
    setIsRetrainModalOpen(true);

    setRetrainLogs(['Initiating ML pipeline...']);

    try {
      const result = await triggerRetrain();
      if (result.success) {
        setRetrainLogs(prev => [
          ...prev,
          '✓ Model training complete.',
          '✓ Batch predictions generated.',
          '✓ Database updated.',
          'Refreshing dashboard data...',
        ]);
        await loadData(activeFilter === 'All' ? undefined : activeFilter);
        setRetrainLogs(prev => [...prev, '✓ Dashboard refreshed.']);
      } else {
        setRetrainLogs(prev => [...prev, `✗ Error: ${result.error ?? 'Unknown error'}`]);
      }
    } catch (e) {
      setRetrainLogs(prev => [...prev, '✗ Failed to connect to retrain API. Ensure Python is installed.']);
    }

    setIsRetraining(false);
    setTimeout(() => setIsRetrainModalOpen(false), 3000);
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'High')   return 'text-red-400 border-red-500/20 bg-red-500/5';
    if (risk === 'Medium') return 'text-orange-400 border-orange-500/20 bg-orange-500/5';
    return 'text-green-400 border-green-500/20 bg-green-500/5';
  };

  const getRiskBarColor = (risk: string) => {
    if (risk === 'High')   return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]';
    if (risk === 'Medium') return 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]';
    return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]';
  };

  const highCount   = customers.filter(c => c.riskLevel === 'High').length;
  const mediumCount = customers.filter(c => c.riskLevel === 'Medium').length;

  return (
    <div className="space-y-10 pb-20 enterprise-gradient">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient flex items-center gap-3">
            Predictive Intelligence
            <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-full uppercase font-black tracking-widest align-middle">XGBoost</span>
          </h1>
          <p className="text-sm font-medium text-muted-foreground/80">
            {total.toLocaleString()} ML predictions from trained model. Sorted by highest churn risk.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReTrainModel}
            disabled={isRetraining}
            className="rounded-xl border-border/50 bg-card/50 backdrop-blur-sm font-bold text-xs h-10 px-4 group"
          >
            <RefreshCcw className={cn('w-3.5 h-3.5 mr-2 transition-transform duration-1000', isRetraining && 'animate-spin')} />
            {isRetraining ? 'Retraining...' : 'Re-train Model'}
          </Button>
        </div>
      </div>

      {/* Risk Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'High Churn Risk', value: highCount, sub: 'Critical — Immediate action', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: 'Medium Risk', value: mediumCount, sub: 'Monitor closely', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Low Risk', value: total - highCount - mediumCount, sub: 'Stable — Continue monitoring', icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-500/10' },
        ].map((stat, i) => (
          <Card key={i} className="glass border-white/5 overflow-hidden group hover:scale-[1.02] transition-all duration-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn('p-2.5 rounded-xl border border-white/5', stat.bg)}>
                  <stat.icon className={cn('w-4 h-4', stat.color)} />
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Vector {i + 1}</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-foreground">{stat.value.toLocaleString()}</div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stat.label}</div>
                <p className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-tighter pt-1">{stat.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between px-2">
        <div className="flex bg-muted/40 p-1 rounded-xl border border-border/50 backdrop-blur-sm">
          {['All', 'High', 'Medium', 'Low'].map(filter => (
            <button
              key={filter}
              onClick={() => handleFilterChange(filter)}
              className={cn(
                'px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all',
                filter === activeFilter
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">
            Showing {customers.length} / {total.toLocaleString()} records
          </span>
          <BarChart3 className="w-3.5 h-3.5 text-muted-foreground/30" />
        </div>
      </div>

      {/* Predictions Grid */}
      {loading ? (
        <div className="p-20 flex flex-col items-center justify-center gap-4 glass rounded-3xl border-white/5">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(var(--primary),0.3)]" />
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Loading ML Predictions...</div>
        </div>
      ) : customers.length === 0 ? (
        <div className="p-20 flex flex-col items-center justify-center gap-4 glass rounded-3xl border-white/5 text-center">
          <Brain className="w-12 h-12 text-muted-foreground/20" />
          <p className="text-sm font-bold text-muted-foreground">No predictions found. Run the ML pipeline first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {customers.map((customer, i) => (
            <Card
              key={customer.id || `card-${i}`}
              className={cn(
                'glass border-white/5 overflow-hidden group hover:scale-[1.01] transition-all duration-500 relative cursor-pointer',
                getRiskColor(customer.riskLevel).split(' ')[1]
              )}
              onClick={() => setSelectedCustomer(customer)}
            >
              <CardContent className="p-8">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl font-black text-primary shadow-inner">
                        {customer.id.slice(-2)}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-foreground uppercase tracking-tight group-hover:text-primary transition-colors">
                          {customer.id}
                        </h3>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">
                            Tenure: {customer.tenure}mo · Rating: {formatNumber(customer.avgRating, 2)}
                          </span>
                          <div className="w-1 h-1 rounded-full bg-white/20" />
                          <div className={cn('text-[9px] font-black px-1.5 py-0.5 rounded border', getRiskColor(customer.riskLevel))}>
                            {customer.riskLevel} Risk
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-[10px]">
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-muted-foreground/50 uppercase tracking-wider mb-0.5">LTV</div>
                        <div className="font-black text-foreground">{formatINRCompact(customer.lifetimeValue)}</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-muted-foreground/50 uppercase tracking-wider mb-0.5">Engagement</div>
                        <div className="font-black text-foreground">{formatNumber(customer.engagementScore, 2)}</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-muted-foreground/50 uppercase tracking-wider mb-0.5">Reliability</div>
                        <div className="font-black text-foreground">{formatNumber(customer.paymentReliability * 100, 1)}%</div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10"
                      onClick={e => { e.stopPropagation(); setSelectedCustomer(customer); }}
                    >
                      View Full Analysis <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>

                  <div className="text-right flex flex-col items-end justify-between self-stretch">
                    <div className="space-y-1">
                      <div className={cn(
                        'text-4xl font-black tracking-tighter',
                        customer.riskLevel === 'High' ? 'text-red-500' :
                        customer.riskLevel === 'Medium' ? 'text-orange-500' : 'text-green-500'
                      )}>
                        {formatNumber(customer.churnProbability * 100, 2)}%
                      </div>
                      <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50">Churn Probability</div>
                    </div>
                    <div className="w-32 h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                      <div
                        className={cn('h-full transition-all duration-1000 ease-out', getRiskBarColor(customer.riskLevel))}
                        style={{ width: `${customer.churnProbability * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Customer Detail Modal */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="sm:max-w-[700px] glass shadow-2xl border-white/10 p-0 overflow-hidden">
          <DialogTitle className="sr-only">Customer Analysis - {selectedCustomer?.id}</DialogTitle>
          <DialogDescription className="sr-only">Detailed health and churn risk analysis for the selected customer.</DialogDescription>
          {selectedCustomer && (
            <div className="flex flex-col bg-card/80 backdrop-blur-3xl p-10 space-y-8">
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Brain className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">XGBoost ML Analysis</span>
                    </div>
                    <DialogTitle className="text-3xl font-black text-foreground uppercase tracking-tight">
                      {selectedCustomer.id}
                    </DialogTitle>
                    <div className={cn('inline-flex text-xs font-black px-2 py-1 rounded border', getRiskColor(selectedCustomer.riskLevel))}>
                      {selectedCustomer.riskLevel} Risk
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={cn('text-5xl font-black tracking-tighter',
                      selectedCustomer.riskLevel === 'High' ? 'text-red-500' :
                      selectedCustomer.riskLevel === 'Medium' ? 'text-orange-500' : 'text-green-500'
                    )}>
                      {formatNumber(selectedCustomer.churnProbability * 100, 2)}%
                    </div>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Churn Probability</span>
                  </div>
                </div>
              </DialogHeader>

              {/* Raw Features */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Tenure', `${selectedCustomer.tenure} months`],
                  ['Order Frequency', `${selectedCustomer.orderFreqMonth}/month`],
                  ['Avg Rating', formatNumber(selectedCustomer.avgRating, 2)],
                  ['Support Calls', selectedCustomer.supportCalls],
                  ['Payment Failures', selectedCustomer.paymentFailures],
                  ['Competitor Offers', selectedCustomer.competitorOffers],
                  ['Avg Delivery Time', `${formatNumber(selectedCustomer.avgDeliveryTime, 1)} days`],
                  ['Late Deliveries', selectedCustomer.lateDeliveries],
                ].map(([label, value], i) => (
                  <div key={i} className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <span className="text-[9px] font-black text-muted-foreground uppercase block mb-0.5">{label}</span>
                    <span className="text-sm font-bold text-foreground">{value}</span>
                  </div>
                ))}
              </div>

              {/* Engineered Features */}
              <div>
                <h5 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest border-b border-white/5 pb-2 mb-4">ML Feature Scores</h5>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Lifetime Value', formatNumber(selectedCustomer.lifetimeValue, 3)],
                    ['Discount Dependency', formatNumber(selectedCustomer.discountDependency * 100, 1) + '%'],
                    ['Engagement Score', formatNumber(selectedCustomer.engagementScore, 4)],
                    ['Payment Reliability', formatNumber(selectedCustomer.paymentReliability * 100, 1) + '%'],
                    ['Order Freq Trend', formatNumber(selectedCustomer.orderFreqTrend * 100, 1) + '%'],
                    ['Competitor Exposure', formatNumber(selectedCustomer.competitorExposure * 100, 1) + '%'],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-xl p-3 gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
                      <span className="text-sm font-black text-foreground font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                className="w-full bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] h-12 shadow-xl hover:scale-[1.02] transition-transform"
                onClick={() => setSelectedCustomer(null)}
              >
                Close Analysis
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Retrain Modal */}
      <Dialog open={isRetrainModalOpen} onOpenChange={open => !isRetraining && setIsRetrainModalOpen(open)}>
        <DialogContent className="sm:max-w-[500px] glass shadow-2xl border-white/10 p-0 overflow-hidden">
          <div className="flex flex-col bg-card/80 backdrop-blur-3xl p-10 space-y-8 text-center">
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Zap className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">ML Pipeline</span>
              </div>
              <DialogTitle className="text-3xl font-black text-gradient uppercase tracking-tight">
                {isRetraining ? 'Training Model...' : 'Training Complete'}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {isRetraining ? 'Currently retraining the churn prediction model with new data.' : 'Model retraining has finished successfully.'}
              </DialogDescription>
            </div>
            {isRetraining && (
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                  <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-primary animate-pulse" />
                </div>
              </div>
            )}
            <div className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 space-y-2 font-mono text-[10px] text-left overflow-hidden max-h-[200px] overflow-y-auto">
              {retrainLogs.map((log, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-primary font-black opacity-50">&gt;</span>
                  <span className="text-foreground/90 font-bold">{log}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
