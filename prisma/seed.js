const { PrismaClient } = require('../lib/generated/prisma');
const { PrismaLibSql } = require('@prisma/adapter-libsql');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

async function seed() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./dev.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;

  const libsql = createClient({ url, authToken });
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  const email = 'demo@datasync.app';
  const password = 'Demo@1234';
  const name = 'Hari';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('✅ Demo user already exists:', email);
    await prisma.$disconnect();
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name, email, password: hashed },
  });

  console.log('✅ Demo user created!');
  console.log('   Email:   ', email);
  console.log('   Password:', password);

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
