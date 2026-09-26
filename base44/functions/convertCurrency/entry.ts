import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { fetchUsdRates, usdRate } from '../../shared/currencyRates.ts';

// Currency conversion via Open Exchange Rates. Uses OPENEXCHANGERATES_APP_ID
// and the shared rate fetch (cached 1h per warm instance) so this stays in sync
// with the save-time snapshot path used by createExpense/updateExpense.
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

    const rates = await fetchUsdRates(appId);
    const toRate = usdRate(rates, to);
    if (toRate == null) return Response.json({ error: `Unknown target currency: ${to}` }, { status: 400 });

    let total = 0;
    const details = items.map((it) => {
      const cur = (it.currency || 'USD').toUpperCase();
      const fr = usdRate(rates, cur);
      if (fr == null) return { amount: it.amount, currency: cur, converted: 0, skipped: true };
      const converted = (Number(it.amount || 0) / fr) * toRate;
      total += converted;
      return { amount: Number(it.amount || 0), currency: cur, converted: Math.round(converted * 100) / 100 };
    });

    return Response.json({
      to,
      rate: toRate,
      total: Math.round(total * 100) / 100,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}