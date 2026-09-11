import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const latest = await prisma.modelMetrics.findFirst({
      orderBy: { trainedAt: 'desc' },
      select: {
        id: true,
        version: true,
        driftScore: true,
        driftStatus: true,
        trainedAt: true,
      },
    });

    if (!latest) {
      return NextResponse.json({
        driftDetected: false,
        driftScore: 0.0,
        driftStatus: 'STABLE',
        threshold: 0.25,
        message: 'No model metrics found. Run batch prediction to evaluate drift.',
      });
    }

    const driftScore = typeof latest.driftScore === 'number' ? Number(latest.driftScore.toFixed(4)) : 0.0;
    const driftStatus = latest.driftStatus || 'STABLE';
    const driftDetected = driftStatus === 'DRIFT_DETECTED' || driftScore > 0.25;

    return NextResponse.json({
      driftDetected,
      driftScore,
      driftStatus,
      threshold: 0.25,
      version: latest.version,
      lastEvaluatedAt: latest.trainedAt,
    });
  } catch (error) {
    console.error('[/api/drift] Error:', error);
    return NextResponse.json(
      { error: 'Internal error occurred' },
      { status: 500 }
    );
  }
}
