import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isUsageAdminToken } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sessionRequestSchema = z.object({ token: z.string().trim().min(1).max(512) });
const cookieName = 'usage_admin_session';

export async function POST(request: NextRequest) {
  try {
    const { token } = sessionRequestSchema.parse(await request.json());

    if (!isUsageAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = NextResponse.json({ isAdmin: true });
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/admin',
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ isAdmin: false });
  response.cookies.set(cookieName, '', { httpOnly: true, path: '/api/admin', maxAge: 0 });
  return response;
}
