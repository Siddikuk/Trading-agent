import { NextResponse } from 'next/server';

// ==================== NEWS FEEDS ====================
// Uses free RSS feeds from major financial news sources.
// No z-ai-web-dev-sdk needed — works on any server including Vercel.

interface NewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date: string;
  reliability: string;
}

// High-quality financial news RSS feeds
const RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters', reliability: 'HIGH' },
  { url: 'https://feeds.bbc.co.uk/news/business/rss.xml', source: 'BBC News', reliability: 'HIGH' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', source: 'NY Times', reliability: 'HIGH' },
  { url: 'https://feeds.feedburner.com/Marketwatch/stockmarketnews', source: 'MarketWatch', reliability: 'HIGH' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC', reliability: 'HIGH' },
  { url: 'https://www.forexlive.com/feed', source: 'ForexLive', reliability: 'HIGH' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com', reliability: 'HIGH' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=EURUSD=X&region=US&lang=en-US', source: 'Yahoo Finance', reliability: 'MEDIUM' },
];

// Free RSS-to-JSON proxy (no API key needed)
const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json';

async function fetchRSSFeed(feedUrl: string, source: string, reliability: string): Promise<NewsItem[]> {
  try {
    const url = `${RSS2JSON_API}?rss_url=${encodeURIComponent(feedUrl)}&count=10`;
    const res = await fetch(url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
      headers: { 'User-Agent': 'TradingAgent/1.0' },
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (data.status !== 'ok' || !data.items) return [];

    return data.items.map((item: Record<string, unknown>) => ({
      title: String(item.title || '').trim(),
      url: String(item.link || ''),
      snippet: String(item.description || '')
        .replace(/<[^>]*>/g, '') // Strip HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
        .slice(0, 300),
      source,
      date: item.pubDate ? new Date(String(item.pubDate)).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }) : '',
      reliability,
    })).filter((item: NewsItem) => item.title.length > 10 && item.url.length > 10);
  } catch (err) {
    console.error(`[News] Feed error (${source}):`, String(err));
    return [];
  }
}

// Filter out irrelevant news for forex/currency traders
function isRelevant(title: string, snippet: string): boolean {
  const combined = `${title} ${snippet}`.toLowerCase();

  // Definitely relevant keywords
  const relevantKeywords = [
    'forex', 'currency', 'currenc', 'dollar', 'euro', 'yen', 'pound', 'sterling',
    'federal reserve', 'fed ', 'ecb', 'bank of japan', 'boj', 'bank of england', 'boe',
    'interest rate', 'rates', 'inflation', 'gdp', 'central bank', 'monetary policy',
    'tariff', 'trade war', 'sanctions', 'geopolitic', 'market', 'stock', 'bond',
    'gold', 'oil', 'commodit', 'bitcoin', 'crypto', 'economy', 'economic',
    'usd', 'eur', 'gbp', 'jpy', 'aud', 'cad', 'chf', 'nzd',
    'treasury', 'fomc', 'employment', 'jobs report', 'cpi', 'ppi',
    'exchange rate', 'foreign exchange',
  ];

  // Definitely irrelevant keywords
  const irrelevantKeywords = [
    'celebrity', 'entertainment', 'sports', 'football', 'soccer', 'basketball',
    'recipe', 'travel', 'hotel', 'restaurant', 'movie', 'film', 'tv show',
    'pinterest', 'tripadvisor', 'amazon prime', 'netflix', 'spotify',
    'what to watch', 'best movies', 'deals of the day', 'coupon',
  ];

  // Reject irrelevant content first
  if (irrelevantKeywords.some(k => combined.includes(k))) return false;

  // Accept if any relevant keyword matches
  return relevantKeywords.some(k => combined.includes(k));
}

// ==================== ENDPOINT ====================
export async function GET() {
  try {
    // Fetch top 4 feeds in parallel (enough for good coverage, not too slow)
    const [reuters, bbc, marketwatch, forexlive] = await Promise.all([
      fetchRSSFeed(RSS_FEEDS[0].url, RSS_FEEDS[0].source, RSS_FEEDS[0].reliability),
      fetchRSSFeed(RSS_FEEDS[1].url, RSS_FEEDS[1].source, RSS_FEEDS[1].reliability),
      fetchRSSFeed(RSS_FEEDS[3].url, RSS_FEEDS[3].source, RSS_FEEDS[3].reliability),
      fetchRSSFeed(RSS_FEEDS[5].url, RSS_FEEDS[5].source, RSS_FEEDS[5].reliability),
    ]);

    // Also try CNBC and Investing.com in background (don't block on them)
    const [cnbc, investing] = await Promise.all([
      fetchRSSFeed(RSS_FEEDS[4].url, RSS_FEEDS[4].source, RSS_FEEDS[4].reliability),
      fetchRSSFeed(RSS_FEEDS[6].url, RSS_FEEDS[6].source, RSS_FEEDS[6].reliability),
    ]);

    const allNews = [...reuters, ...bbc, ...marketwatch, ...forexlive, ...cnbc, ...investing];

    console.log(`[News API] Fetched: Reuters(${reuters.length}) BBC(${bbc.length}) MW(${marketwatch.length}) FL(${forexlive.length}) CNBC(${cnbc.length}) Inv(${investing.length})`);

    // Sort by date (newest first)
    allNews.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

    // Deduplicate by title similarity
    const seen = new Set<string>();
    const deduped = allNews.filter(item => {
      const key = item.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply relevance filter — but keep some general market news too
    const relevant = deduped.filter(item => isRelevant(item.title, item.snippet));
    const general = deduped.filter(item => !isRelevant(item.title, item.snippet)).slice(0, 5);

    // Mix: all relevant first, then some general market news
    const final = [...relevant, ...general].slice(0, 20);

    console.log(`[News API] Total: ${allNews.length}, Deduped: ${deduped.length}, Relevant: ${relevant.length}, Final: ${final.length}`);

    return NextResponse.json({
      results: final,
      fetchedAt: new Date().toISOString(),
      _debug: {
        totalRaw: allNews.length,
        totalFiltered: final.length,
        feeds: {
          reuters: reuters.length,
          bbc: bbc.length,
          marketwatch: marketwatch.length,
          forexlive: forexlive.length,
          cnbc: cnbc.length,
          investing: investing.length,
        },
      },
    });
  } catch (error) {
    console.error('[News API] Error:', error);
    return NextResponse.json({
      error: String(error),
      results: [],
      _debug: { errorPhase: 'fetch', error: String(error) },
    }, { status: 500 });
  }
}
