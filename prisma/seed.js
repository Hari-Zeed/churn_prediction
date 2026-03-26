const { PrismaClient } = require('../lib/generated/prisma');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

async function seed() {
  const dbPath = path.join(process.cwd(), 'dev.db');
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
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
