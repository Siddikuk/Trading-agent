import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const trade = await db.trade.findUnique({ where: { id } });
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    return NextResponse.json({ trade });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { exitPrice, status, pnl } = body;

    const trade = await db.trade.update({
      where: { id },
      data: {
        ...(exitPrice !== undefined && { exitPrice: parseFloat(exitPrice) }),
        ...(status !== undefined && { status }),
        ...(pnl !== undefined && { pnl: parseFloat(pnl) }),
        ...(status === 'CLOSED' && { closeTime: new Date() }),
      },
    });

    return NextResponse.json({ trade });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.trade.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
