// Bank/card transaction normalization, dedupe and expense suggestions.
//
// This is the provider-agnostic core of the financial integration: every adapter
// (the demo stub today, Plaid/Tink/Belvo later) hands raw bank rows in, and this
// module turns them into the SAME FinancialTransaction shape — normalized sign,
// currency and date, a symmetric dedupe fingerprint, an expense-category
// suggestion and a gathering suggestion. Nothing here writes to the database and
// nothing here creates an Expense: suggestions only.

export const EXPENSE_CATEGORIES = ['food', 'lodging', 'transport', 'activities', 'other'] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const TX_STATUSES = ['pending', 'posted'] as const;
export const REVIEW_STATUSES = ['new', 'suggested', 'linked', 'ignored'] as const;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCurrency(value: unknown, fallback = 'USD') {
  const raw = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : fallback;
}

// Amounts arrive as numbers, "1.234,56", "$1,234.56", "(42.00)" or "-42,00".
// The magnitude is returned positive and the sign becomes `direction`, so a
// debit can never be stored as a negative expense amount by accident.
export function normalizeAmount(value: unknown): { amount: number; direction: 'debit' | 'credit' } | null {
  if (value === null || value === undefined || value === '') return null;
  let raw = typeof value === 'number' ? String(value) : text(value);
  if (!raw) return null;

  let negative = false;
  if (/^\(.*\)$/.test(raw)) { negative = true; raw = raw.slice(1, -1); }
  if (raw.includes('-')) negative = true;
  raw = raw.replace(/[^0-9.,]/g, '');
  if (!raw) return null;

  // Decide which separator is decimal: whichever appears last.
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  if (lastComma > lastDot) {
    // 1.234,56 -> drop thousands dots, comma is decimal
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else {
    raw = raw.replace(/,/g, '');
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const amount = Math.round(Math.abs(parsed) * 100) / 100;
  if (amount === 0) return null;
  return { amount, direction: negative ? 'debit' : 'credit' };
}

// Accepts an ISO instant, an ISO date or MM/DD/YYYY (bank export style).
export function normalizeOccurredAt(value: unknown): { occurred_at: string; date: string } | null {
  const raw = text(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const iso = `${raw}T12:00:00.000Z`;
    if (!Number.isFinite(Date.parse(iso))) return null;
    return { occurred_at: iso, date: raw };
  }

  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const iso = `${date}T12:00:00.000Z`;
    if (!Number.isFinite(Date.parse(iso))) return null;
    return { occurred_at: iso, date };
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  const iso = new Date(parsed).toISOString();
  return { occurred_at: iso, date: iso.slice(0, 10) };
}

export function normalizeStatus(value: unknown): 'pending' | 'posted' {
  return text(value).toLowerCase() === 'pending' ? 'pending' : 'posted';
}

// Bank descriptors are SHOUTED and padded with noise ("UBER   *TRIP 4X2K").
export function normalizeMerchant(merchant: unknown, description: unknown) {
  const explicit = text(merchant);
  if (explicit) return explicit;
  const desc = text(description);
  if (!desc) return '';
  const cleaned = desc
    .replace(/\b[A-Z0-9]{6,}\b/g, '')
    .replace(/[*#]+\s*\S*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const candidate = cleaned || desc;
  return candidate
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function fingerprintPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
}

// Symmetric dedupe key: same provider shape (even across different provider ids),
// same date, same magnitude, same currency and same merchant collides.
export function buildTransactionFingerprint(input: {
  provider: string; date: string; amount: number; currency: string; merchant: string;
}) {
  const parts = [
    text(input.provider) || 'unknown',
    input.date,
    input.amount.toFixed(2),
    normalizeCurrency(input.currency),
    fingerprintPart(input.merchant || ''),
  ];
  return parts.join('|');
}

// --- category suggestion ----------------------------------------------------
// Rule-based and deterministic: merchant/description keywords first (they are
// the strongest signal), then the provider's own category code as support.
// Codes are returned so the suggestion stays explainable in the UI.

const KEYWORDS: Record<ExpenseCategory, string[]> = {
  food: ['restaurant', 'restaurante', 'cafe', 'coffee', 'bakery', 'padaria', 'bar', 'pizza', 'trattoria', 'osteria', 'kitchen', 'burger', 'sushi', 'diner', 'bistro', 'gelato', 'starbucks', 'mcdonald', 'ifood', 'uber eats', 'doordash', 'grubhub', 'brasserie', 'taverna', 'mercado', 'market', 'supermarket'],
  lodging: ['hotel', 'hostel', 'airbnb', 'booking', 'pousada', 'resort', 'inn', 'suites', 'lodge', 'apart', 'vrbo', 'expedia'],
  transport: ['uber', 'lyft', 'taxi', 'cab', 'metro', 'subway', 'transit', 'train', 'rail', 'trenitalia', 'amtrak', 'bus', 'fuel', 'gas', 'shell', 'petrobras', 'parking', 'estacionamento', 'rental', 'hertz', 'avis', 'easyjet', 'ryanair', 'latam', 'american airlines', 'delta', 'united', 'tap ', 'airline', 'airport', 'aeroporto', 'toll', 'pedagio'],
  activities: ['museum', 'museu', 'tour', 'ticket', 'ingresso', 'cinema', 'theatre', 'theater', 'concert', 'show', 'gallery', 'galeria', 'park', 'parque', 'zoo', 'spa', 'dive', 'surf'],
  other: [],
};

const RAW_CATEGORY_MAP: Record<string, ExpenseCategory> = {
  FOOD_AND_DRINK: 'food',
  RESTAURANTS: 'food',
  GROCERIES: 'food',
  TRAVEL: 'transport',
  TRANSPORTATION: 'transport',
  LODGING: 'lodging',
  HOTELS: 'lodging',
  ENTERTAINMENT: 'activities',
  RECREATION: 'activities',
};

export function categorizeTransaction(input: {
  merchant?: unknown; description?: unknown; raw_category?: unknown;
}): { category: ExpenseCategory; confidence: number; signals: string[] } {
  const haystack = `${text(input.merchant)} ${text(input.description)}`.toLowerCase();
  const signals: string[] = [];
  let best: ExpenseCategory = 'other';
  let bestHits = 0;

  for (const category of EXPENSE_CATEGORIES) {
    if (category === 'other') continue;
    const hits = KEYWORDS[category].filter((kw) => haystack.includes(kw)).length;
    if (hits > bestHits) { bestHits = hits; best = category; }
  }
  if (bestHits > 0) signals.push(`merchant_${best}`);

  const raw = text(input.raw_category).toUpperCase();
  const mapped = RAW_CATEGORY_MAP[raw];
  if (mapped && mapped !== best) {
    if (bestHits === 0) { best = mapped; signals.push(`raw_category_${mapped}`); }
    else if (mapped === best) signals.push(`raw_category_${mapped}`);
  } else if (mapped && mapped === best) {
    signals.push(`raw_category_${mapped}`);
  }

  if (!signals.length) return { category: 'other', confidence: 0.2, signals: ['no_signal'] };

  // Two independent signals agreeing is the strongest case.
  const confidence = signals.some((s) => s.startsWith('raw_category_')) && signals.some((s) => s.startsWith('merchant_'))
    ? 0.95
    : 0.7;
  return { category: best, confidence, signals };
}

// --- gathering suggestion ---------------------------------------------------

export type GatheringRange = {
  gathering_id: string;
  name?: string;
  first_date?: string;   // YYYY-MM-DD
  last_date?: string;
  item_dates?: string[]; // YYYY-MM-DD of each segment start
};

function daysBetween(a: string, b: string) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.round(Math.abs(da - db) / 86400000);
}

// Picks the gathering whose itinerary best contains the transaction date.
// Suggestions only: the user always confirms before an expense is written.
export function suggestGatheringForDate(date: string, ranges: GatheringRange[]) {
  let best: { gathering_id: string; confidence: number; reason: string } | null = null;
  for (const range of ranges || []) {
    if (!range?.gathering_id || !range.first_date || !range.last_date) continue;
    const inside = date >= range.first_date && date <= range.last_date;
    const nearestItem = (range.item_dates || []).reduce((min, d) => Math.min(min, daysBetween(date, d)), Number.POSITIVE_INFINITY);
    const edgeDistance = Math.min(daysBetween(date, range.first_date), daysBetween(date, range.last_date));

    let confidence = 0;
    let reason = 'no_signal';
    if (inside && nearestItem <= 1) { confidence = 0.85; reason = 'date_near_item'; }
    else if (inside) { confidence = 0.7; reason = 'date_in_range'; }
    else if (edgeDistance <= 3) { confidence = 0.5; reason = 'date_near_trip'; }
    else if (edgeDistance <= 14) { confidence = 0.3; reason = 'date_near_trip'; }
    if (confidence === 0) continue;

    if (!best || confidence > best.confidence) {
      best = { gathering_id: range.gathering_id, confidence, reason };
    }
  }
  return best;
}

// One raw provider row -> the canonical transaction shape (still unsaved).
export function normalizeTransaction(raw: any, ctx: { provider: string; currency: string }) {
  const money = normalizeAmount(raw?.amount);
  if (!money) return { error: 'invalid_amount' as const };
  const when = normalizeOccurredAt(raw?.occurred_at || raw?.date);
  if (!when) return { error: 'invalid_date' as const };

  const currency = normalizeCurrency(raw?.currency || ctx.currency, ctx.currency || 'USD');
  const merchant = normalizeMerchant(raw?.merchant, raw?.description);
  const suggestion = categorizeTransaction({ merchant, description: raw?.description, raw_category: raw?.raw_category });

  return {
    transaction: {
      external_id: text(raw?.external_id || raw?.id),
      fingerprint: buildTransactionFingerprint({ provider: ctx.provider, date: when.date, amount: money.amount, currency, merchant }),
      occurred_at: when.occurred_at,
      date: when.date,
      description: text(raw?.description),
      merchant,
      raw_category: text(raw?.raw_category),
      currency,
      amount: money.amount,
      direction: money.direction,
      status: normalizeStatus(raw?.status),
      category_suggestion: suggestion.category,
      category_confidence: suggestion.confidence,
      category_signals: suggestion.signals,
    },
  };
}