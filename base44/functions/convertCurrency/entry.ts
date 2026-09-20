import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Currency conversion via Open Exchange Rates. Uses OPENEXCHANGERATES_APP_ID.
// Rates are cached in-memory for 1 hour (per warm instance).
let ratesCache = null; // { rates, fetchedAt }
const CACHE_MS = 60 * 60 * 1000;

async function getUsdRates(appId) {
  const now = Date.now();
  if (ratesCache && (now - ratesCache.fetchedAt) < CACHE_MS) return ratesCache.rates;
  const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open Exchange Rates failed (${res.status})`);
  }
  const data = await res.json();
  ratesCache = { rates: data.rates || {}, fetchedAt: now };
  return ratesCache.rates;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    const to = (body.to || 'USD').toUpperCase();
    if (!items.length) return Response.json({ error: 'items required: [{amount, currency}]' }, { status: 400 });

    const appId = secrets.get('OPENEXCHANGERATES_APP_ID');
    if (!appId) return Response.json({ error: 'Open Exchange Rates app id (OPENEXCHANGERATES_APP_ID) not configured' }, { status: 500 });

    const rates = await getUsdRates(appId);
    const fromRate = (c) => (c === 'USD' ? 1 : rates[c]);
    if (!fromRate(to)) return Response.json({ error: `Unknown target currency: ${to}` }, { status: 400 });

    let total = 0;
    const details = items.map((it) => {
      const cur = (it.currency || 'USD').toUpperCase();
      const fr = fromRate(cur);
      if (!fr) return { amount: it.amount, currency: cur, converted: 0, skipped: true };
      const converted = (Number(it.amount || 0) / fr) * fromRate(to);
      total += converted;
      return { amount: Number(it.amount || 0), currency: cur, converted: Math.round(converted * 100) / 100 };
    });

    return Response.json({
      to,
      rate: fromRate(to),
      total: Math.round(total * 100) / 100,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}