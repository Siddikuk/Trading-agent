import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const alerts = await db.priceAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ alerts });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, condition, price } = body;

    if (!symbol || !condition || !price) {
      return NextResponse.json({ error: 'symbol, condition, and price are required' }, { status: 400 });
    }

    const validConditions = ['ABOVE', 'BELOW', 'CROSSES_ABOVE', 'CROSSES_BELOW'];
    if (!validConditions.includes(condition)) {
      return NextResponse.json({ error: `Invalid condition. Must be one of: ${validConditions.join(', ')}` }, { status: 400 });
    }

    const alert = await db.priceAlert.create({
      data: {
        symbol,
        condition,
        price: parseFloat(price),
        isActive: true,
      },
    });

    return NextResponse.json({ alert, success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await db.priceAlert.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
