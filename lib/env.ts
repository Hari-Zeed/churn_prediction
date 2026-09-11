/**
 * lib/env.ts
 * ----------
 * Startup environment variable validator.
 * Import this ONCE at the top of any server-side entry point (lib/prisma.ts, lib/auth.ts).
 * Throws a hard error at boot if critical vars are missing — prevents silent misconfiguration.
 */

const REQUIRED_SERVER_VARS: { key: string; description: string }[] = [
  { key: 'NEXTAUTH_SECRET', description: 'NextAuth JWT signing secret (run: openssl rand -base64 32)' },
];

// At least one DB connection string must be present
const DB_VARS = ['TURSO_DATABASE_URL', 'DATABASE_URL'];

function validateEnv(): void {
  // Skip in browser / client bundle context
  if (typeof window !== 'undefined') return;

  const missing: string[] = [];

  for (const { key, description } of REQUIRED_SERVER_VARS) {
    const val = process.env[key];
    if (!val || val.trim() === '' || val.startsWith('generate_')) {
      missing.push(`  ❌ ${key} — ${description}`);
    }
  }

  const hasDb = DB_VARS.some((k) => {
    const v = process.env[k];
    return v && v.trim() !== '';
  });
  if (!hasDb) {
    missing.push(`  ❌ DATABASE_URL or TURSO_DATABASE_URL — Prisma database connection string`);
  }

  if (missing.length > 0) {
    throw new Error(
      `\n\n🔴 MISSING REQUIRED ENVIRONMENT VARIABLES:\n${missing.join('\n')}\n\n` +
        `Copy .env.example to .env.local and fill in the values.\n`
    );
  }
}

// Run immediately at module load (server-side only)
validateEnv();

export { validateEnv };
