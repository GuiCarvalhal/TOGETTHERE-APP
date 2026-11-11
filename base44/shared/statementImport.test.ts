// Tests for the statement/card-email ingestion helpers that replaced the bank
// aggregator path: delimited (CSV/TSV) files, OFX/QFX bank files, plain-text
// statements, and the deterministic card-email templates. No network or DB.
const test = (globalThis as any).test || (globalThis as any).Deno.test;
import assert from 'node:assert/strict';
import { parseStatement, parseAmountCell, cleanMerchantName } from './statementImport.ts';
import { extractCardEmail } from './cardEmailIngestion.ts';

const rowOf = (rows: any[], needle: string) =>
  rows.find((r) => JSON.stringify(r).toLowerCase().includes(needle.toLowerCase()));

test('CSV with debit/credit columns splits direction', () => {
  const csv = [
    'Date,Description,Debit,Credit',
    '2026-03-04,TRATTORIA ROMA,42.10,',
    '2026-03-05,REFUND HOTEL,,120.00',
  ].join('\n');
  const out = parseStatement(csv);
  assert.equal(out.rows.length, 2);
  const debit = rowOf(out.rows, 'trattoria');
  const credit = rowOf(out.rows, 'refund');
  assert.equal(debit.amount, 42.1);
  assert.equal(debit.direction, 'debit');
  assert.equal(credit.amount, 120);
  assert.equal(credit.direction, 'credit');
});

test('Portuguese semicolon CSV with comma decimals and DD/MM dates', () => {
  const csv = [
    'Data;Descrição;Valor',
    '07/03/2026;PADARIA CENTRAL;-18,50',
    '08/03/2026;ESTORNO CIA AEREA;1.240,00',
  ].join('\n');
  const out = parseStatement(csv, { currency: 'BRL' });
  assert.equal(out.rows.length, 2);
  const padaria = rowOf(out.rows, 'padaria');
  assert.equal(padaria.amount, 18.5);
  assert.equal(padaria.direction, 'debit');
  assert.equal(padaria.currency, 'BRL');
  assert.equal(rowOf(out.rows, 'estorno').direction, 'credit');
});

test('unsigned amounts are treated as debits and flagged', () => {
  const out = parseStatement('Data;Descrição;Valor\n10/03/2026;UBER;34,90');
  assert.equal(out.rows[0].direction, 'debit');
  assert.ok(out.warnings.includes('assumed_debit'));
});

test('OFX bank file parses transactions and marks them posted', () => {
  const ofx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <CURDEF>USD</CURDEF>
    <BANKTRANLIST>
      <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260312120000[-3:BRT]<TRNAMT>-89.90<FITID>A1<NAME>MERCADO SAO JORGE</STMTTRN>
      <STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260313<TRNAMT>250.00<FITID>A2<NAME>PAGAMENTO RECEBIDO</STMTTRN>
    </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const out = parseStatement(ofx);
  assert.equal(out.format, 'ofx');
  assert.equal(out.rows.length, 2);
  const market = rowOf(out.rows, 'mercado');
  assert.equal(market.amount, 89.9);
  assert.equal(market.direction, 'debit');
  assert.equal(market.date, '2026-03-12');
  assert.equal(market.status, 'posted');
  assert.equal(rowOf(out.rows, 'pagamento').direction, 'credit');
});

test('plain-text statement lines are read', () => {
  const text = [
    'SANTANDER EXTRATO',
    '05/03/2026  TAP AIR PORTUGAL  1.420,37 D',
    '06/03/2026  RESTAURANTE O MAR   98,00 D',
  ].join('\n');
  const out = parseStatement(text);
  assert.equal(out.rows.length, 2);
  assert.equal(rowOf(out.rows, 'tap air').amount, 1420.37);
});

test('amount cell helper handles signs, parens and thousands', () => {
  assert.deepEqual(parseAmountCell('(1,234.56)'), { amount: 1234.56, direction: 'debit' });
  assert.deepEqual(parseAmountCell('-42,10'), { amount: 42.1, direction: 'debit' });
  assert.deepEqual(parseAmountCell('1.000,00'), { amount: 1000, direction: 'credit' });
});

test('merchant cleanup strips card-descriptor noise', () => {
  const cleaned = cleanMerchantName('SQ *TRATTORIA ROMA 04/12');
  assert.ok(cleaned.toLowerCase().includes('trattoria roma'));
  assert.ok(!cleaned.toLowerCase().includes('sq *'));
});

test('card purchase alert becomes a pending debit row', () => {
  const res = extractCardEmail({
    subject: 'A purchase was made on your card ending 4412',
    sender: 'alerts@chase.com',
    receivedAt: '2026-03-12T15:00:00Z',
    text: 'A purchase of $89.90 was made at MERCADO SAO JORGE on March 12, 2026 with your card ending 4412.',
  });
  assert.equal(res.kind, 'purchase');
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].amount, 89.9);
  assert.equal(res.rows[0].direction, 'debit');
  assert.equal(res.rows[0].status, 'pending');
  assert.equal(res.account_mask, '4412');
});

test('refund email is a credit and never an expense candidate', () => {
  const res = extractCardEmail({
    subject: 'Refund processed for your card',
    sender: 'alerts@chase.com',
    receivedAt: '2026-03-14T15:00:00Z',
    text: 'A refund of $120.00 from HOTEL RIVIERA was credited to your card ending 4412 on March 14, 2026.',
  });
  assert.equal(res.kind, 'refund');
  assert.equal(res.rows[0].direction, 'credit');
});

test('statement notice and unrelated mail create nothing', () => {
  const notice = extractCardEmail({
    subject: 'Your statement is ready',
    sender: 'alerts@citi.com',
    text: 'Your statement is ready. Minimum payment due April 5, 2026. Balance $1,240.00.',
  });
  assert.equal(notice.kind, 'statement');
  assert.equal(notice.rows.length, 0);

  const other = extractCardEmail({
    subject: 'Weekly newsletter',
    sender: 'news@example.com',
    text: 'Here are this week stories about travel.',
  });
  assert.equal(other.kind, 'none');
  assert.equal(other.rows.length, 0);
});