import { NextRequest, NextResponse } from 'next/server';
import { isUsageAdmin } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return NextResponse.json({ isAdmin: isUsageAdmin(request) });
}
