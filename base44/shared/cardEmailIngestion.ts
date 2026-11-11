// Card / credit-card email ingestion for the low-cost financial path.
//
// Card issuers already email every purchase, refund and statement notice. The
// mailbox pipeline (inboxConnectors -> reservationIngestion) sees those messages
// but they are not reservations, so before this module they were classified as
// "ignored" and their content was lost.
//
// Here they are recognized with deterministic templates (no model call), turned
// into the SAME raw rows a statement export produces and pushed through the
// shared ingestion pipeline. Consequences that matter:
//   - nothing ever becomes an Expense automatically: rows land in the review
//     queue (`new`), and a suggestion is only a proposal;
//   - a purchase alert usually arrives before the charge posts, so the row is
//     stored `pending` and the statement import later UPGRADES it in place
//     (see financialIngest) instead of duplicating it;
//   - ambiguous extractions (no amount, no recognizable merchant) create nothing
//     at all and say why, so a bad parse can never reach the expense flow.

import { ingestTransactions, loadGatheringRanges } from './financialIngest.ts';
import {
  cleanDescription,
  cleanMerchantName,
  detectCurrency,
  parseAmountCell,
  resolveDateValue,
} from './statementImport.ts';

export const CARD_ALERT_ACCOUNT_NAME = 'Card alerts (email)';
const MIN_CONFIDENCE = 0.65;

// Issuers whose alert wording the templates below are modeled on. A sender match
// only raises confidence; it never replaces an amount or a merchant.
const CARD_SENDERS = [
  'chase', 'americanexpress', 'amex', 'citi', 'capitalone', 'bankofamerica',
  'wellsfargo', 'discover', 'barclays', 'revolut', 'monzo', 'nubank', 'itau',
  'bradesco', 'santander', 'c6bank', 'inter', 'hsbc', 'usbank', 'synchrony',
  'klarna', 'paypal', 'mercadopago', 'wise',
];

const PURCHASE_SIGNALS = [
  'purchase', 'compra', 'transaction alert', 'alert', 'you spent', 'you made a',
  'was charged', 'charged to', 'charge of', 'debit of', 'debito de', 'débito de',
  'authorized', 'authorised', 'autorizada', 'aprovada', 'payment of',
  'pagamento de', 'card ending',
];

const REFUND_SIGNALS = [
  'refund', 'estorno', 'reversal', 'reverted', 'devolucao', 'devolução',
  'credited back', 'was credited', 'credit of', 'credito de', 'crédito de',
];

const STATEMENT_SIGNALS = ['statement', 'fatura', 'extrato', 'bill'];

function fingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function extractAmount(haystack: string) {
  const patterns = [
    /(?:usd|brl|eur|gbp|cad|aud)\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
    /(?:R\$|US\$|\$|€|£)\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/,
    /([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*(?:usd|brl|eur|gbp|cad|aud)/i,
    /(?:amount|valor|total|charged|charge of)\s*:?\s*(?:R\$|US\$|\$|€|£)?\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i,
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (!match) continue;
    const parsed = parseAmountCell(match[1]);
    if (parsed && parsed.amount > 0) return parsed.amount;
  }
  return 0;
}

function extractMerchant(haystack: string) {
  const patterns = [
    /\bat\s+([A-Z0-9][^.,;\n]{1,60})/,
    /\bem\s+([^.,;\n]{2,60})/i,
    /\bmerchant\s*:?\s*([^.,;\n]{2,60})/i,
    /\bestabelecimento\s*:?\s*([^.,;\n]{2,60})/i,
    /\b(?:to|para)\s+([A-Z0-9][^.,;\n]{1,60})/,
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (!match) continue;
    const candidate = cleanMerchantName(match[1]);
    if (candidate.length < 2) continue;
    if (/^[\d\s:.,\-/]+$/.test(candidate)) continue;
    return candidate;
  }
  return '';
}

function extractMask(haystack: string) {
  const match = haystack.match(/(?:ending(?:\s+in)?|final|terminando em|termina em|••+|\*{2,}|x{2,}|#)\s*(\d{4})/i);
  return match ? match[1] : '';
}

function extractDate(haystack: string, receivedAt: string) {
  const match = haystack.match(/\b(?:on|em|dated|data)\s+([A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)/i);
  const fallbackYear = receivedAt && Number.isFinite(Date.parse(receivedAt))
    ? new Date(receivedAt).getUTCFullYear()
    : new Date().getUTCFullYear();
  const fromBody = match ? resolveDateValue(match[1], 'mdy', fallbackYear) : '';
  if (fromBody) return { date: fromBody, explicit: true };
  if (receivedAt && Number.isFinite(Date.parse(receivedAt))) {
    return { date: new Date(receivedAt).toISOString().slice(0, 10), explicit: false };
  }
  return { date: new Date().toISOString().slice(0, 10), explicit: false };
}

export type CardEmailExtraction = {
  kind: 'purchase' | 'refund' | 'statement' | 'none';
  confidence: number;
  signals: string[];
  reason: string;
  account_mask: string;
  currency: string;
  rows: any[];
};

export function extractCardEmail(input: {
  subject?: string;
  text?: string;
  sender?: string;
  receivedAt?: string;
  messageId?: string;
}): CardEmailExtraction {
  const subject = String(input?.subject || '');
  const body = String(input?.text || '').slice(0, 6000);
  const haystack = `${subject}\n${body}`;
  const lower = haystack.toLowerCase();
  const sender = String(input?.sender || '').toLowerCase().replace(/[^a-z0-9@.]/g, '');
  const knownSender = CARD_SENDERS.some((hint) => sender.includes(hint));

  const base = {
    confidence: 0,
    account_mask: '',
    currency: '',
    rows: [] as any[],
  };

  const refundish = REFUND_SIGNALS.some((signal) => lower.includes(signal));
  const purchaseish = PURCHASE_SIGNALS.some((signal) => lower.includes(signal));
  const statementish = STATEMENT_SIGNALS.some((signal) => lower.includes(signal))
    && /(ready|available|disponivel|disponível|due|vencimento|minimum|mínimo|minimo|fechada|fechamento|closed)/.test(lower);

  // A statement notice carries a balance, not a charge: recording it as a
  // transaction would invent an expense. It is acknowledged and dropped.
  if (statementish && !purchaseish) {
    return { ...base, kind: 'statement', signals: ['statement_notice'], reason: 'statement_notice' };
  }
  if (!purchaseish && !refundish) {
    return { ...base, kind: 'none', signals: [], reason: 'not_a_transaction' };
  }

  const kind: 'purchase' | 'refund' = refundish && !purchaseish ? 'refund' : 'purchase';
  const amount = extractAmount(haystack);
  const merchant = extractMerchant(haystack);
  const mask = extractMask(haystack);
  const { date, explicit: explicitDate } = extractDate(haystack, String(input?.receivedAt || ''));
  const currency = detectCurrency(haystack);

  const signals: string[] = [kind];
  let confidence = 0.4;
  if (amount > 0) { confidence += 0.25; signals.push('amount'); }
  if (merchant) { confidence += 0.2; signals.push('merchant'); }
  if (knownSender) { confidence += 0.1; signals.push('known_sender'); }
  if (explicitDate) { confidence += 0.05; signals.push('explicit_date'); }
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  if (!amount) {
    return { ...base, kind, confidence, signals, account_mask: mask, currency, reason: 'missing_amount' };
  }
  // Below the floor nothing is written: the message stays as an ignored import
  // (audit trail) and the user can still import the statement itself.
  if (confidence < MIN_CONFIDENCE) {
    return { ...base, kind, confidence, signals, account_mask: mask, currency, reason: 'low_confidence' };
  }

  const description = merchant || cleanDescription(subject) || cleanDescription(body).slice(0, 60);
  const direction: 'debit' | 'credit' = kind === 'refund' ? 'credit' : 'debit';
  // Alerts are usually authorizations, so they start PENDING; the statement
  // import upgrades them to POSTED in place once the charge settles.
  const settlement: 'pending' | 'posted' = /pending|pendente|authoriz|autori[sz]|processing|processando/i.test(lower)
    ? 'pending'
    : 'posted';

  const messageId = String(input?.messageId || '');
  const externalBase = [messageId || subject, date, amount.toFixed(2), direction, merchant.toLowerCase()].join('|');

  return {
    kind,
    confidence,
    signals,
    reason: 'extracted',
    account_mask: mask,
    currency,
    rows: [{
      external_id: `email_${fingerprint(externalBase)}`,
      date,
      description,
      merchant: merchant || undefined,
      amount: direction === 'debit' ? -amount : amount,
      currency: currency || undefined,
      status: settlement,
      occurrence: 1,
    }],
  };
}

// One statement-import style account holds everything that arrives by email, so
// the user sees "Card alerts (email)" next to their imported statements and the
// review queue stays in one place.
async function ensureCardAlertAccount(base44: any, user: any, extraction: CardEmailExtraction) {
  const existing = await base44.asServiceRole.entities.FinancialConnection.filter({
    target_user_id: user.id,
    provider: 'import',
    institution_name: CARD_ALERT_ACCOUNT_NAME,
  });
  if (existing && existing.length) return existing[0];

  const keys = [user.id, String(user.email || '').toLowerCase()].filter(Boolean);
  return await base44.asServiceRole.entities.FinancialConnection.create({
    provider: 'import',
    institution_name: CARD_ALERT_ACCOUNT_NAME,
    account_mask: extraction.account_mask || '',
    account_type: 'credit',
    currency: extraction.currency || 'USD',
    status: 'connected',
    target_user_id: user.id,
    target_user_email: user.email || '',
    target_user_keys: keys,
    connected_at: new Date().toISOString(),
  });
}

export async function ingestCardEmailMessage(base44: any, opts: {
  user: { id: string; email?: string };
  message: { messageId?: string; subject?: string; sender?: string; receivedAt?: string; text?: string };
}) {
  const extraction = extractCardEmail({
    subject: opts?.message?.subject,
    text: opts?.message?.text,
    sender: opts?.message?.sender,
    receivedAt: opts?.message?.receivedAt,
    messageId: opts?.message?.messageId,
  });

  if (!extraction.rows.length) {
    return { ...extraction, imported: 0, duplicates: 0, upgraded: 0 };
  }

  const connection = await ensureCardAlertAccount(base44, opts.user, extraction);
  const ranges = await loadGatheringRanges(base44, opts.user.id);

  try {
    const ingested = await ingestTransactions(base44, {
      user: opts.user,
      connection,
      rawRows: extraction.rows,
      source: 'email_import',
      ranges,
    });
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.FinancialConnection.update(connection.id, {
      last_attempt_at: now,
      last_sync_at: now,
      last_error: '',
      status: 'connected',
    });
    return { ...extraction, ...ingested };
  } catch (error: any) {
    await base44.asServiceRole.entities.FinancialConnection.update(connection.id, {
      last_attempt_at: new Date().toISOString(),
      last_error: 'email_import_failed',
    }).catch(() => {});
    throw error;
  }
}