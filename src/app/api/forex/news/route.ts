import { NextResponse } from 'next/server';

// ==================== NEWS FILTERING ====================
// Same quality standards as the AI agent — no YouTube, no tutorials, no ads.
// Only real market-moving news from credible financial sources.

// Blacklisted domains — broker ads, tutorials, social media, video sites
const JUNK_DOMAINS = new Set([
  'youtube.com', 'youtu.be', 'wikipedia.org', 'wikihow.com',
  'reddit.com', 'quora.com', 'pinterest.com', 'facebook.com',
  'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
  'linkedin.com', 'medium.com', '.edu', 'academia.edu',
  'study.com', 'tastyfx.com', 'tastytrade.com', 'robinhood.com',
  'webull.com', 'etoro.com', 'plus500.com', 'avatrade.com',
  'pepperstone.com', 'icmarkets.com', 'exness.com', 'xm.com',
  'forex.com', 'babypips.com', 'dailyfx.com', 'forexfactory.com',
]);

// Title keywords that indicate junk content
const JUNK_KEYWORDS = [
  'what is forex', 'what is trading', 'what is currency',
  'how to trade', 'how to start', 'how to read',
  'forex for beginners', 'forex 101', 'trading for beginners', 'trading 101',
  'learn forex', 'learn trading', 'learn to trade',
  'forex basics', 'trading basics', 'the basics',
  'forex meaning', 'forex explained', 'trading explained',
  'forex tutorial', 'trading tutorial', 'tutorial',
  'forex course', 'trading course', 'online course',
  'forex guide', 'beginner guide', 'complete guide',
  'start trading', 'open account', 'sign up', 'register now',
  'trade forex online', 'try demo', 'practice account',
  'best forex broker', 'top forex broker', 'broker review',
  'low spreads', 'award winning',
  'trade with', 'start with', 'join now', 'get started',
  'no experience', 'zero commission', 'bonus', 'promotional',
  'meaning & how', 'meaning and how', 'how it works',
  'setup explained', 'thanks for watching', 'subscribe',
  'like and subscribe', 'deepening my understanding',
  'video:', 'watch:', 'episode', 'podcast:',
];

// Tier 1 news sources — highest trust (wire services + major financial outlets)
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
  // Instant reject junk domains
  for (const junk of JUNK_DOMAINS) {
    if (h.includes(junk)) return 0;
  }
  // Tier 1 = highest trust
  for (const t1 of TIER1) {
    if (h.includes(t1)) return 90;
  }
  // Moderate financial news keywords
  const goodKeywords = ['news', 'finance', 'market', 'investing', 'stock', 'commodit', 'tradingeconomics'];
  if (goodKeywords.some(k => h.includes(k))) return 50;
  // Unknown — only accept if it looks like a real news site
  if (h.includes('.com') || h.includes('.co.uk') || h.includes('.org')) return 20;
  return 0;
}

// ==================== QUERY BUILDER ====================
// Target REAL market-moving events: central bank decisions, geopolitics,
// economic data releases, sanctions, trade wars.

function buildMarketNewsQueries(): string[] {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return [
    // Macro/geopolitical — the stuff that ACTUALLY moves currencies
    `forex currency market breaking news ${dateStr} central bank economic data`,
    `geopolitical news sanctions war trade tariff impact on currency ${dateStr}`,
    // Central bank focus
    `Federal Reserve ECB Bank of Japan interest rate monetary policy decision ${dateStr}`,
    // Economic data
    `US dollar euro yen pound inflation GDP jobs economic data release today ${dateStr}`,
  ];
}

// ==================== ENDPOINT ====================
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userQuery = searchParams.get('q');

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    // Use user query if provided and looks specific, otherwise use intelligent defaults
    const queries = (userQuery && userQuery.length > 5)
      ? [userQuery, ...buildMarketNewsQueries().slice(0, 1)]
      : buildMarketNewsQueries();

    // Fetch from multiple queries in parallel
    const allResults = await Promise.allSettled(
      queries.map(async (q) => {
        const results = await zai.functions.invoke('web_search', {
          query: q,
          num: 10,
          recency_days: 1,
        });
        return results || [];
      }),
    );

    // Flatten and parse
    const raw = allResults.flatMap(r =>
      r.status === 'fulfilled' ? r.value : [],
    ).map((r: Record<string, unknown>) => ({
      title: String(r.name || ''),
      url: String(r.url || ''),
      snippet: String(r.snippet || ''),
      source: String(r.host_name || ''),
      date: String(r.date || ''),
      score: scoreSource(String(r.host_name || '')),
    }));

    // Apply quality filters
    const filtered = raw
      .filter(item => {
        if (item.score <= 0) return false;
        if (item.title.length < 15) return false;
        if (isJunk(item.title, item.snippet)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);

    // Deduplicate by similar titles
    const seen = new Set<string>();
    const deduped = filtered.filter(item => {
      const key = item.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const final = deduped.slice(0, 10);

    return NextResponse.json({
      query: queries.join(' | '),
      totalRaw: raw.length,
      totalFiltered: final.length,
      results: final.map(({ title, url, snippet, source, date, score }) => ({
        title,
        url,
        snippet,
        source: source.replace('www.', '').split('.')[0],
        date,
        reliability: score >= 90 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
      })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
