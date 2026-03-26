import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email || 'demo@datasync.app';

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await req.json();

    // Update UserProfile
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        title: data.title,
        department: data.department,
        twoFactor: data.twoFactor,
      },
      create: {
        userId: user.id,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phone: data.phone || '',
        title: data.title || '',
        department: data.department || '',
        twoFactor: data.twoFactor || false,
      },
    });

    // Update User email/name 
    if (data.email) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          email: data.email,
          name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        },
      });
    }

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    console.error('Profile PUT Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
