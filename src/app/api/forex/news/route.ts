import { NextResponse } from 'next/server';

// ==================== NEWS FILTERING ====================
const JUNK_DOMAINS = new Set([
  'youtube.com', 'youtu.be', 'wikipedia.org', 'wikihow.com',
  'reddit.com', 'quora.com', 'pinterest.com', 'facebook.com',
  'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
  'linkedin.com', 'medium.com', '.edu', 'academia.edu',
  'study.com', 'tastyfx.com', 'tastytrade.com', 'robinhood.com',
  'webull.com', 'etoro.com', 'plus500.com', 'avatrade.com',
  'pepperstone.com', 'icmarkets.com', 'exness.com', 'xm.com',
  'forex.com', 'babypips.com', 'dailyfx.com', 'forexfactory.com',
  'tripadvisor.com', 'amazon.com', 'ebay.com', 'booking.com',
  'craigslist.org', 'yelp.com', 'zillow.com',
]);

const JUNK_KEYWORDS = [
  'what is forex', 'what is trading', 'what is currency',
  'how to trade', 'how to start', 'how to read',
  'forex for beginners', 'forex 101', 'trading for beginners',
  'learn forex', 'learn trading', 'forex basics', 'trading basics',
  'forex tutorial', 'trading tutorial', 'forex course', 'trading course',
  'start trading', 'open account', 'sign up', 'register now',
  'best forex broker', 'top forex broker', 'broker review',
  'zero commission', 'bonus', 'promotional',
  'thanks for watching', 'subscribe', 'like and subscribe',
  'video:', 'watch:', 'episode', 'podcast:',
  'pinterest', 'tripadvisor', 'amazon', 'booking.com',
];

const TIER1 = new Set([
  'reuters.com', 'bloomberg.com', 'cnbc.com', 'wsj.com', 'ft.com',
  'marketwatch.com', 'investing.com', 'forexlive.com', 'fxstreet.com',
  'tradingeconomics.com', 'economist.com', 'apnews.com', 'bbc.com',
  'theguardian.com', 'imf.org', 'cmegroup.com', 'cnn.com',
]);

function isJunk(title: string, snippet: string): boolean {
  const combined = `${title} ${snippet}`.toLowerCase();
  return JUNK_KEYWORDS.some(k => combined.includes(k));
}

function scoreSource(host: string): number {
  if (!host) return 0;
  const h = host.toLowerCase();
  for (const junk of JUNK_DOMAINS) { if (h.includes(junk)) return 0; }
  for (const t1 of TIER1) { if (h.includes(t1)) return 90; }
  if (/news|finance|market|investing|stock|capital|trader/.test(h)) return 50;
  if (/\.com|\.org|\.net|\.io/.test(h)) return 30;
  return 15;
}

function buildMarketNewsQueries(): string[] {
  return [
    `forex currency market breaking news today`,
    `Federal Reserve ECB interest rate decision today`,
    `US dollar euro yen inflation GDP economic data today`,
    `geopolitics sanctions trade war currency impact today`,
  ];
}

// ==================== ENDPOINT ====================
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userQuery = searchParams.get('q');
  const debug = searchParams.get('debug') === '1';

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const queries = (userQuery && userQuery.length > 3)
      ? [userQuery, ...buildMarketNewsQueries().slice(0, 1)]
      : buildMarketNewsQueries();

    // Fetch all queries in parallel
    const settled = await Promise.allSettled(
      queries.map(async (q, idx) => {
        try {
          const results = await zai.functions.invoke('web_search', {
            query: q,
            num: 10,
            recency_days: 7,
          });
          return { idx, query: q, results: results || [], status: 'ok' };
        } catch (err) {
          return { idx, query: q, results: [], status: 'error', error: String(err) };
        }
      }),
    );

    // Debug: show query-level results
    const queryDiagnostics = settled.map(s => {
      if (s.status === 'fulfilled') {
        const d = s.value;
        return { query: d.query, status: d.status, count: d.results.length, error: d.error || undefined };
      }
      return { query: 'unknown', status: 'rejected', error: String(s.reason) };
    });

    // Flatten all results
    const raw = settled.flatMap(s => {
      if (s.status !== 'fulfilled') return [];
      return s.value.results.map((r: Record<string, unknown>) => ({
        title: String(r.name || r.title || ''),
        url: String(r.url || ''),
        snippet: String(r.snippet || r.description || ''),
        source: String(r.host_name || r.domain || ''),
        date: String(r.date || ''),
        score: scoreSource(String(r.host_name || r.domain || '')),
        // Keep raw keys for debugging
        _rawKeys: Object.keys(r),
      }));
    });

    // If debug mode, return raw data before filtering
    if (debug) {
      return NextResponse.json({
        debug: true,
        queries: queryDiagnostics,
        totalRaw: raw.length,
        rawSample: raw.slice(0, 5).map(r => ({
          title: r.title,
          source: r.source,
          url: r.url,
          score: r.score,
          snippet: r.snippet?.slice(0, 100),
          rawKeys: r._rawKeys,
        })),
        filterWouldPass: raw.length,
      });
    }

    // Filter: only reject score=0 (junk domains) and actual junk titles
    const filtered = raw
      .filter(item => {
        if (item.score <= 0) return false;
        if (item.title.length < 8) return false;
        if (item.url.length < 10) return false;
        if (isJunk(item.title, item.snippet)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);

    // Deduplicate
    const seen = new Set<string>();
    const deduped = filtered.filter(item => {
      const key = item.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const final = deduped.slice(0, 15);

    // If still empty, include diagnostic info in the response
    return NextResponse.json({
      results: final.map(({ title, url, snippet, source, date, score }) => ({
        title,
        url,
        snippet,
        source: source.replace('www.', '').split('.')[0],
        date,
        reliability: score >= 90 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
      })),
      fetchedAt: new Date().toISOString(),
      // Include diagnostics so the frontend can show useful info
      _debug: {
        totalRaw: raw.length,
        totalFiltered: filtered.length,
        queries: queryDiagnostics,
        ...(final.length === 0 && raw.length > 0 ? {
          rejectedSample: raw.slice(0, 3).map(r => ({
            title: r.title,
            source: r.source,
            score: r.score,
            reason: r.score <= 0 ? 'junk domain' : r.title.length < 8 ? 'short title' : isJunk(r.title, r.snippet) ? 'junk keyword' : 'unknown',
          })),
        } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: String(error),
      results: [],
      _debug: { errorPhase: 'init', error: String(error) },
    }, { status: 500 });
  }
}
