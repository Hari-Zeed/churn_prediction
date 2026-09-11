// Server Component — real analytics computed from Prisma DB at request time
import { prisma } from '@/lib/prisma';
import {
  calculateGlobalRiskIndex,
  calculateHighRiskCohort,
  calculateSavedRevenue,
  buildRiskDistribution,
  getTopAtRisk,
  FEATURE_IMPORTANCE,
} from '@/lib/churn-analytics';
import type { Customer } from '@/lib/customer-data';
import { ChurnAIDashboard } from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function ChurnAIPage() {
  // Fetch real customers from Prisma database
  const dbCustomers = await prisma.customer.findMany({
    select: {
      id: true,
      tenure: true,
      monthlyCharges: true,
      contractType: true,
      supportCalls: true,
      churnProbability: true,
      predictedChurn: true,
      riskLevel: true,
    },
    orderBy: { churnProbability: 'desc' },
    take: 1000,
  });

  const realCustomers: Customer[] = dbCustomers.map((c) => ({
    id: c.id,
    tenure: c.tenure,
    monthlyCharges: c.monthlyCharges,
    contractType: c.contractType as any,
    techSupport: true,
    onlineSecurity: true,
    supportTickets: c.supportCalls ?? 0,
    churnProbability: c.churnProbability,
  }));

  // Real analytics computed server-side
  const globalRisk = calculateGlobalRiskIndex(realCustomers);
  const highRiskCohort = calculateHighRiskCohort(realCustomers);
  const savedRevenue = calculateSavedRevenue(realCustomers);
  const riskDistribution = buildRiskDistribution(realCustomers);
  const topAtRisk = getTopAtRisk(realCustomers, 12);

  return (
    <ChurnAIDashboard
      globalRisk={globalRisk}
      highRiskCohort={highRiskCohort}
      savedRevenue={savedRevenue}
      riskDistribution={riskDistribution}
      topAtRisk={topAtRisk}
      featureImportance={FEATURE_IMPORTANCE}
      allCustomers={realCustomers}
    />
  );
}
