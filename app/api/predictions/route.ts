import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page   = parseInt(searchParams.get('page') ?? '1', 10);
    const limit  = parseInt(searchParams.get('limit') ?? '50', 10);
    const risk   = searchParams.get('risk'); // "High" | "Medium" | "Low" | null
    const search = searchParams.get('search'); // query for customer ID
    const sort   = searchParams.get('sort') ?? 'churnProbability'; // "churnProbability" | "tenure" | "engagementScore" | "predictedRevLoss"
    const order  = searchParams.get('order') ?? 'desc';
    const contract = searchParams.get('contract'); // "Month-to-Month" | "1-Year" | "2-Year"

    const where: any = {};
    if (risk) where.riskLevel = risk;
    if (contract) where.contractType = contract;
    if (search) {
      where.id = { contains: search };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { [sort]: order as 'asc' | 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    if (customers.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        limit,
        message: 'No predictions found. Run the batch_predict.py script to populate the database.',
      });
    }

    return NextResponse.json({ data: customers, total, page, limit });
  } catch (error) {
    console.error('[/api/predictions] Error:', error);
    return NextResponse.json({ error: 'Failed to load predictions from database.' }, { status: 500 });
  }
}
