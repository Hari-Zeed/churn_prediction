'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ReferenceLine,
} from 'recharts';
import {
  Brain, ShieldCheck, TrendingUp, Target, Activity, RefreshCcw, AlertCircle,
  ArrowLeft, Download, Zap, CheckCircle, AlertTriangle, Info, ChevronDown,
  ChevronUp, GitCompare, BarChart2, Award, Database, Clock, Cpu, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils/format';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────
interface HistoryEntry {
  version: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  trainedAt: string;
  datasetSize: number;
}

interface Drift { feature: string; drift: number; threshold: number; label: string }

interface MetricsData {
  latest: {
    id: string; version: string; accuracy: number; precision: number;
    recall: number; f1Score: number; rocAuc: number;
    featureImportance?: { name: string; value: number }[];
    datasetSize: number; trainedAt: string;
  } | null;
  history: HistoryEntry[];
  drift: Drift[] | null;
}

// ─── Feature Category Map ─────────────────────────────────────────────────────
const FEATURE_CATEGORIES: Record<string, { label: string; color: string }> = {
  contractType:        { label: 'Contract',    color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  Contract_Type:       { label: 'Contract',    color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  competitorExposure:  { label: 'Competition', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  competitorOffers:    { label: 'Competition', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  engagementScore:     { label: 'Engagement',  color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  orderFreqMonth:      { label: 'Behavior',    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  orderFreqTrend:      { label: 'Behavior',    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  paymentReliability:  { label: 'Payment',     color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  paymentFailures:     { label: 'Payment',     color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  Payment_Failures:    { label: 'Payment',     color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  monthlyCharges:      { label: 'Payment',     color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  Monthly_Charges:     { label: 'Payment',     color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  discountDependency:  { label: 'Engagement',  color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  discountUsagePct:    { label: 'Engagement',  color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  supportCalls:        { label: 'Support',     color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  avgDeliveryTime:     { label: 'Delivery',    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  lateDeliveries:      { label: 'Delivery',    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  avgRating:           { label: 'Rating',      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  tenure:              { label: 'Tenure',      color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
};
const getCat = (name: string) =>
  FEATURE_CATEGORIES[name] ?? { label: 'Other', color: 'bg-muted/20 text-muted-foreground border-border' };

// ─── Animated Counter ─────────────────────────────────────────────────────────
function AnimatedCounter({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = Date.now();
    const duration = 900;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(parseFloat((eased * value).toFixed(decimals)));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, decimals]);

  return <>{formatNumber(display, decimals)}</>;
}

// ─── Performance Badge ────────────────────────────────────────────────────────
function PerfBadge({ value }: { value: number }) {
  if (value >= 85) return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded border text-emerald-400 border-emerald-500/20 bg-emerald-500/10">EXCELLENT</span>
  );
  if (value >= 75) return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded border text-green-400 border-green-500/20 bg-green-500/10">GOOD</span>
  );
  if (value >= 65) return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded border text-yellow-400 border-yellow-500/20 bg-yellow-500/10">FAIR</span>
  );
  return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded border text-red-400 border-red-500/20 bg-red-500/10">POOR</span>
  );
}

// ─── Delta Badge ──────────────────────────────────────────────────────────────
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const pos = delta >= 0;
  return (
    <span className={cn('flex items-center gap-0.5 text-[10px] font-black', pos ? 'text-emerald-400' : 'text-red-400')}>
      {pos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      {Math.abs(delta).toFixed(2)}%
    </span>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(history: HistoryEntry[]) {
  const header = 'Version,Accuracy,Precision,Recall,F1 Score,ROC-AUC,Dataset Size,Trained At\n';
  const rows = history.map(h =>
    `${h.version},${h.accuracy},${h.precision},${h.recall},${h.f1Score},${h.rocAuc},${h.datasetSize},${new Date(h.trainedAt).toLocaleString()}`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'model_metrics.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-2xl">
      <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-black" style={{ color: p.color }}>{p.name}: {formatNumber(p.value, 2)}{p.unit ?? '%'}</p>
      ))}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ModelEvalPage() {
  const [data, setData] = useState<MetricsData>({ latest: null, history: [], drift: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retraining, setRetraining] = useState(false);
  const [retainLogs, setRetainLogs] = useState<string[]>([]);
  const [featureFilter, setFeatureFilter] = useState<'top5' | 'top10' | 'all'>('top10');
  const [compareIdx, setCompareIdx] = useState<number | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<[number, number] | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error('API Error');
      const json = await res.json();
      setData(json);
    } catch {
      setError('Failed to load model metrics from database.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRetrain = async () => {
    setRetraining(true); setRetainLogs(['Initiating retraining pipeline...']);
    try {
      const res = await fetch('/api/retrain', { method: 'POST' });
      const json = await res.json();
      setRetainLogs(json.logs ?? ['Done']);
      if (json.success) { setTimeout(loadData, 1000); }
    } catch { setRetainLogs(['Retrain request failed.']); }
    finally { setRetraining(false); }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {[0,1,2].map(i => (
          <div key={i} className="h-32 rounded-2xl bg-muted/20 border border-white/5 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    );
  }

  // ── No Data ────────────────────────────────────────────────────────────────
  if (error || !data.latest) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-6 text-center">
        <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20">
          <AlertCircle className="w-10 h-10 text-orange-500 mx-auto" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">No Model Metrics Found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {error ?? 'Run train_model.py and batch_predict.py to populate metrics.'}
          </p>
        </div>
        <div className="bg-muted/40 border border-border/50 rounded-2xl p-5 text-left font-mono text-xs space-y-1.5 max-w-md w-full">
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mb-3">Run these commands:</p>
          <p><span className="text-primary">$</span> cd ml_churn_prediction</p>
          <p><span className="text-primary">$</span> python3 train_model.py</p>
          <p><span className="text-primary">$</span> python3 batch_predict.py</p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2"><RefreshCcw className="w-4 h-4" />Retry</Button>
      </div>
    );
  }

  const { latest, history, drift } = data;
  const prev = history.length > 1 ? history[1] : null;

  // ── Derived data ───────────────────────────────────────────────────────────
  const radarCurrent = [
    { metric: 'Accuracy',  current: latest.accuracy,  prev: prev?.accuracy  ?? 0 },
    { metric: 'Precision', current: latest.precision, prev: prev?.precision ?? 0 },
    { metric: 'Recall',    current: latest.recall,    prev: prev?.recall    ?? 0 },
    { metric: 'F1 Score',  current: latest.f1Score,   prev: prev?.f1Score   ?? 0 },
    { metric: 'ROC-AUC',   current: latest.rocAuc,    prev: prev?.rocAuc    ?? 0 },
  ];

  const metricCards = [
    { label: 'Accuracy',  value: latest.accuracy,  icon: ShieldCheck, color: 'text-emerald-400', barColor: 'bg-emerald-400', desc: 'Overall correct predictions', tooltip: 'Percentage of all predictions that the model got right.' },
    { label: 'Precision', value: latest.precision, icon: Target,      color: 'text-blue-400',    barColor: 'bg-blue-400',    desc: 'True positives / predicted positives', tooltip: 'Of all customers flagged as churners, how many actually churned.' },
    { label: 'Recall',    value: latest.recall,    icon: Activity,    color: 'text-orange-400',  barColor: 'bg-orange-400',  desc: 'True positives / actual positives', tooltip: 'Of all actual churners, how many did the model catch.' },
    { label: 'F1 Score',  value: latest.f1Score,   icon: TrendingUp,  color: 'text-purple-400',  barColor: 'bg-purple-400',  desc: 'Harmonic mean of precision & recall', tooltip: 'Balanced metric combining precision and recall. Critical for imbalanced datasets.' },
    { label: 'ROC-AUC',   value: latest.rocAuc,    icon: Brain,       color: 'text-primary',     barColor: 'bg-primary',     desc: 'Area under ROC curve', tooltip: 'Probability that model ranks a random churner higher than a random non-churner. Perfect = 1.0.' },
  ];

  // Health status
  const healthAlerts: { type: 'danger' | 'warning' | 'success'; message: string }[] = [];
  if (latest.accuracy < 75) healthAlerts.push({ type: 'danger', message: `⚠ Accuracy is critically low (${latest.accuracy}%). Retrain the model with fresh data.` });
  else if (latest.accuracy < 80) healthAlerts.push({ type: 'warning', message: `ℹ Accuracy (${latest.accuracy}%) is below the 80% enterprise threshold. Consider retraining.` });
  if (latest.recall < 70) healthAlerts.push({ type: 'danger', message: `⚠ Recall is ${latest.recall}% — the model is missing too many churners. Review training data.` });
  if (latest.rocAuc >= 87) healthAlerts.push({ type: 'success', message: `✓ ROC-AUC (${latest.rocAuc}%) is excellent — the model has strong discriminative power.` });
  if (prev && latest.f1Score < prev.f1Score) healthAlerts.push({ type: 'warning', message: `Performance regression detected: F1 dropped ${(prev.f1Score - latest.f1Score).toFixed(2)}% from previous version.` });

  const modelStatus = latest.accuracy >= 80 && latest.recall >= 70
    ? { label: 'Active', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' }
    : latest.accuracy >= 70
    ? { label: 'Degraded', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' }
    : { label: 'Retraining Needed', color: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-400' };

  // Feature importance
  const allFeatures = latest.featureImportance ?? [];
  const filteredFeatures = featureFilter === 'top5' ? allFeatures.slice(0, 5)
    : featureFilter === 'top10' ? allFeatures.slice(0, 10)
    : allFeatures;
  const maxFeatVal = filteredFeatures[0]?.value ?? 1;

  // Find best version
  const bestIdx = history.reduce((bi, h, i) => h.rocAuc > history[bi].rocAuc ? i : bi, 0);

  // Comparison mode
  const sv = selectedVersions;
  const vA = sv !== null ? history[sv[0]] : null;
  const vB = sv !== null ? history[sv[1]] : null;

  // Metrics bar chart data
  const barData = [
    { metric: 'Accuracy',  value: latest.accuracy,  fill: '#10b981' },
    { metric: 'Precision', value: latest.precision, fill: '#60a5fa' },
    { metric: 'Recall',    value: latest.recall,    fill: '#fb923c' },
    { metric: 'F1 Score',   value: latest.f1Score,   fill: '#a78bfa' },
    { metric: 'ROC-AUC',   value: latest.rocAuc,    fill: 'var(--color-primary)' },
  ];

  // Auto-generated insights
  const insights: { icon: string; title: string; body: string; type: string }[] = [];
  const weakest = [...metricCards].sort((a, b) => a.value - b.value)[0];
  insights.push({ icon: '🎯', title: 'Strongest Predictor', body: `${allFeatures[0]?.name ?? 'Contract Type'} accounts for ${formatNumber((allFeatures[0]?.value ?? 0) * 100, 1)}% of model decisions — the single most impactful churn signal.`, type: 'info' });
  if (latest.precision > latest.recall) insights.push({ icon: '⚖️', title: 'Precision-Biased Model', body: `Precision (${latest.precision}%) > Recall (${latest.recall}%). The model is conservative — it misses some churners but has few false alarms.`, type: 'warning' });
  else insights.push({ icon: '🔍', title: 'High Recall Coverage', body: `Recall (${latest.recall}%) > Precision (${latest.precision}%). The model casts a wide net — catching most churners but with some false positives.`, type: 'info' });
  insights.push({ icon: '📊', title: `Weakest Metric: ${weakest.label}`, body: `${weakest.label} at ${weakest.value}% is the key area for improvement. Focus data collection on related features.`, type: weakest.value < 75 ? 'danger' : 'success' });
  if (latest.rocAuc >= 85) insights.push({ icon: '🏆', title: 'Strong Discriminative Power', body: `ROC-AUC of ${latest.rocAuc}% shows the model reliably distinguishes churners from loyal customers.`, type: 'success' });
  if (prev) {
    const avgDelta = ((latest.accuracy - prev.accuracy) + (latest.f1Score - prev.f1Score) + (latest.rocAuc - prev.rocAuc)) / 3;
    insights.push({ icon: avgDelta >= 0 ? '📈' : '📉', title: avgDelta >= 0 ? 'Version Improvement' : 'Version Regression', body: avgDelta >= 0 ? `Average metric improvement of +${avgDelta.toFixed(2)}% over previous version ${prev.version}.` : `Average metric drop of ${avgDelta.toFixed(2)}% vs version ${prev.version}. Investigate training data quality.`, type: avgDelta >= 0 ? 'success' : 'danger' });
  }

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8 pb-24 enterprise-gradient">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/dashboard/analytics">
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-[11px] px-3 font-bold text-muted-foreground">
                <ArrowLeft className="w-3 h-3" />Analytics
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-4xl font-extrabold tracking-tight text-gradient">Model Performance</h1>
            <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-full uppercase font-black tracking-widest">{latest.version}</span>
            <span className={cn('flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border', modelStatus.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', modelStatus.dot)} />
              {modelStatus.label}
            </span>
          </div>
          <p className="text-sm font-medium text-muted-foreground/80">
            XGBoost ML model · Trained {new Date(latest.trainedAt).toLocaleString()} · {latest.datasetSize.toLocaleString()} records
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={loadData} variant="outline" size="sm" className="gap-2 rounded-xl h-9 text-xs">
            <RefreshCcw className="w-3.5 h-3.5" />Refresh
          </Button>
          <Button onClick={() => exportCSV(history)} variant="outline" size="sm" className="gap-2 rounded-xl h-9 text-xs">
            <FileText className="w-3.5 h-3.5" />Export CSV
          </Button>
          <Button onClick={() => window.print()} variant="outline" size="sm" className="gap-2 rounded-xl h-9 text-xs">
            <Download className="w-3.5 h-3.5" />Download Report
          </Button>
          <Button onClick={handleRetrain} size="sm" disabled={retraining} className="gap-2 rounded-xl h-9 text-xs bg-primary hover:bg-primary/90">
            <Zap className="w-3.5 h-3.5" />{retraining ? 'Retraining…' : 'Retrain Model'}
          </Button>
        </div>
      </div>

      {/* ── Retrain Logs ────────────────────────────────────────────────── */}
      {retainLogs.length > 0 && (
        <motion.div variants={itemVariants} className="bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-xs space-y-1 ">
          {retainLogs.map((l, i) => <p key={i} className="text-emerald-400">{l}</p>)}
        </motion.div>
      )}

      {/* ── Health Alert Banners ─────────────────────────────────────────── */}
      {healthAlerts.map((alert, i) => (
        <motion.div variants={itemVariants} key={i} className={cn(
          'flex items-start gap-3 p-4 rounded-2xl border text-sm font-semibold',
          alert.type === 'danger' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
          alert.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
          'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        )}>
          {alert.type === 'danger' ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
           alert.type === 'warning' ? <Info className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
           <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          {alert.message}
        </motion.div>
      ))}

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {metricCards.map((card, i) => {
          const prevVal = prev ? (prev as any)[card.label === 'ROC-AUC' ? 'rocAuc' : card.label === 'F1 Score' ? 'f1Score' : card.label.toLowerCase()] : null;
          const trueDelta = prevVal !== null ? parseFloat((card.value - prevVal).toFixed(2)) : null;
          return (
            <div key={i} title={card.tooltip}>
              <Card className="glass premium-shadow border-white/5 overflow-hidden group hover:scale-[1.02] hover:shadow-2xl transition-all duration-500 relative shimmer-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn('p-2.5 rounded-xl border border-white/5', card.color.replace('text-', 'bg-').replace('400', '500/10'))}>
                      <card.icon className={cn('w-4 h-4', card.color)} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <PerfBadge value={card.value} />
                      <DeltaBadge delta={trueDelta} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-3xl font-black text-foreground tracking-tighter tabular-nums">
                      <AnimatedCounter value={card.value} />%
                    </div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{card.label}</div>
                    <p className="text-[10px] font-medium text-muted-foreground/40">{card.desc}</p>
                  </div>
                  <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-1000', card.barColor)} style={{ width: `${Math.min(100, card.value)}%` }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* ── Charts Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Radar */}
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
            <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />Performance Radar
              <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest ml-auto">
                {prev ? 'vs Prev Version' : 'Current'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[320px] w-full relative group/chart">
              <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none z-10" />
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarCurrent} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <defs>
                    <linearGradient id="primaryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="prevGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6b7280" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#6b7280" stopOpacity={0.05} />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <PolarGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.6} />
                  <PolarAngleAxis 
                    dataKey="metric" 
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11, fontWeight: 'bold' }} 
                  />
                  <PolarRadiusAxis 
                    angle={30} 
                    domain={[0, 100]} 
                    tick={false} 
                    axisLine={false} 
                  />
                  {prev && (
                    <Radar 
                      name="Previous" 
                      dataKey="prev" 
                      stroke="#6b7280" 
                      fill="url(#prevGradient)" 
                      strokeWidth={1.5} 
                      strokeDasharray="4 4" 
                      isAnimationActive={true}
                      animationDuration={1500}
                    />
                  )}
                  <Radar 
                    name="Current" 
                    dataKey="current" 
                    stroke="var(--color-primary)" 
                    fill="url(#primaryGradient)" 
                    strokeWidth={2.5} 
                    filter="url(#glow)"
                    activeDot={{ r: 6, fill: "var(--color-background)", stroke: "var(--color-primary)", strokeWidth: 2 }}
                    isAnimationActive={true}
                    animationBegin={300}
                    animationDuration={1500}
                  />
                  <Tooltip 
                    content={<CustomTooltip />} 
                    cursor={{ stroke: 'var(--color-border)', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {prev && (
              <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-border/20">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 transition-colors hover:bg-primary/20">
                  <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--color-primary),0.5)]" />
                  <span className="text-xs font-bold text-primary">v{latest.version} (Latest)</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border/50 text-muted-foreground hover:bg-muted/60 transition-colors">
                  <div className="w-8 h-0.5 border-t-2 border-dashed border-gray-500" />
                  <span className="text-xs font-bold">v{prev.version} (Prev)</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar chart */}
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
            <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-secondary" />Metrics Breakdown
              <span className="text-[10px] bg-secondary/20 text-secondary border border-secondary/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest ml-auto">80% Threshold</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[320px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="currentColor" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="currentColor" stopOpacity={1} />
                    </linearGradient>
                    {barData.map((entry, index) => (
                      <linearGradient key={`grad-${index}`} id={`color-${index}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={entry.fill} stopOpacity={0.6} />
                        <stop offset="100%" stopColor={entry.fill} stopOpacity={1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid horizontal={false} stroke="var(--color-border)" opacity={0.3} strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    domain={[0, 100]} 
                    stroke="var(--color-muted-foreground)" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={{ stroke: 'var(--color-border)' }} 
                    tickFormatter={v => `${v}%`} 
                  />
                  <YAxis 
                    type="category" 
                    dataKey="metric" 
                    stroke="var(--color-muted-foreground)" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    fontWeight="bold" 
                    width={80} 
                  />
                  <Tooltip cursor={{ fill: 'var(--color-muted)', opacity: 0.1 }} content={<CustomTooltip />} />
                  <ReferenceLine 
                    x={80} 
                    stroke="#f59e0b" 
                    strokeDasharray="4 4" 
                    strokeWidth={2} 
                    label={{ 
                      value: '80% Target', 
                      position: 'top', 
                      fill: '#f59e0b', 
                      fontSize: 10, 
                      fontWeight: 900,
                      className: 'drop-shadow-sm'
                    }} 
                  />
                  <Bar 
                    dataKey="value" 
                    name="Score" 
                    radius={[0, 8, 8, 0]} 
                    maxBarSize={24}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  >
                    {barData.map((entry, i) => (
                      <Cell 
                        key={i} 
                        fill={`url(#color-${i})`} 
                        className="hover:opacity-80 transition-opacity cursor-pointer duration-300" 
                        style={{ filter: entry.value >= 80 ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.4))' : 'none' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Feature Importance ──────────────────────────────────────────── */}
      {filteredFeatures.length > 0 && (
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4 text-orange-400" />Feature Importance
                <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">XGBoost Weights</span>
              </CardTitle>
              <div className="flex gap-2">
                {(['top5', 'top10', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setFeatureFilter(f)} className={cn(
                    'text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border transition-all',
                    featureFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 text-muted-foreground border-white/10 hover:bg-muted/50'
                  )}>
                    {f === 'top5' ? 'Top 5' : f === 'top10' ? 'Top 10' : 'All'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {filteredFeatures.map((feat, i) => {
                const pct = (feat.value / maxFeatVal) * 100;
                const cat = getCat(feat.name);
                return (
                  <motion.div variants={itemVariants} key={`feat-${i}`} className="flex items-center gap-4 group " style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="w-6 text-[10px] font-black text-muted-foreground/40 text-right">#{i + 1}</div>
                    <div className="w-36 text-xs font-bold text-foreground truncate">{feat.name}</div>
                    <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded border flex-shrink-0', cat.color)}>{cat.label}</span>
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-700"
                        style={{ width: `${pct}%`, transitionDelay: `${i * 40}ms` }}
                      />
                    </div>
                    <div className="w-16 text-right text-xs font-black text-foreground">{formatNumber(feat.value * 100, 2)}%</div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Model Insights Panel ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-bold text-foreground tracking-tight">Auto-Generated Model Insights</h2>
          <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">AI Analysis</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.map((ins, i) => (
            <motion.div variants={itemVariants} key={i}>
              <Card className={cn(
                'glass premium-shadow border overflow-hidden hover:scale-[1.01] transition-all duration-300',
                ins.type === 'danger' ? 'border-red-500/15 bg-red-500/5' :
                ins.type === 'warning' ? 'border-yellow-500/15 bg-yellow-500/5' :
                ins.type === 'success' ? 'border-emerald-500/15 bg-emerald-500/5' :
                'border-blue-500/15 bg-blue-500/5'
              )}>
                <CardContent className="p-5">
                  <div className="text-2xl mb-2">{ins.icon}</div>
                  <h3 className="text-sm font-black text-foreground mb-1">{ins.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{ins.body}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Training History ────────────────────────────────────────────── */}
      {history.length >= 1 && (
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-green-400" />Version History
                <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">{history.length} Runs</span>
              </CardTitle>
              {history.length >= 2 && (
                <Button
                  onClick={() => setSelectedVersions(selectedVersions ? null : [0, 1])}
                  variant="outline" size="sm" className="gap-2 text-[11px] h-8 rounded-xl"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  {selectedVersions ? 'Hide Comparison' : 'Compare Versions'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="space-y-3">
              {history.map((run, i) => {
                const prevRun = history[i + 1];
                const delta = prevRun ? parseFloat((run.accuracy - prevRun.accuracy).toFixed(2)) : null;
                const isBest = i === bestIdx;
                const isSelected = selectedVersions && (selectedVersions[0] === i || selectedVersions[1] === i);
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (!selectedVersions) return;
                      const [a, b] = selectedVersions;
                      if (i !== a && i !== b) setSelectedVersions([a, i]);
                    }}
                    className={cn(
                      'flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-2xl border transition-all duration-300',
                      isBest ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/5 bg-muted/20',
                      isSelected && 'ring-2 ring-primary/60',
                      selectedVersions && 'cursor-pointer hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center text-xs font-black flex-shrink-0',
                        isBest ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' : 'bg-primary/10 border-primary/20 text-primary'
                      )}>
                        {isBest ? <Award className="w-4 h-4" /> : i + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-foreground">{run.version}</p>
                          {isBest && <span className="text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded font-black uppercase">Best</span>}
                          {i === 0 && <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded font-black uppercase">Current</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] text-muted-foreground/50">{new Date(run.trainedAt).toLocaleString()}</p>
                          <span className="text-[10px] text-muted-foreground/40">·</span>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                            <Database className="w-2.5 h-2.5" />{run.datasetSize.toLocaleString()} records
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-5 md:ml-auto text-right">
                      {[
                        { k: 'Accuracy', v: run.accuracy },
                        { k: 'Precision', v: run.precision },
                        { k: 'Recall', v: run.recall },
                        { k: 'F1', v: run.f1Score },
                        { k: 'ROC-AUC', v: run.rocAuc },
                      ].map(m => (
                        <div key={m.k}>
                          <div className="text-sm font-black text-foreground">{formatNumber(m.v, 2)}%</div>
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/40">{m.k}</div>
                        </div>
                      ))}
                      {delta !== null && (
                        <div>
                          <DeltaBadge delta={delta} />
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/40">Δ Acc</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Model Comparison Mode ─────────────────────────────────────────── */}
      {selectedVersions && vA && vB && (
        <motion.div variants={itemVariants}>
          <Card className="glass premium-shadow border-primary/20 bg-primary/5 overflow-hidden">
            <CardHeader className="border-b border-border/40 bg-primary/10 pb-5">
              <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-primary" />Side-by-Side Comparison
                <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">
                  {vA.version} vs {vB.version}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="font-black text-xs text-muted-foreground uppercase tracking-widest">Metric</div>
                <div className="font-black text-xs text-center text-primary uppercase tracking-widest">{vA.version}</div>
                <div className="font-black text-xs text-center text-muted-foreground uppercase tracking-widest">{vB.version}</div>
                {[
                  { label: 'Accuracy',  a: vA.accuracy,  b: vB.accuracy },
                  { label: 'Precision', a: vA.precision, b: vB.precision },
                  { label: 'Recall',    a: vA.recall,    b: vB.recall },
                  { label: 'F1 Score',  a: vA.f1Score,   b: vB.f1Score },
                  { label: 'ROC-AUC',   a: vA.rocAuc,    b: vB.rocAuc },
                ].map((row, i) => {
                  const diff = parseFloat((row.a - row.b).toFixed(2));
                  return (
                    <div key={`cmp-${i}-${row.label}`} className="contents">
                      <div className="text-sm font-bold text-foreground py-2 border-t border-white/5">{row.label}</div>
                      <div className={cn('text-sm font-black text-center py-2 border-t border-white/5', row.a > row.b ? 'text-emerald-400' : row.a < row.b ? 'text-red-400' : 'text-foreground')}>{row.a}%</div>
                      <div className={cn('text-sm font-black text-center py-2 border-t border-white/5', row.b > row.a ? 'text-emerald-400' : row.b < row.a ? 'text-red-400' : 'text-foreground')}>
                        {row.b}% <span className={cn('text-[10px]', diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-muted-foreground')}>{diff > 0 ? `+${diff}` : diff}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Drift Detection ─────────────────────────────────────────────── */}
      {drift && drift.length > 0 && (
        <Card className="glass premium-shadow border-white/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
            <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />Data Distribution Monitor
              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Drift Detection</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Live customer data distribution vs training-time baselines. Alerts trigger above threshold.</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {drift.map((d, i) => {
                const exceeded = d.drift > d.threshold;
                return (
                  <div key={i} className={cn('p-4 rounded-2xl border transition-all', exceeded ? 'border-red-500/20 bg-red-500/5' : 'border-white/5 bg-muted/20')}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-black text-foreground">{d.feature}</p>
                        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">{d.label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-foreground">{d.drift}%</span>
                        {exceeded ? (
                          <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-black uppercase">DRIFT</span>
                        ) : (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-black uppercase">STABLE</span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-700', exceeded ? 'bg-red-500' : 'bg-emerald-500')}
                        style={{ width: `${Math.min(100, (d.drift / (d.threshold * 1.5)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[9px] text-muted-foreground/40 font-bold uppercase">
                      <span>0%</span>
                      <span>Threshold: {d.threshold}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
