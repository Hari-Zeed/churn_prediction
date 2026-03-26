import type { Customer } from './customer-data';

/** Average churn probability across all customers (0-100 scale) */
export function calculateGlobalRiskIndex(customers: Customer[]): number {
  if (!customers.length) return 0;
  const avg = customers.reduce((sum, c) => sum + c.churnProbability, 0) / customers.length;
  return parseFloat((avg * 100).toFixed(1));
}

/** Number of customers with churn probability above 60% */
export function calculateHighRiskCohort(customers: Customer[]): number {
  return customers.filter((c) => c.churnProbability > 0.6).length;
}

/**
 * Estimate monthly revenue saved through proactive retention.
 * Assumption: 40% of at-risk customers can be retained with the right action.
 */
export function calculateSavedRevenue(customers: Customer[]): number {
  const highRisk = customers.filter((c) => c.churnProbability > 0.6);
  const totalMonthly = highRisk.reduce((sum, c) => sum + c.monthlyCharges, 0);
  return parseFloat((totalMonthly * 0.4).toFixed(0));
}

/** Group customers into churn-probability bins for histogram display */
export function buildRiskDistribution(customers: Customer[]): { bucket: string; count: number }[] {
  const bins = [
    { label: '0–20%', min: 0, max: 0.2 },
    { label: '21–40%', min: 0.2, max: 0.4 },
    { label: '41–60%', min: 0.4, max: 0.6 },
    { label: '61–80%', min: 0.6, max: 0.8 },
    { label: '81–100%', min: 0.8, max: 1.01 },
  ];
  return bins.map((bin) => ({
    bucket: bin.label,
    count: customers.filter((c) => c.churnProbability >= bin.min && c.churnProbability < bin.max).length,
  }));
}

/** Return the top-N customers sorted by highest churn risk */
export function getTopAtRisk(customers: Customer[], n = 10): Customer[] {
  return [...customers].sort((a, b) => b.churnProbability - a.churnProbability).slice(0, n);
}

/** Simulated SHAP feature importances (0-100) */
export const FEATURE_IMPORTANCE = [
  { feature: 'Contract Type', impact: 85 },
  { feature: 'Tenure', impact: 72 },
  { feature: 'Monthly Charges', impact: 61 },
  { feature: 'Tech Support', impact: 44 },
  { feature: 'Online Security', impact: 33 },
  { feature: 'Support Tickets', impact: 28 },
];
