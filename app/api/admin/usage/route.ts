import { NextRequest, NextResponse } from 'next/server';
import { buildUsageReport, isUsageAdmin } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isUsageAdmin(request)) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Set ADMIN_USAGE_TOKEN in .env.local and pass it as a Bearer token or ?token= value.',
      },
      { status: 401 }
    );
  }

  const days = Number(request.nextUrl.searchParams.get('days') || '30');
  const limit = Number(request.nextUrl.searchParams.get('limit') || '1000');
  const report = await buildUsageReport({ days, limit });

  return NextResponse.json(report);
}
