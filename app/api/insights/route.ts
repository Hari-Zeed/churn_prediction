import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // 1. Fetch high-risk customers and overall statistics
    const [highRiskCustomers, totalCustomers, totalHighRisk] = await Promise.all([
      prisma.customer.findMany({
        where: { riskLevel: 'High' },
        select: {
          id: true,
          churnProbability: true,
          predictedRevLoss: true,
          contractType: true,
          tenure: true,
          monthlyCharges: true,
          lifetimeValue: true,
        },
        orderBy: { churnProbability: 'desc' },
        take: 10,
      }),
      prisma.customer.count(),
      prisma.customer.count({ where: { riskLevel: 'High' } }),
    ]);

    if (totalCustomers === 0) {
      return NextResponse.json({ insights: [], topAtRisk: [] });
    }

    // 2. Generate Programmatic Business Insights
    const insights = [];
    
    // Insight A: Overall Risk
    const riskPercentage = (totalHighRisk / totalCustomers) * 100;
    if (riskPercentage > 20) {
      insights.push({
        id: '1',
        title: 'Critical Churn Alert',
        description: `${riskPercentage.toFixed(1)}% of your customer base is at High Risk of churning. Immediate retention campaigns are required.`,
        type: 'danger',
      });
    }

    // Insight B: Contract Vulnerability (We know M2M is a huge factor from expand_dataset)
    const m2mHighRisk = await prisma.customer.count({
      where: { riskLevel: 'High', contractType: 'Month-to-Month' },
    });
    const m2mRiskPct = totalHighRisk > 0 ? (m2mHighRisk / totalHighRisk) * 100 : 0;
    
    if (m2mRiskPct > 50) {
      insights.push({
        id: '2',
        title: 'Contract Vulnerability',
        description: `${m2mRiskPct.toFixed(1)}% of high-risk customers are on Month-to-Month contracts. Consider targeted annual upgrade discounts.`,
        type: 'warning',
      });
    }

    // Insight C: Revenue concentration
    const top10RevLoss = highRiskCustomers.reduce((sum, c) => sum + c.predictedRevLoss, 0);
    if (top10RevLoss > 500) {
      insights.push({
        id: '3',
        title: 'High-Value Revenue at Risk',
        description: `The top 10 at-risk customers account for ₹${top10RevLoss.toFixed(2)} in monthly recurring revenue.`,
        type: 'info',
      });
    }

    // Insight D: Tenure correlation
    const averageHighRiskTenure = highRiskCustomers.reduce((sum, c) => sum + c.tenure, 0) / (highRiskCustomers.length || 1);
    insights.push({
      id: '4',
      title: 'Tenure Risk Profile',
      description: `High-risk customers have an average tenure of ${averageHighRiskTenure.toFixed(1)} months. Focus engagement on this lifecycle stage.`,
      type: 'success',
    });

    // 3. Generate Strategy Recommendations per High-Risk Customer
    const topAtRisk = highRiskCustomers.map((c) => {
      let strategy = 'Assign dedicated account manager';
      if (c.contractType === 'Month-to-Month') {
        strategy = 'Offer 20% discount on 1-Year upgrade';
      } else if (c.tenure < 12) {
        strategy = 'Enroll in early-lifecycle onboarding workflow';
      } else if (c.monthlyCharges > 80) {
        strategy = 'Provide complimentary premium support tier';
      }

      return {
        ...c,
        recommendedStrategy: strategy,
      };
    });

    return NextResponse.json({
      insights,
      topAtRisk,
    });
  } catch (error) {
    console.error('[/api/insights] Error:', error);
    return NextResponse.json({ error: 'Failed to generate insights.' }, { status: 500 });
  }
}
