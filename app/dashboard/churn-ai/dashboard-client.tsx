'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChurnRiskChart } from '@/components/churn-risk-chart';
import { ChurnRiskTable } from '@/components/churn-risk-table';
import { FeatureImportance } from '@/components/feature-importance';
import { StrategicAlerts } from '@/components/strategic-alerts';
import { cn } from '@/lib/utils';
import type { Customer } from '@/lib/customer-data';
import { formatINRCompact } from '@/lib/currency';
import { formatNumber } from '@/lib/utils/format';
import {
  BrainCircuit,
  AlertTriangle,
  IndianRupee,
  ShieldCheck,
  Download,
  RefreshCw,
  Activity,
} from 'lucide-react';

interface DashboardProps {
  globalRisk: number;
  highRiskCohort: number;
  savedRevenue: number;
  riskDistribution: { bucket: string; count: number }[];
  topAtRisk: Customer[];
  featureImportance: { feature: string; impact: number }[];
  allCustomers: Customer[];
}

function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  return (
    <span>
      {prefix}
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

const KPI_CARDS = (
  globalRisk: number,
  highRiskCohort: number,
  savedRevenue: number,
) => [
  {
    label: 'Global Risk Index',
    value: `${formatNumber(globalRisk, 2)}%`,
    icon: AlertTriangle,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    glow: '0 0 20px rgba(249,115,22,0.2)',
    sub: 'Avg churn probability across all users',
  },
  {
    label: 'High Risk Cohort',
    value: highRiskCohort.toLocaleString(),
    icon: Activity,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    glow: '0 0 20px rgba(239,68,68,0.2)',
    sub: 'Customers with >60% churn probability',
  },
  {
    label: 'Saved Revenue',
    value: formatINRCompact(savedRevenue),
    icon: IndianRupee,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    glow: '0 0 20px rgba(34,197,94,0.2)',
    sub: 'Est. monthly revenue via retention actions',
  },
  {
    label: 'Model Confidence',
    value: `${formatNumber(94.2, 2)}%`,
    icon: ShieldCheck,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
    glow: '0 0 20px rgba(139,92,246,0.2)',
    sub: 'XGBoost model accuracy on test set',
  },
];

export function ChurnAIDashboard({
  globalRisk,
  highRiskCohort,
  savedRevenue,
  riskDistribution,
  topAtRisk,
  featureImportance,
  allCustomers,
}: DashboardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1800);
  };

  const kpis = KPI_CARDS(globalRisk, highRiskCohort, savedRevenue);

  // Convert Customer to the ChurnRowData shape that ChurnRiskTable expects
  const tableData = topAtRisk.map((c) => ({
    id: c.id,
    tenure: c.tenure,
    monthlyCharges: c.monthlyCharges,
    contractType: c.contractType,
    churnRisk: c.churnProbability * 100, // kept as raw number here, formatted in Table
  }));

  return (
    <div className="space-y-10 pb-24 enterprise-gradient min-h-screen">

      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.2)]">
              <BrainCircuit className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                Churn Prediction AI
              </h1>
              <p className="text-xs text-muted-foreground/70 font-medium tracking-wider uppercase mt-0.5">
                XGBoost Engine · 500 Customers Analyzed
              </p>
            </div>
            <div className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-green-500">Live</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-xl border-border/50 bg-card/50 backdrop-blur-sm font-bold text-xs h-9"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-2', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Recalculating…' : 'Refresh Model'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-border/50 bg-card/50 backdrop-blur-sm font-bold text-xs h-9"
          >
            <Download className="w-3.5 h-3.5 mr-2" />
            Export CSV
          </Button>
        </div>
      </motion.div>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={`kpi-${i}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <Card
                className={cn(
                  'glass premium-shadow border overflow-hidden group hover:scale-[1.02] transition-all duration-500 relative',
                  kpi.border,
                )}
                style={{ boxShadow: kpi.glow }}
              >
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className={cn('text-[10px] font-black uppercase tracking-[0.2em]', kpi.color)}>
                    {kpi.label}
                  </CardTitle>
                  <div className={cn('p-2 rounded-lg border', kpi.bg, kpi.border)}>
                    <Icon className={cn('w-3.5 h-3.5', kpi.color)} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-black text-foreground tracking-tighter">
                    {kpi.value}
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed font-medium">
                    {kpi.sub}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ── Charts + Alerts Row ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Risk Distribution Chart */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="glass premium-shadow border-white/5 h-full">
            <CardHeader className="border-b border-white/5 bg-muted/10 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    Customer Risk Distribution
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Churn probability density across {allCustomers.length} customers
                  </p>
                </div>
                <div className="flex gap-2">
                  {['0–20%', '21–40%', '41–60%', '61–80%', '81–100%'].map((b, i) => (
                    <div key={i} className="hidden xl:flex items-center gap-1">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: ['#22c55e','#84cc16','#f59e0b','#f97316','#ef4444'][i] }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <ChurnRiskChart data={riskDistribution} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Strategic Alerts */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="glass premium-shadow border-white/5 h-full">
            <CardHeader className="border-b border-red-500/20 bg-red-500/5 pb-5">
              <CardTitle className="text-sm font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Strategic Alerts
                <span className="ml-auto text-[9px] bg-red-500/20 px-2 py-0.5 rounded-full border border-red-500/30">
                  Action Required
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <StrategicAlerts customers={allCustomers} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Table + Feature Importance Row ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* At-Risk Customer Table */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          <div className="mb-4 flex items-center justify-between px-1">
            <h3 className="text-base font-bold text-foreground">
              Top At-Risk Customers
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 animate-pulse">
              {topAtRisk.length} Identified
            </span>
          </div>
          <ChurnRiskTable data={tableData} />
        </motion.div>

        {/* Feature Importance */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="glass premium-shadow border-white/5 h-full">
            <CardHeader className="border-b border-white/5 bg-muted/10 pb-5">
              <CardTitle className="text-base font-bold text-foreground">
                Feature Importance
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                SHAP-based churn drivers from XGBoost model
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <FeatureImportance features={featureImportance} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

    </div>
  );
}
