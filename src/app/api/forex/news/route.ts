import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || 'forex market news today';

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const results = await zai.functions.invoke('web_search', {
      query,
      num: 8,
      recency_days: 1,
    });

    return NextResponse.json({
      query,
      results: (results || []).slice(0, 8).map((r: Record<string, unknown>) => ({
        title: r.name,
        url: r.url,
        snippet: r.snippet,
        date: r.date,
        source: r.host_name,
      })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
