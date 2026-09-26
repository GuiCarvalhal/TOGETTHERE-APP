// Shared Open Exchange Rates (USD-based) helpers for expense currency
// conversion. Used by convertCurrency, createExpense and updateExpense so the
// rate fetch + conversion logic lives in one place. Rates are cached in-memory
// for 1 hour per warm instance. Uses OPENEXCHANGERATES_APP_ID (no new provider).

let ratesCache: { rates: Record<string, number>; fetchedAt: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

// Fetch the latest USD-based rate table (Open Exchange Rates), cached 1h.
export async function fetchUsdRates(appId: string): Promise<Record<string, number>> {
  const now = Date.now();
  if (ratesCache && (now - ratesCache.fetchedAt) < CACHE_MS) return ratesCache.rates;
  const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Exchange Rates failed (${res.status})`);
  const data = await res.json();
  ratesCache = { rates: data.rates || {}, fetchedAt: now };
  return ratesCache.rates;
}

// USD-based rate for a currency (USD -> currency). USD itself is 1. Returns
// undefined when the currency is unknown so callers can fall back gracefully.
export function usdRate(rates: Record<string, number>, currency: string): number | undefined {
  const c = String(currency || 'USD').toUpperCase();
  return c === 'USD' ? 1 : rates[c];
}

// Convert amount from `fromCurrency` to `toCurrency` via USD. Returns null if a
// required rate is missing (caller falls back gracefully). This is the single
// conversion path used both at save time (snapshot) and at render fallback.
export function convertViaUsd(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): number | null {
  const rFrom = usdRate(rates, fromCurrency);
  const rTo = usdRate(rates, toCurrency);
  if (rFrom == null || rTo == null) return null;
  return (Number(amount || 0) / rFrom) * rTo;
}