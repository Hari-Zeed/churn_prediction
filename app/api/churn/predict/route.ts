import { NextResponse } from 'next/server';

/**
 * This route is intentionally minimal — churn predictions are no longer
 * computed in the Next.js API. They come from the Python ML pipeline (batch_predict.py)
 * stored in the Prisma database. Use GET /api/predictions to read them.
 */
export async function GET() {
  return NextResponse.json({
    message: 'Churn predictions are served from /api/predictions (database-backed ML results).',
    documentation: {
      predictions: 'GET /api/predictions?page=1&limit=50&risk=High&sort=churnProbability&order=desc',
      analytics:   'GET /api/analytics',
      metrics:     'GET /api/metrics',
      retrain:     'POST /api/retrain',
    },
  });
}
