import { NextRequest, NextResponse } from 'next/server';
import { buildUsageReport, isUsageAdmin } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!isUsageAdmin(request)) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: '管理 Token 不正确。请确认输入的是 Vercel 环境变量 ADMIN_USAGE_TOKEN 的值。',
        },
        { status: 401 }
      );
    }

    const days = Number(request.nextUrl.searchParams.get('days') || '30');
    const limit = Number(request.nextUrl.searchParams.get('limit') || '1000');
    const report = await buildUsageReport({ days, limit });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Failed to build usage report:', error);

    return NextResponse.json(
      {
        error: 'Usage report failed',
        message:
          error instanceof Error
            ? error.message
            : '无法读取监控数据。请检查 Supabase 环境变量、usage_events 表和 service_role key。',
      },
      { status: 500 }
    );
  }
}
