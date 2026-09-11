'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, ShieldAlert, ShieldCheck, Sparkles, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TopFactor {
  feature: string;
  impact: number;
}

export interface ChurnExplainabilityProps {
  topFactors?: TopFactor[];
  churnProbability?: number;
  className?: string;
}

const FEATURE_METADATA: Record<string, { label: string; description: string; positiveHint: string; negativeHint: string }> = {
  contract_type: {
    label: 'Contract Type',
    description: 'Contract commitment structure',
    positiveHint: 'Month-to-month flexibility significantly elevates cancellation likelihood.',
    negativeHint: 'Long-term annual commitment provides strong retention stability.',
  },
  tenure_months: {
    label: 'Account Tenure',
    description: 'Length of customer relationship',
    positiveHint: 'Short tenure indicates early-stage customer with higher onboarding flight risk.',
    negativeHint: 'Mature tenure builds brand loyalty and lowers switching propensity.',
  },
  monthly_charges: {
    label: 'Monthly Charges',
    description: 'Current recurring monthly fee',
    positiveHint: 'High monthly expense increases bill shock and competitor price sensitivity.',
    negativeHint: 'Competitive pricing structure minimizes cost-driven cancellations.',
  },
  payment_method: {
    label: 'Payment Method',
    description: 'Billing and transaction channel',
    positiveHint: 'Manual payment methods (e.g. electronic checks) exhibit higher failure and lapse rates.',
    negativeHint: 'Automated billing (e.g. credit card / bank ACH) ensures frictionless renewals.',
  },
  engagement_score: {
    label: 'Platform Engagement',
    description: 'Usage frequency & feature adoption depth',
    positiveHint: 'Depressed activity indicates declining perceived value and disengagement.',
    negativeHint: 'Deep feature adoption and frequent usage drive strong customer stickiness.',
  },
  payment_reliability: {
    label: 'Payment Reliability',
    description: 'Track record of on-time payments',
    positiveHint: 'Inconsistent payment track record correlates with churn intent.',
    negativeHint: 'Flawless payment history signals high commitment and financial stability.',
  },
};

export function ChurnExplainability({
  topFactors,
  churnProbability,
  className,
}: ChurnExplainabilityProps) {
  if (!topFactors || topFactors.length === 0) {
    return (
      <div className={cn('p-4 rounded-xl bg-black/20 border border-white/5 text-center text-xs text-muted-foreground', className)}>
        SHAP explainability data not available for this profile.
      </div>
    );
  }

  // Find max absolute impact to normalize bar lengths relative to the dominant factor
  const maxAbsImpact = Math.max(...topFactors.map((f) => Math.abs(f.impact)), 0.01);

  return (
    <div className={cn('space-y-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-white/10 p-5 shadow-2xl', className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">
              Why this customer will churn
            </h4>
          </div>
          <p className="text-[11px] text-muted-foreground">
            SHAP (Shapley Additive exPlanations) TreeExplainer attribution weights
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2.5 text-[10px] font-bold">
          <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Reduces Churn
          </span>
          <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            Increases Churn
          </span>
        </div>
      </div>

      {/* Factor Cards */}
      <div className="space-y-3">
        {topFactors.map((factor, idx) => {
          const isRiskDriver = factor.impact > 0;
          const meta = FEATURE_METADATA[factor.feature] ?? {
            label: factor.feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            description: 'Customer attribute',
            positiveHint: 'Increases likelihood of customer attrition.',
            negativeHint: 'Acts as a protective factor preventing attrition.',
          };

          const formattedImpact = (factor.impact > 0 ? '+' : '') + factor.impact.toFixed(2);
          const percentWidth = Math.min(100, Math.max(12, Math.round((Math.abs(factor.impact) / maxAbsImpact) * 100)));

          return (
            <div
              key={factor.feature || idx}
              className={cn(
                'p-3.5 rounded-xl border transition-all duration-200',
                isRiskDriver
                  ? 'bg-rose-500/[0.04] border-rose-500/20 hover:border-rose-500/40'
                  : 'bg-emerald-500/[0.04] border-emerald-500/20 hover:border-emerald-500/40'
              )}
            >
              {/* Top Row: Label & Impact Value */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {isRiskDriver ? (
                    <ArrowUpRight className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <span className="text-xs font-black text-foreground">{meta.label}</span>
                    <span className="text-[10px] text-muted-foreground/80 block font-medium">
                      {meta.description}
                    </span>
                  </div>
                </div>

                {/* Pill */}
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-black border shadow-sm',
                    isRiskDriver
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  )}
                >
                  <span>{formattedImpact}</span>
                  <span className="text-[9px] font-sans font-bold uppercase tracking-wider opacity-80">
                    {isRiskDriver ? 'churn driver' : 'protective'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full rounded-full bg-black/40 overflow-hidden border border-white/5 my-2">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isRiskDriver
                      ? 'bg-gradient-to-r from-rose-500 to-red-400 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  )}
                  style={{ width: `${percentWidth}%` }}
                />
              </div>

              {/* Context Hint */}
              <p className="text-[10px] font-medium text-muted-foreground/90 mt-1 leading-relaxed">
                {isRiskDriver ? meta.positiveHint : meta.negativeHint}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ChurnExplainability;
