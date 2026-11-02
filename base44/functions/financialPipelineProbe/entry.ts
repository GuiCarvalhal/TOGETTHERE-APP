import {
  normalizeAmount,
  normalizeCurrency,
  normalizeOccurredAt,
  normalizeTransaction,
  buildTransactionFingerprint,
  categorizeTransaction,
  suggestGatheringForDate,
} from '../../shared/financialTransactions.ts';

// Contract probe for the financial transaction pipeline: normalization (sign,
// currency, dates), the symmetric dedupe fingerprint, category suggestions and
// gathering suggestions. Pure functions only — no provider, no writes.
export default async function () {
  const checks: any[] = [];
  const check = (name: string, pass: any, detail?: any) => checks.push({ name, pass: !!pass, detail: detail ?? null });

  // Amount sign + locale separators.
  const debit = normalizeAmount('-24.80');
  check('negative -> debit magnitude', debit?.amount === 24.8 && debit?.direction === 'debit', debit);
  const credit = normalizeAmount('8.50');
  check('positive -> credit', credit?.amount === 8.5 && credit?.direction === 'credit', credit);
  const ptBr = normalizeAmount('1.234,56');
  check('pt-BR separators', ptBr?.amount === 1234.56 && ptBr?.direction === 'credit', ptBr);
  const parens = normalizeAmount('($42.00)');
  check('parentheses -> debit', parens?.amount === 42 && parens?.direction === 'debit', parens);
  check('zero rejected', normalizeAmount('0.00') === null);

  // Currency + dates.
  check('currency normalized', normalizeCurrency('brl') === 'BRL' && normalizeCurrency('', 'EUR') === 'EUR');
  check('iso date', normalizeOccurredAt('2026-10-31')?.date === '2026-10-31');
  check('US date', normalizeOccurredAt('10/31/2026')?.date === '2026-10-31');
  check('bad date rejected', normalizeOccurredAt('not-a-date') === null);

  // Fingerprint is stable across key order and provider-id changes, and differs
  // when the amount or merchant changes.
  const fpA = buildTransactionFingerprint({ provider: 'demo', date: '2026-10-31', amount: 24.8, currency: 'USD', merchant: 'Uber' });
  const fpB = buildTransactionFingerprint({ provider: 'demo', date: '2026-10-31', amount: 24.8, currency: 'usd', merchant: 'uber' });
  const fpC = buildTransactionFingerprint({ provider: 'demo', date: '2026-10-31', amount: 24.81, currency: 'USD', merchant: 'Uber' });
  check('fingerprint symmetric', fpA === fpB, { fpA, fpB });
  check('fingerprint amount sensitive', fpA !== fpC);

  // Category suggestion from merchant keywords + provider category.
  check('uber -> transport', categorizeTransaction({ merchant: 'Uber', raw_category: 'TRANSPORTATION' }).category === 'transport');
  check('hotel -> lodging', categorizeTransaction({ merchant: 'Booking.com', raw_category: 'TRAVEL' }).category === 'lodging');
  check('trattoria -> food', categorizeTransaction({ merchant: 'Trattoria da Enzo' }).category === 'food');
  check('unknown -> other', categorizeTransaction({ merchant: 'ZZZ Holdings' }).category === 'other');

  // Gathering suggestion by date window.
  const ranges = [{ gathering_id: 'g1', first_date: '2026-10-28', last_date: '2026-11-04', item_dates: ['2026-10-30', '2026-11-02'] }];
  const inside = suggestGatheringForDate('2026-11-01', ranges);
  check('date inside trip suggested', inside?.gathering_id === 'g1' && inside?.confidence >= 0.7, inside);
  check('far away date not suggested', suggestGatheringForDate('2026-06-01', ranges) === null);

  // End-to-end normalization of one provider row.
  const one = normalizeTransaction(
    { external_id: 'x1', date: '2026-11-01', description: 'UBER   *TRIP', merchant: 'Uber', raw_category: 'TRANSPORTATION', amount: '-24.80' },
    { provider: 'demo', currency: 'USD' },
  );
  check('row normalized end to end', one?.transaction?.direction === 'debit'
    && one?.transaction?.category_suggestion === 'transport'
    && one?.transaction?.date === '2026-11-01'
    && !!one?.transaction?.fingerprint, one?.transaction);
  check('invalid row reported', normalizeTransaction({ external_id: 'x2' }, { provider: 'demo', currency: 'USD' }).error === 'invalid_amount');

  const failed = checks.filter((c) => !c.pass);
  return Response.json({ ok: failed.length === 0, total: checks.length, failed });
}