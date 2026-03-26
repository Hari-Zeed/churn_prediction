import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [customers, latestMetrics] = await Promise.all([
      prisma.customer.findMany({
        select: {
          churnProbability: true,
          riskLevel: true,
          lifetimeValue: true,
          engagementScore: true,
          predictedAt: true,
          monthlyCharges: true,
          predictedRevLoss: true,
          tenure: true,
          contractType: true,
        },
      }),
      prisma.modelMetrics.findFirst({
        orderBy: { trainedAt: 'desc' },
      }),
    ]);

    if (customers.length === 0) {
      return NextResponse.json({
        message: 'No data found. Run the ML pipeline first.',
        kpis: null,
        riskDistribution: null,
        churnTrend: null,
      });
    }

    // ── KPIs ────────────────────────────────────────────────────────────────
    const totalCustomers  = customers.length;
    const highRisk        = customers.filter((c) => c.riskLevel === 'High').length;
    const mediumRisk      = customers.filter((c) => c.riskLevel === 'Medium').length;
    const lowRisk         = customers.filter((c) => c.riskLevel === 'Low').length;
    const avgChurnProb    = customers.reduce((s, c) => s + c.churnProbability, 0) / (totalCustomers || 1);
    const retentionRate   = totalCustomers > 0 ? ((totalCustomers - highRisk - mediumRisk * 0.5) / totalCustomers) * 100 : 0;
    const avgLTV          = customers.reduce((s, c) => s + c.lifetimeValue, 0) / (totalCustomers || 1);
    const revenueImpact   = customers.reduce((s, c) => s + c.predictedRevLoss, 0);
    const totalMonthlyRev = customers.reduce((s, c) => s + c.monthlyCharges, 0);

    // ── Risk Distribution (for pie chart) ───────────────────────────────────
    const riskDistribution = [
      { name: 'High Risk',   value: parseFloat(((highRisk   / totalCustomers) * 100).toFixed(2)), count: highRisk,   color: '#ef4444' },
      { name: 'Medium Risk', value: parseFloat(((mediumRisk / totalCustomers) * 100).toFixed(2)), count: mediumRisk, color: '#f59e0b' },
      { name: 'Low Risk',    value: parseFloat(((lowRisk    / totalCustomers) * 100).toFixed(2)), count: lowRisk,    color: '#10b981' },
    ];

    // ── Churn Probability Distribution histogram (10 buckets) ───────────────
    const buckets = Array(10).fill(0).map((_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      count: 0,
    }));
    customers.forEach(c => {
      const idx = Math.min(9, Math.floor(c.churnProbability * 10));
      buckets[idx].count++;
    });

    // ── Engagement distribution (for trend chart) ────────────────────────────
    const engagements = customers.map((c) => c.engagementScore).sort((a, b) => a - b);
    const quartileSize = Math.floor(engagements.length / 4);
    const engagementTrend = ['Q1 (Lowest)', 'Q2', 'Q3', 'Q4 (Highest)'].map((label, i) => {
      const slice = engagements.slice(i * quartileSize, (i + 1) * quartileSize);
      const avgEng = slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : 0;
      return { name: label, avgEngagement: parseFloat(avgEng.toFixed(3)) };
    });

    // ── Revenue at Risk by Contract Type (Area Chart Data) ───────────────────
    const revenueByContract = Array.from(
      customers.reduce((acc, c) => {
        if (!acc.has(c.contractType)) {
          acc.set(c.contractType, { name: c.contractType, revenue: 0, atRisk: 0 });
        }
        const data = acc.get(c.contractType)!;
        data.revenue += c.monthlyCharges;
        data.atRisk += c.predictedRevLoss;
        return acc;
      }, new Map<string, { name: string; revenue: number; atRisk: number }>())
    ).map(([_, v]) => ({
      name: v.name,
      totalRevenue: parseFloat(v.revenue.toFixed(2)),
      revenueAtRisk: parseFloat(v.atRisk.toFixed(2)),
    }));

    // ── Tenure Brackets for Retention Trend ──────────────────────────────────
    const tenureBrackets = ['0-12m', '13-24m', '25-36m', '37-48m', '49m+'];
    const retentionTrends = tenureBrackets.map((bracket) => ({ name: bracket, total: 0, retained: 0 }));
    customers.forEach((c) => {
      let idx = 0;
      if (c.tenure > 48) idx = 4;
      else if (c.tenure > 36) idx = 3;
      else if (c.tenure > 24) idx = 2;
      else if (c.tenure > 12) idx = 1;

      retentionTrends[idx].total++;
      if (c.churnProbability < 0.5) retentionTrends[idx].retained++;
    });
    const formattedRetentionTrends = retentionTrends.map((b) => ({
      name: b.name,
      retentionRate: b.total > 0 ? parseFloat(((b.retained / b.total) * 100).toFixed(2)) : 0,
    }));

    // ── Tenure vs Churn Risk (Scatter Plot Data) ─────────────────────────────
    // Take a random sample to maintain react rechart performance
    const sampleSize = Math.min(customers.length, 500);
    const shuffled = [...customers].sort(() => 0.5 - Math.random());
    const tenureVsRisk = shuffled.slice(0, sampleSize).map((c) => ({
      tenure: c.tenure,
      churnProbability: parseFloat((c.churnProbability * 100).toFixed(2)),
      riskLevel: c.riskLevel,
    }));

    return NextResponse.json({
      kpis: {
        totalCustomers,
        highRiskCount: highRisk,
        mediumRiskCount: mediumRisk,
        lowRiskCount: lowRisk,
        avgChurnProbability: parseFloat((avgChurnProb * 100).toFixed(2)),
        retentionRate: parseFloat(retentionRate.toFixed(2)),
        avgLifetimeValue: parseFloat(avgLTV.toFixed(2)),
        revenueImpact: parseFloat(revenueImpact.toFixed(2)),
        totalMonthlyRev: parseFloat(totalMonthlyRev.toFixed(2)),
        modelAccuracy: latestMetrics ? parseFloat((latestMetrics.accuracy * 100).toFixed(2)) : null,
      },
      riskDistribution,
      churnHistogram: buckets,
      engagementTrend,
      revenueByContract,
      retentionTrends: formattedRetentionTrends,
      tenureVsRisk,
    });
  } catch (error) {
    console.error('[/api/analytics] Error:', error);
    return NextResponse.json({ error: 'Failed to load analytics from database.' }, { status: 500 });
  }
}
