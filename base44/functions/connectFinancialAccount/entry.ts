import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizeCurrency } from '../../shared/financialTransactions.ts';

// Connects a financial account to the current user.
//
// Foundation rules:
//  - Only the last 4 digits are kept (`account_mask`); a full account or card
//    number is never requested, accepted or stored.
//  - No credential is written by this phase. `demo` is the stub provider; a real
//    provider will hand back an opaque item reference, with its access token
//    living in the app's encrypted credential store, never in clear on the row.
//  - Idempotent: reconnecting the same account (same provider + mask) updates the
//    existing row instead of creating a duplicate.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || 'demo').toLowerCase();
    const supported = ['demo', 'plaid', 'tink', 'belvo'];
    if (!supported.includes(provider)) {
      return Response.json({ error: 'Unsupported provider', reason: 'unsupported_provider' }, { status: 400 });
    }

    const mask = String(body.account_mask || '').replace(/\D/g, '').slice(-4);
    if (mask.length !== 4) {
      return Response.json({ error: 'Enter the last 4 digits of the account', reason: 'invalid_account_mask' }, { status: 400 });
    }

    const institution = String(body.institution_name || '').trim().slice(0, 80);
    if (!institution) {
      return Response.json({ error: 'Enter the bank or card name', reason: 'missing_institution' }, { status: 400 });
    }

    const accountType = ['checking', 'savings', 'credit'].includes(body.account_type) ? body.account_type : 'checking';
    const currency = normalizeCurrency(body.currency, 'USD');
    const keys = [user.id, String(user.email || '').toLowerCase()].filter(Boolean);

    const existing = await base44.asServiceRole.entities.FinancialConnection.filter({
      target_user_id: user.id, provider, account_mask: mask,
    });

    const payload = {
      provider,
      institution_name: institution,
      account_mask: mask,
      account_type: accountType,
      currency,
      status: 'connected',
      target_user_id: user.id,
      target_user_email: user.email || '',
      target_user_keys: keys,
      last_error: '',
      disabled_at: undefined,
    };

    let connection;
    if (existing && existing[0]) {
      connection = await base44.asServiceRole.entities.FinancialConnection.update(existing[0].id, payload);
    } else {
      connection = await base44.asServiceRole.entities.FinancialConnection.create({
        ...payload,
        connected_at: new Date().toISOString(),
      });
    }

    return Response.json({
      connection: {
        id: connection.id,
        provider: connection.provider,
        institution_name: connection.institution_name,
        account_mask: connection.account_mask,
        account_type: connection.account_type,
        currency: connection.currency,
        status: connection.status,
        last_sync_at: connection.last_sync_at || null,
        last_error: connection.last_error || '',
      },
      reused: !!(existing && existing[0]),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}