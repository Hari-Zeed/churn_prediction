import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email || 'demo@datasync.app';

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ensure profile exists
    let profile = user.profile;
    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          userId: user.id,
          firstName: user.name?.split(' ')[0] || 'Demo',
          lastName: user.name?.split(' ').slice(1).join(' ') || 'User',
          phone: '',
          title: 'Admin',
          department: '',
          twoFactor: false,
        },
      });
    }

    // Ensure system settings exist
    let systemSettings = await prisma.systemSettings.findUnique({
      where: { id: 'global' },
    });

    if (!systemSettings) {
      systemSettings = await prisma.systemSettings.create({
        data: {
          id: 'global',
          theme: 'dark',
          confidenceThreshold: 0.75,
          autoTrainEnabled: true,
          dataRefreshInterval: '24h',
        },
      });
    }

    return NextResponse.json({
      user: {
        email: user.email,
        name: user.name,
      },
      profile,
      settings: systemSettings,
    });
  } catch (error: any) {
    console.error('Settings GET Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
