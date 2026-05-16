// Curated Sharia-compliant universe for a UK Trading 212 ISA.
//
// Compliance sources cross-referenced: Wahed FTSE Shariah methodology,
// AAOIFI standards, Zoya screener, IslamicFinanceGuru reviews, and the
// official MSCI Islamic index constituents (for the ETFs).
//
// "certified" = the asset itself is an Islamic-index ETF or a stock that
//   sits inside one or more major Islamic indices today.
// "screened"  = passes the standard quantitative screens (debt/assets,
//   interest income, cash+receivables) but the user should re-verify
//   periodically — compliance can drift each quarter.
//
// None of this is financial advice. Halal status is the user's
// responsibility — these are starting points, not fatwas.

export type HalalStatus = 'certified' | 'screened';
export type Currency = 'GBP' | 'GBp' | 'USD';

export interface HalalAsset {
  yahoo: string;         // Yahoo Finance symbol
  ticker: string;        // ticker shown in Trading 212
  name: string;
  type: 'ETF' | 'STOCK';
  sector: string;
  currency: Currency;    // pricing currency on the feed
  isaEligible: boolean;  // confirmed eligible inside a UK ISA via Trading 212
  status: HalalStatus;
  note: string;          // short reason for inclusion / what to know
}

// Pricing currency note: London-listed equities/ETFs quote in GBp
// (pence) on Yahoo with the .L suffix; divide by 100 to get GBP.
// US-listed stocks quote in USD and need GBP/USD conversion.

export const HALAL_UNIVERSE: HalalAsset[] = [
  // === Sharia-certified UCITS ETFs — native GBP, ISA-perfect ===
  {
    yahoo: 'ISDU.L',
    ticker: 'ISDU',
    name: 'iShares MSCI USA Islamic UCITS ETF',
    type: 'ETF',
    sector: 'US Broad Market (Sharia)',
    // LSE-listed but the iShares USD share class — quotes in USD.
    // (Trading 212 still settles you in GBP via FX on the ISA.)
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'Diversified US Sharia index — the safest "core" holding for an ISA.',
  },
  {
    yahoo: 'ISWD.L',
    ticker: 'ISWD',
    name: 'iShares MSCI World Islamic UCITS ETF',
    type: 'ETF',
    sector: 'Global Developed (Sharia)',
    // LSE GBP share class — quotes in pence (GBp).
    currency: 'GBp',
    isaEligible: true,
    status: 'certified',
    note: 'Global developed-market Sharia index. Lower volatility than US-only.',
  },
  {
    yahoo: 'ISDE.L',
    ticker: 'ISDE',
    name: 'iShares MSCI EM Islamic UCITS ETF',
    type: 'ETF',
    sector: 'Emerging Markets (Sharia)',
    // LSE-listed USD share class — quotes in USD despite the .L suffix.
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'Emerging-market Sharia exposure — higher growth, higher swings.',
  },

  // === Sharia-screened US large caps (held by MSCI Islamic indices today) ===
  {
    yahoo: 'AAPL',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    type: 'STOCK',
    sector: 'Tech — Hardware',
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'Top constituent of every major Islamic index. Low debt for its size.',
  },
  {
    yahoo: 'MSFT',
    ticker: 'MSFT',
    name: 'Microsoft Corp.',
    type: 'STOCK',
    sector: 'Tech — Software',
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'Sits in MSCI USA Islamic. Cloud + AI growth, strong balance sheet.',
  },
  {
    yahoo: 'GOOGL',
    ticker: 'GOOGL',
    name: 'Alphabet Inc. (Class A)',
    type: 'STOCK',
    sector: 'Tech — Internet',
    currency: 'USD',
    isaEligible: true,
    status: 'screened',
    note: 'Ad-revenue model — some scholars require purification of dividends.',
  },
  {
    yahoo: 'NVDA',
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    type: 'STOCK',
    sector: 'Tech — Semiconductors',
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'Sharia-screened and inside MSCI USA Islamic. AI super-cycle leader.',
  },
  {
    yahoo: 'AVGO',
    ticker: 'AVGO',
    name: 'Broadcom Inc.',
    type: 'STOCK',
    sector: 'Tech — Semiconductors',
    currency: 'USD',
    isaEligible: true,
    status: 'screened',
    note: 'Verify debt ratio quarterly — it sits near the screen threshold.',
  },
  {
    yahoo: 'ASML',
    ticker: 'ASML',
    name: 'ASML Holding N.V.',
    type: 'STOCK',
    sector: 'Tech — Semi Equipment',
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'EUV lithography monopoly. Low debt, screened compliant.',
  },
  {
    yahoo: 'ADBE',
    ticker: 'ADBE',
    name: 'Adobe Inc.',
    type: 'STOCK',
    sector: 'Tech — Software',
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'SaaS model, almost no debt, classic halal tech holding.',
  },
  {
    yahoo: 'TSM',
    ticker: 'TSM',
    name: 'Taiwan Semiconductor (ADR)',
    type: 'STOCK',
    sector: 'Tech — Semiconductors',
    currency: 'USD',
    isaEligible: true,
    status: 'certified',
    note: 'Foundry leader. ADR — eligible in T212 ISA.',
  },
  {
    yahoo: 'LIN',
    ticker: 'LIN',
    name: 'Linde plc',
    type: 'STOCK',
    sector: 'Industrials — Gases',
    currency: 'USD',
    isaEligible: true,
    status: 'screened',
    note: 'Industrial gases — defensive halal pick outside tech.',
  },
];

export function findAsset(yahoo: string): HalalAsset | undefined {
  return HALAL_UNIVERSE.find(a => a.yahoo === yahoo);
}

// Convert a raw Yahoo price into GBP for a UK ISA holder.
// `currency` is Yahoo's reported quote currency — DO NOT trust the
// HalalAsset.currency hint, since LSE-listed iShares Sharia ETFs quote
// in USD even though they have `.L` suffixes.
// gbpPerUsd is GBP per 1 USD (e.g. 0.79 means 1 USD = £0.79).
export function priceToGBP(price: number, currency: string, gbpPerUsd: number): number {
  // GBp (pence) check uses the raw string — UPPERCASE would lose the
  // distinction from GBP. GBX is the alternate code for pence.
  if (currency === 'GBp' || currency === 'GBX') return price / 100;
  const c = currency.toUpperCase();
  if (c === 'GBP') return price;
  if (c === 'USD') return price * gbpPerUsd;
  // Unknown currency — assume already in GBP rather than silently mis-scaling.
  return price;
}
