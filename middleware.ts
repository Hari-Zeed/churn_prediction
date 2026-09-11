import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Upstash Redis Rate Limiter ───────────────────────────────────────────────
const hasUpstash =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

const upstashRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '60 s'),
      analytics: true,
      prefix: 'ratelimit:api',
    })
  : null;

// ─── In-Memory Rate Limit Fallback (dev / no Upstash) ────────────────────────
const memoryStore = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(ip: string): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  if (upstashRatelimit) {
    return await upstashRatelimit.limit(ip);
  }

  const now = Date.now();
  const windowMs = 60 * 1000;
  const entry = memoryStore.get(ip);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(ip, { count: 1, resetAt: now + windowMs });
    return { success: true, limit: 100, remaining: 99, reset: now + windowMs };
  }
  if (entry.count >= 100) {
    return { success: false, limit: 100, remaining: 0, reset: entry.resetAt };
  }
  entry.count += 1;
  return { success: true, limit: 100, remaining: 100 - entry.count, reset: entry.resetAt };
}

// ─── CORS Origin Validation ───────────────────────────────────────────────────
const ALLOWED_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'http://localhost:3000';

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // server-to-server or same-origin (no Origin header)
  try {
    const originHost = new URL(origin).hostname;
    const allowedHost = new URL(ALLOWED_ORIGIN).hostname;
    return originHost === allowedHost || originHost === 'localhost';
  } catch {
    return false;
  }
}

// ─── Structured Request Logger ────────────────────────────────────────────────
function logRequest(req: NextRequest, status: number, ip: string): void {
  // Only log on server (no-op in edge if console is unavailable)
  try {
    const entry = JSON.stringify({
      event: 'api_request',
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.nextUrl.pathname,
      ip,
      status,
      userAgent: req.headers.get('user-agent')?.slice(0, 100) ?? 'unknown',
    });
    // In production this feeds into Vercel log drains / Datadog
    console.log(entry);
  } catch {
    // never throw inside middleware
  }
}

// ─── Protected API Routes ─────────────────────────────────────────────────────
// ALL routes that handle sensitive data or trigger privileged operations
const PROTECTED_PREFIXES = [
  '/api/customers',
  '/api/metrics',
  '/api/drift',
  '/api/retrain',
  '/api/analytics',
  '/api/insights',
  '/api/predictions',
  '/api/settings',
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ─── Middleware ───────────────────────────────────────────────────────────────
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only intercept API routes in our protected list
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  // 1. CORS origin check
  const origin = req.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    logRequest(req, 403, 'cors-block');
    return NextResponse.json(
      { success: false, error: 'Forbidden', message: 'Cross-origin request blocked.' },
      { status: 403 }
    );
  }

  // 2. Rate limiting — 100 req/min per IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1';

  const rateLimit = await checkRateLimit(ip);

  if (!rateLimit.success) {
    logRequest(req, 429, ip);
    return NextResponse.json(
      {
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Maximum 100 requests per minute per IP.',
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimit.limit.toString(),
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.reset.toString(),
          'Retry-After': Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000)).toString(),
        },
      }
    );
  }

  // 3. NextAuth session verification
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    logRequest(req, 401, ip);
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        message: 'Active session required. Please sign in.',
      },
      { status: 401 }
    );
  }

  // 4. Log successful access
  logRequest(req, 200, ip);

  // Pass rate-limit headers to next response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', rateLimit.limit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  return response;
}

export const config = {
  matcher: [
    '/api/customers/:path*',
    '/api/metrics/:path*',
    '/api/drift/:path*',
    '/api/retrain/:path*',
    '/api/analytics/:path*',
    '/api/insights/:path*',
    '/api/predictions/:path*',
    '/api/settings/:path*',
  ],
};
