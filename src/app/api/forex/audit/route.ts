import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
