import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Returns the latest USD-based exchange rate table from Open Exchange Rates.
// Reuses OPENEXCHANGERATES_APP_ID (same source as convertCurrency).
// Rates are cached in-memory for 1 hour per warm instance.
let ratesCache = null; // { base, rates, asOf, fetchedAt }
const CACHE_MS = 60 * 60 * 1000;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const appId = secrets.get('OPENEXCHANGERATES_APP_ID');
    if (!appId) return Response.json({ error: 'Open Exchange Rates app id (OPENEXCHANGERATES_APP_ID) not configured' }, { status: 500 });

    const now = Date.now();
    if (ratesCache && (now - ratesCache.fetchedAt) < CACHE_MS) {
      return Response.json({
        base: ratesCache.base,
        rates: ratesCache.rates,
        as_of: ratesCache.asOf,
        fetched_at: ratesCache.fetchedAt,
      });
    }

    const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open Exchange Rates failed (${res.status})`);
    const data = await res.json();
    ratesCache = {
      base: data.base || 'USD',
      rates: data.rates || {},
      asOf: data.timestamp ? data.timestamp * 1000 : now,
      fetchedAt: now,
    };
    return Response.json({
      base: ratesCache.base,
      rates: ratesCache.rates,
      as_of: ratesCache.asOf,
      fetched_at: ratesCache.fetchedAt,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}