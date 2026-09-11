/**
 * api-client.ts
 * -------------
 * All real data comes from the Prisma database via Next.js API routes.
 * Mock data and Math.random() have been removed.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface TopFactor {
  feature: string;
  impact: number;
}

export interface Customer {
  id: string;
  tenure: number;
  orderFreqMonth: number;
  discountUsagePct: number;
  avgRating: number;
  paymentFailures: number;
  supportCalls: number;
  competitorOffers: number;
  avgDeliveryTime: number;
  lateDeliveries: number;
  churnProbability: number;
  riskLevel: 'High' | 'Medium' | 'Low';
  predictedChurn: number;
  churnReason?: string;
  retentionAction?: string;
  topFactors?: TopFactor[];
  customerValue?: number;
  previousChurnProbability?: number | null;
  churnVelocity?: number;
  churnTrend?: string;
  monthlyCharges: number;
  contractType: string;
  paymentMethod: string;
  predictedRevLoss: number;
  lifetimeValue: number;
  discountDependency: number;
  engagementScore: number;
  paymentReliability: number;
  orderFreqTrend: number;
  competitorExposure: number;
  predictedAt: string | null;
  createdAt: string;
}

export interface PredictionsResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  message?: string;
}

export interface RiskBucket {
  name: string;
  value: number;
  count: number;
  color: string;
}

export interface ChurnHistogramBucket {
  range: string;
  count: number;
}

export interface EngagementTrendPoint {
  name: string;
  avgEngagement: number;
}

export interface AnalyticsKPIs {
  totalCustomers: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  avgChurnProbability: number;
  retentionRate: number;
  avgLifetimeValue: number;
  revenueImpact: number;
  totalMonthlyRev: number;
  modelAccuracy: number | null;
}

export interface AnalyticsResponse {
  kpis: AnalyticsKPIs | null;
  riskDistribution: RiskBucket[] | null;
  churnHistogram: ChurnHistogramBucket[] | null;
  engagementTrend: EngagementTrendPoint[] | null;
  revenueByContract?: { name: string; totalRevenue: number; revenueAtRisk: number }[];
  retentionTrends?: { name: string; retentionRate: number }[];
  tenureVsRisk?: { tenure: number; churnProbability: number; riskLevel: string }[];
  drift?: {
    score: number;
    status: string;
    isDriftDetected: boolean;
  };
  message?: string;
}

export interface ModelMetricsRecord {
  id: string;
  version: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  driftScore?: number;
  driftStatus?: string;
  trainedAt: string;
  featureImportance?: Array<{ name: string; value: number }>;
}

export interface ModelMetricsResponse {
  latest: ModelMetricsRecord | null;
  history: Array<{
    version: string;
    accuracy: number;
    f1Score: number;
    rocAuc: number;
    driftScore?: number;
    driftStatus?: string;
    trainedAt: string;
  }>;
  driftScore?: number;
  driftStatus?: string;
  message?: string;
}

// ── Fetch Helpers ──────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...options });
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchPredictions(
  page = 1,
  limit = 50,
  risk?: string,
  sort = 'churnProbability',
  order = 'desc',
  search?: string,
  contract?: string
): Promise<PredictionsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
    order,
  });
  if (risk) params.set('risk', risk);
  if (search) params.set('search', search);
  if (contract) params.set('contract', contract);
  return fetchJson<PredictionsResponse>(`/api/predictions?${params}`);
}

export async function fetchAnalytics(): Promise<AnalyticsResponse> {
  return fetchJson<AnalyticsResponse>('/api/analytics');
}

export async function fetchModelMetrics(): Promise<ModelMetricsResponse> {
  return fetchJson<ModelMetricsResponse>('/api/metrics');
}

export async function triggerRetrain(): Promise<{ success: boolean; logs: string[]; error?: string }> {
  return fetchJson('/api/retrain', { method: 'POST' });
}

/** Returns top N customers by churn probability for the "at risk" insight feed */
export async function fetchHighRiskCustomers(limit = 10): Promise<Customer[]> {
  const result = await fetchCustomers(1, limit, 'High', 'churnProbability', 'desc');
  return result.data ?? [];
}

export interface CustomersApiResponse {
  success: boolean;
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  error?: string;
}

export async function fetchCustomers(
  page = 1,
  limit = 50,
  risk?: string,
  sort = 'churnProbability',
  order = 'desc',
  search?: string,
  contract?: string,
  predictedChurn?: number
): Promise<CustomersApiResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
    order,
  });
  if (risk && risk !== 'All') params.set('risk', risk);
  if (search) params.set('search', search);
  if (contract) params.set('contract', contract);
  if (predictedChurn !== undefined) params.set('predictedChurn', String(predictedChurn));

  return fetchJson<CustomersApiResponse>(`/api/customers?${params}`);
}

export async function searchCustomers(query: string, limit = 20): Promise<Customer[]> {
  const result = await fetchCustomers(1, limit, undefined, 'churnProbability', 'desc', query);
  return result.data ?? [];
}

export interface DriftStatusResponse {
  driftDetected: boolean;
  driftScore: number;
  driftStatus: string;
  threshold: number;
  version?: string;
  lastEvaluatedAt?: string;
  message?: string;
}

export async function fetchDriftStatus(): Promise<DriftStatusResponse> {
  return fetchJson<DriftStatusResponse>('/api/drift');
}
