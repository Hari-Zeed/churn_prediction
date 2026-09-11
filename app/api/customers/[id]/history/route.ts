import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await context.params;
    const customerId = resolvedParams?.id;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    // Fetch the last 10 predictions for this customer, ordered by newest first
    const history = await prisma.customerPredictionHistory.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      customerId,
      history,
      total: history.length,
    });
  } catch (error) {
    console.error('[/api/customers/[id]/history] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer prediction history' },
      { status: 500 }
    );
  }
}
