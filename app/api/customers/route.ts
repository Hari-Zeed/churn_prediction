import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ─── Query Parameters Validation Schema ───────────────────────────────────────
const customersQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100 (strict pagination enforced)')
    .default(50),
  risk: z.enum(['High', 'Medium', 'Low']).optional(),
  contract: z.enum(['Month-to-Month', '1-Year', '2-Year']).optional(),
  predictedChurn: z.coerce.number().int().min(0).max(1).optional(),
  search: z.string().trim().max(100, 'Search query cannot exceed 100 characters').optional(),
  sort: z
    .enum([
      'churnProbability',
      'predictedChurn',
      'tenure',
      'monthlyCharges',
      'engagementScore',
      'paymentReliability',
      'predictedRevLoss',
      'riskLevel',
      'createdAt',
      'id',
      'churnVelocity',
    ])
    .default('churnProbability'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Reject deprecated/dangerous unbounded limits explicitly
    const rawLimit = searchParams.get('limit');
    if (rawLimit === '-1' || searchParams.get('all') === 'true') {
      return NextResponse.json(
        {
          success: false,
          error: 'Unbounded export is disabled. Maximum limit is 100.',
        },
        { status: 400 }
      );
    }

    // Input Validation using Zod
    const validation = customersQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: rawLimit ?? undefined,
      risk: searchParams.get('risk') ?? undefined,
      contract: searchParams.get('contract') ?? undefined,
      predictedChurn: searchParams.get('predictedChurn') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
      order: searchParams.get('order')?.toLowerCase() ?? undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { page, limit, risk, contract, predictedChurn, search, sort, order } = validation.data;

    // Filter construction
    const where: any = {};
    if (risk) where.riskLevel = risk;
    if (contract) where.contractType = contract;
    if (predictedChurn !== undefined) where.predictedChurn = predictedChurn;
    if (search) where.id = { contains: search };

    // Query Prisma DB with strict pagination
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          tenure: true,
          orderFreqMonth: true,
          discountUsagePct: true,
          avgRating: true,
          paymentFailures: true,
          supportCalls: true,
          competitorOffers: true,
          avgDeliveryTime: true,
          lateDeliveries: true,
          churnProbability: true,
          riskLevel: true,
          predictedChurn: true,
          churnReason: true,
          retentionAction: true,
          topFactors: true,
          previousChurnProbability: true,
          churnVelocity: true,
          churnTrend: true,
          monthlyCharges: true,
          contractType: true,
          paymentMethod: true,
          predictedRevLoss: true,
          lifetimeValue: true,
          discountDependency: true,
          engagementScore: true,
          paymentReliability: true,
          orderFreqTrend: true,
          competitorExposure: true,
          predictedAt: true,
          createdAt: true,
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    // Format customers with dynamic SHAP explanations and structured topFactors
    const enrichedCustomers = customers.map((c) => {
      const customerVal = (c.monthlyCharges ?? 0) * (c.tenure ?? 0);
      let topFactors: { feature: string; impact: number }[] = [];
      try {
        if (c.topFactors && c.topFactors.trim().length > 0) {
          topFactors = JSON.parse(c.topFactors);
        }
      } catch {
        topFactors = [];
      }

      const churnReason = c.churnReason?.trim() || 'Model evaluation completed.';
      const retentionAction = c.retentionAction?.trim() || 'Maintain standard engagement and monitor activity';

      return {
        ...c,
        customerValue: Math.round(customerVal * 100) / 100,
        churnReason,
        reason: churnReason,
        retentionAction,
        topFactors,
        explanation: {
          reason: churnReason,
          topFactors,
        },
        previousChurnProbability: c.previousChurnProbability ?? null,
        churnVelocity: c.churnVelocity ?? 0,
        churnTrend: c.churnTrend ?? 'Stable',
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedCustomers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[/api/customers] Failed to fetch customer data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal error occurred',
      },
      { status: 500 }
    );
  }
}
