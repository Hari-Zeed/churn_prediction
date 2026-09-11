import './env'; // Startup env validation — throws if critical vars are missing
import { PrismaClient } from './generated/prisma';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || 'file:./dev.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // PrismaLibSql adapter connects to Turso (libsql:// or https://) or local SQLite (file:./dev.db)
  const adapter = new PrismaLibSql({
    url,
    authToken,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
