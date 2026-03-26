// Server Component — analytics computed at request time, no client JS overhead
import { MOCK_CUSTOMERS } from '@/lib/customer-data';
import {
  calculateGlobalRiskIndex,
  calculateHighRiskCohort,
  calculateSavedRevenue,
  buildRiskDistribution,
  getTopAtRisk,
  FEATURE_IMPORTANCE,
} from '@/lib/churn-analytics';
import { ChurnAIDashboard } from './dashboard-client';

export default function ChurnAIPage() {
  // All heavy computation happens server-side
  const globalRisk = calculateGlobalRiskIndex(MOCK_CUSTOMERS);
  const highRiskCohort = calculateHighRiskCohort(MOCK_CUSTOMERS);
  const savedRevenue = calculateSavedRevenue(MOCK_CUSTOMERS);
  const riskDistribution = buildRiskDistribution(MOCK_CUSTOMERS);
  const topAtRisk = getTopAtRisk(MOCK_CUSTOMERS, 12);

  return (
    <ChurnAIDashboard
      globalRisk={globalRisk}
      highRiskCohort={highRiskCohort}
      savedRevenue={savedRevenue}
      riskDistribution={riskDistribution}
      topAtRisk={topAtRisk}
      featureImportance={FEATURE_IMPORTANCE}
      allCustomers={MOCK_CUSTOMERS}
    />
  );
}
