import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email || 'demo@datasync.app';

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return NextResponse.json({ error: 'User not found or no password set' }, { status: 404 });
    }

    const data = await req.json();

    if (!data.currentPassword || !data.newPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const isCorrectPassword = await bcrypt.compare(data.currentPassword, user.password);
    if (!isCorrectPassword) {
      return NextResponse.json({ error: 'Invalid current password' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(data.newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Security settings PUT Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
