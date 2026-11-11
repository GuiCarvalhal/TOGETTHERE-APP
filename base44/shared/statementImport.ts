// Statement parser for the low-cost financial path: the user exports (or pastes)
// a bank/credit-card statement and this module turns it into the SAME raw row
// shape a provider adapter returns. Normalization, dedupe and suggestions stay in
// financialTransactions.ts / financialIngest.ts, so a statement import and an
// email import land identical records. Nothing here writes to the database.
//
// Supported inputs:
//   - delimited exports (CSV, TSV, pipe) with EN or PT-BR headers
//   - OFX / QFX (SGML tag soup, optionally with unclosed tags)
//   - plain-text statements: one "date … merchant … amount" line per transaction
//
// Card-statement specifics handled here:
//   - amount sign/marker: "-42,00", "(42.00)", "42.00 D", "42,00 DB", "R$ 42,00"
//   - separate debit/credit columns, or a single signed amount column
//   - positive-only charge lists (assumed debit, flagged as a warning)
//   - DD/MM vs MM/DD resolution from the file itself, never a guess per row
//   - merchant cleanup (POS/SQ/PAYPAL prefixes, store numbers, city/state tails)
//   - currency detection and preservation (charges stay in their own currency)

import { normalizeAmount } from './financialTransactions.ts';

export const STATEMENT_MAX_CHARS = 400000;
export const STATEMENT_MAX_ROWS = 2000;

export type StatementRow = {
  external_id: string;
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  currency?: string;
  status?: 'pending' | 'posted';
  occurrence?: number;
};

export type ParsedStatement = {
  rows: StatementRow[];
  warnings: string[];
  skipped: number;
  format: 'ofx' | 'delimited' | 'text' | 'unknown';
};

type DateConvention = 'mdy' | 'dmy';

type ColumnKey =
  | 'date' | 'description' | 'merchant' | 'amount' | 'debit' | 'credit'
  | 'currency' | 'reference' | 'status' | 'category' | 'type';

// Aliases are compared against a normalized header label (lowercase, accents
// stripped, punctuation collapsed to single spaces), EN and PT-BR.
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  date: [
    'date', 'data', 'data da compra', 'data compra', 'data do lancamento',
    'data lancamento', 'transaction date', 'posted date', 'posting date',
    'post date', 'data movimento', 'data da transacao', 'data da transação',
  ],
  description: [
    'description', 'descricao', 'descrição', 'memo', 'historico', 'histórico',
    'lancamento', 'details', 'detail', 'narrative', 'transaction',
    'transaction description', 'observacao', 'detalhes', 'titulo', 'title',
  ],
  merchant: [
    'merchant', 'estabelecimento', 'comerciante', 'payee', 'beneficiario',
    'favorecido', 'nome do estabelecimento', 'merchant name', 'card acceptor',
  ],
  amount: [
    'amount', 'valor', 'transaction amount', 'montante', 'quantia',
    'valor em conta', 'valor da transacao', 'valor da transação', 'value',
  ],
  debit: [
    'debit', 'debito', 'débito', 'saida', 'saída', 'valor debito',
    'valor débito', 'debitos', 'débitos', 'valor saida', 'charge', 'charges',
  ],
  credit: [
    'credit', 'credito', 'crédito', 'entrada', 'valor credito', 'valor crédito',
    'creditos', 'créditos', 'valor entrada', 'payment', 'payments', 'refund',
  ],
  currency: ['currency', 'moeda', 'moeda original', 'coin', 'moeda da transacao'],
  reference: [
    'reference', 'referencia', 'referência', 'id', 'fitid', 'transaction id',
    'id transacao', 'id transação', 'identificador', 'codigo', 'código',
    'autorizacao', 'autorização', 'autenticacao', 'auth code',
  ],
  status: ['status', 'situacao', 'situação', 'estado'],
  category: ['category', 'categoria', 'raw category', 'mcc'],
  type: ['type', 'tipo', 'natureza', 'debito credito', 'd c', 'credit debit', 'd/c'],
};

const COLUMN_ORDER: ColumnKey[] = [
  'date', 'type', 'debit', 'credit', 'amount', 'description', 'merchant',
  'currency', 'reference', 'status', 'category',
];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// Lines that look like money but are not transactions.
const NON_TRANSACTION_LINE = /(total|subtotal|saldo|balance|fatura atual|previous balance|carried forward|saldo anterior|limite|credit limit|available credit|limite disponivel|pagamento minimo|minimum payment|vencimento|due date|due on|juros|interest charge summary)/;

// Merchant noise that never belongs in a normalized merchant name.
const MERCHANT_PREFIXES: RegExp[] = [
  /^(?:POS|PURCHASE|COMPRA|DEBIT|CREDIT|DEBITO|DÉBITO|CREDITO|CRÉDITO|PAGAMENTO|PAYMENT|VISA|MASTERCARD|AMEX|ELO)\s+/i,
  /^(?:SQ|TST|SP|PP|EB|IC|MP|DL|FACEBK|PAYPAL|AMZN\s*MKT|AMZN|GOOGLE|UBER|AIRBNB)\s*\*+\s*/i,
  /^APPLE\.COM\//i,
];

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLabel(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesLabel(label: string, aliases: string[]) {
  if (!label) return false;
  if (aliases.includes(label)) return true;
  const tokens = label.split(' ');
  return aliases.some((alias) => (alias.includes(' ')
    ? label.includes(alias)
    : tokens.includes(alias)));
}

// --- shared normalization helpers (also used by the card-email extractor) ---

export function cleanDescription(raw: unknown) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:X{2,}|\*{2,})\d{2,}\b/g, '')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, ' ')
    .replace(/\s+(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?)$/, '')
    .replace(/\s+(?:USA|CAN|BRA|US|BR|PT|GB)$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;|*#-]+/, '')
    .replace(/[\s,;|*#-]+$/, '')
    .trim();
}

// "SQ *BLUE BOTTLE 1234 SEATTLE WA" -> "Blue Bottle"
export function cleanMerchantName(raw: unknown) {
  let out = cleanDescription(raw);
  for (const re of MERCHANT_PREFIXES) out = out.replace(re, '');
  out = out
    .replace(/#\s*\S+/g, ' ')
    .replace(/\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\s+\d{3,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;|*#-]+/, '')
    .replace(/[\s,;|*#-]+$/, '')
    .trim();
  return out;
}

function isoDate(year: number, month: number, day: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const stamp = Date.parse(`${iso}T12:00:00.000Z`);
  if (!Number.isFinite(stamp)) return '';
  return new Date(stamp).toISOString().slice(0, 10) === iso ? iso : '';
}

// Resolves one date cell to ISO (YYYY-MM-DD). The convention decides the
// DD/MM vs MM/DD reading, and an impossible value (day > 12) overrides it so a
// single odd row can never flip the whole file.
export function resolveDateValue(
  rawValue: string,
  convention: DateConvention = 'mdy',
  fallbackYear = new Date().getUTCFullYear(),
): string {
  const raw = text(rawValue);
  if (!raw) return '';

  const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return isoDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));

  const numeric = raw.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : fallbackYear;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let day = convention === 'dmy' ? first : second;
    let month = convention === 'dmy' ? second : first;
    if (first > 12 && second <= 12) { day = first; month = second; }
    else if (second > 12 && first <= 12) { day = second; month = first; }
    return isoDate(year, month, day);
  }

  const monthName = raw.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (monthName) {
    const month = MONTHS[monthName[1].slice(0, 4).toLowerCase()] || MONTHS[monthName[1].slice(0, 3).toLowerCase()];
    if (month) return isoDate(Number(monthName[3] || fallbackYear), month, Number(monthName[2]));
  }

  const dayMonthName = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?/);
  if (dayMonthName) {
    const month = MONTHS[dayMonthName[2].slice(0, 3).toLowerCase()];
    if (month) return isoDate(Number(dayMonthName[3] || fallbackYear), month, Number(dayMonthName[1]));
  }

  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return '';
}

export function detectDateConvention(samples: string[], content = ''): DateConvention {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const sample of samples) {
    const match = String(sample || '').match(/^(\d{1,2})[./-](\d{1,2})(?:[./-]\d{2,4})?$/);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) dayFirst += 1;
    else if (second > 12 && first <= 12) monthFirst += 1;
  }
  if (dayFirst > monthFirst) return 'dmy';
  if (monthFirst > dayFirst) return 'mdy';
  // Ambiguous everywhere: the statement language decides.
  return /R\$|\bBRL\b|\bdata\b|\bvalor\b|\bfatura\b|\bextrato\b|\blancamento\b/i.test(content) ? 'dmy' : 'mdy';
}

// "$1,234.56", "1.234,56", "(42.00)", "42,00 D", "42.00 CR", "-42"
export function parseAmountCell(raw: unknown): { amount: number; direction: 'debit' | 'credit' } | null {
  const value = text(raw);
  if (!value) return null;
  const marker = value.match(/\b(D|DR|DB|DEB|DEBIT|DEBITO|DEBITO|C|CR|CRED|CREDIT|CREDITO|CREDITO)\s*$/i);
  const base = normalizeAmount(value);
  if (!base) return null;
  if (!marker) return base;
  const label = marker[1].toUpperCase();
  const isCredit = label.startsWith('CRED') || label === 'CR' || label === 'C';
  return { amount: base.amount, direction: isCredit ? 'credit' : 'debit' };
}

export function detectCurrency(content: string, explicit?: string) {
  const chosen = String(explicit || '').toUpperCase();
  if (/^[A-Z]{3}$/.test(chosen)) return chosen;
  const body = String(content || '');
  if (/R\$\s?[\d.,]+/.test(body)) return 'BRL';
  if (/€\s?[\d.,]+/.test(body)) return 'EUR';
  if (/£\s?[\d.,]+/.test(body)) return 'GBP';
  if (/(?:US\$|\$)\s?[\d.,]+/.test(body)) return 'USD';
  const code = body.match(/\b(USD|BRL|EUR|GBP|CAD|AUD|ARS|MXN|CLP|CHF|JPY)\b/);
  return code ? code[1] : '';
}

function detectStatus(raw: unknown): 'pending' | 'posted' {
  const value = normalizeLabel(text(raw));
  return /pend|autoriza|autori[sz]|processing|em processamento/.test(value) ? 'pending' : 'posted';
}

function fingerprintId(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function fallbackYearOf(content: string) {
  const match = content.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getUTCFullYear();
}

type Draft = {
  dateRaw: string;
  description: string;
  merchant: string;
  reference: string;
  currency: string;
  status: 'pending' | 'posted';
  amount: number;
  direction: 'debit' | 'credit';
  explicit: boolean;
  signedNegative: boolean;
};

// Charge lists usually print every amount positive. With no minus sign and no
// explicit debit/credit marker, positive amounts are the expenses.
function buildRows(
  drafts: Draft[],
  convention: DateConvention,
  fallbackYear: number,
  fallbackCurrency: string,
  skipped: number,
) {
  const warnings: string[] = [];
  const rows: StatementRow[] = [];
  let localSkipped = skipped;

  const anySign = drafts.some((d) => d.explicit || d.signedNegative);
  if (drafts.length && !anySign) {
    drafts.forEach((d) => { d.direction = 'debit'; });
    warnings.push('assumed_debit');
  }

  const occurrences = new Map<string, number>();
  for (const draft of drafts) {
    if (rows.length >= STATEMENT_MAX_ROWS) { warnings.push('row_limit'); break; }
    const date = resolveDateValue(draft.dateRaw, convention, fallbackYear);
    if (!date) { localSkipped += 1; continue; }

    const signature = [
      date,
      draft.amount.toFixed(2),
      draft.direction,
      draft.description.toLowerCase(),
      draft.reference,
    ].join('|');
    const seen = (occurrences.get(signature) || 0) + 1;
    occurrences.set(signature, seen);

    rows.push({
      external_id: `stmt_${fingerprintId(`${signature}#${seen}`)}`,
      date,
      description: draft.description,
      merchant: draft.merchant || undefined,
      amount: draft.direction === 'debit' ? -draft.amount : draft.amount,
      currency: draft.currency || fallbackCurrency || undefined,
      status: draft.status,
      occurrence: seen,
    });
  }

  return { rows, warnings, skipped: localSkipped };
}

// --- delimited (CSV / TSV / pipe) -------------------------------------------

function detectDelimiter(line: string) {
  const candidates: Array<[string, number]> = [
    [';', (line.match(/;/g) || []).length],
    [',', (line.match(/,/g) || []).length],
    ['\t', (line.match(/\t/g) || []).length],
    ['|', (line.match(/\|/g) || []).length],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ',';
}

// Minimal RFC4180-ish split: quoted cells may contain the delimiter and "".
function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
      continue;
    }
    if (ch === delimiter && !quoted) { cells.push(current); current = ''; continue; }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim().replace(/^"|"$/g, ''));
}

function mapColumns(header: string[]) {
  const labels = header.map(normalizeLabel);
  const assigned: Partial<Record<ColumnKey, number>> = {};

  // Exact matches first so a column named exactly "data" beats "data limite".
  for (const key of COLUMN_ORDER) {
    const index = labels.findIndex((label, i) => !Object.values(assigned).includes(i)
      && COLUMN_ALIASES[key].includes(label));
    if (index >= 0) assigned[key] = index;
  }
  // Then token matches for decorated headers ("Valor (R$)", "Data da compra (UTC)").
  for (const key of COLUMN_ORDER) {
    if (assigned[key] !== undefined) continue;
    const index = labels.findIndex((label, i) => !Object.values(assigned).includes(i)
      && matchesLabel(label, COLUMN_ALIASES[key]));
    if (index >= 0) assigned[key] = index;
  }

  // A header naming both sides is a type column, never a debit column.
  const typeIndex = labels.findIndex((label) => (label.includes('debito') || label.includes('debit'))
    && (label.includes('credito') || label.includes('credit')));
  if (typeIndex >= 0) {
    assigned.type = typeIndex;
    if (assigned.debit === typeIndex) delete assigned.debit;
    if (assigned.credit === typeIndex) delete assigned.credit;
  }

  return assigned;
}

function findHeaderIndex(lines: string[]) {
  const limit = Math.min(lines.length, 15);
  for (let i = 0; i < limit; i += 1) {
    const delimiter = detectDelimiter(lines[i]);
    const columns = mapColumns(splitLine(lines[i], delimiter));
    const hasAmount = columns.amount !== undefined
      || columns.debit !== undefined
      || columns.credit !== undefined;
    if (columns.date !== undefined && hasAmount) return i;
  }
  return -1;
}

function cellAt(cells: string[], index?: number) {
  return index === undefined ? '' : text(cells[index]);
}

function looksLikeDate(value: string) {
  const raw = text(value);
  if (!raw) return false;
  if (/^\d{4}-?\d{2}-?\d{2}/.test(raw)) return true;
  if (/^\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?$/.test(raw)) return true;
  if (/^[A-Za-z]{3,9}\.?\s+\d{1,2}/.test(raw)) return true;
  if (/^\d{1,2}\s+[A-Za-z]{3,9}/.test(raw)) return true;
  return Number.isFinite(Date.parse(raw));
}

function readDraft(cells: string[], columns: Partial<Record<ColumnKey, number>>): Draft | null {
  const dateRaw = cellAt(cells, columns.date);
  if (!dateRaw || !looksLikeDate(dateRaw)) return null;

  const debit = parseAmountCell(cellAt(cells, columns.debit));
  const credit = parseAmountCell(cellAt(cells, columns.credit));
  const plain = parseAmountCell(cellAt(cells, columns.amount));
  const typeLabel = normalizeLabel(cellAt(cells, columns.type));

  let amount = 0;
  let direction: 'debit' | 'credit' = 'debit';
  let explicit = false;

  if (debit) { amount = debit.amount; direction = 'debit'; explicit = true; }
  else if (credit) { amount = credit.amount; direction = 'credit'; explicit = true; }
  else if (plain && typeLabel) {
    amount = plain.amount;
    direction = /cred|entrada|refund|estorno|^c$/.test(typeLabel) ? 'credit' : 'debit';
    explicit = true;
  } else if (plain) {
    amount = plain.amount;
    direction = plain.direction;
    explicit = plain.direction === 'credit';
  } else {
    return null;
  }
  if (!amount) return null;

  const rawDescription = cellAt(cells, columns.description);
  const explicitMerchant = cellAt(cells, columns.merchant);
  const description = cleanDescription(rawDescription || explicitMerchant);
  const merchant = explicitMerchant ? cleanMerchantName(explicitMerchant) : cleanMerchantName(description);

  return {
    dateRaw,
    description: description || merchant,
    merchant,
    reference: cellAt(cells, columns.reference),
    currency: cellAt(cells, columns.currency).toUpperCase(),
    status: detectStatus(cellAt(cells, columns.status)),
    amount,
    direction,
    explicit,
    signedNegative: plain?.direction === 'debit' || Boolean(debit),
  };
}

function parseDelimited(
  content: string,
  fallbackCurrency: string,
  fallbackYear: number,
): { rows: StatementRow[]; warnings: string[]; skipped: number } {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], warnings: ['no_rows'], skipped: 0 };

  const headerIndex = findHeaderIndex(lines);
  if (headerIndex < 0) return { rows: [], warnings: ['no_header'], skipped: 0 };

  const delimiter = detectDelimiter(lines[headerIndex]);
  const columns = mapColumns(splitLine(lines[headerIndex], delimiter));
  const hasAmount = columns.amount !== undefined
    || columns.debit !== undefined
    || columns.credit !== undefined;
  if (columns.date === undefined || !hasAmount) {
    return { rows: [], warnings: ['unsupported_columns'], skipped: 0 };
  }

  const drafts: Draft[] = [];
  let skipped = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (drafts.length >= STATEMENT_MAX_ROWS) break;
    const draft = readDraft(splitLine(line, delimiter), columns);
    if (!draft) { skipped += 1; continue; }
    drafts.push(draft);
  }
  if (!drafts.length) return { rows: [], warnings: ['no_rows'], skipped };

  const convention = detectDateConvention(drafts.map((d) => d.dateRaw), content);
  return buildRows(drafts, convention, fallbackYear, fallbackCurrency, skipped);
}

// --- OFX / QFX ---------------------------------------------------------------

function ofxField(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function parseOfxDate(raw: string) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return '';
  return isoDate(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
}

function parseOfx(
  content: string,
  fallbackCurrency: string,
): { rows: StatementRow[]; warnings: string[]; skipped: number } | null {
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi);
  if (!blocks || !blocks.length) return null;

  const declared = (content.match(/<CURDEF>\s*([A-Z]{3})/i) || [])[1];
  const currency = (declared || fallbackCurrency || '').toUpperCase();

  const rows: StatementRow[] = [];
  const occurrences = new Map<string, number>();
  let skipped = 0;

  for (const block of blocks) {
    if (rows.length >= STATEMENT_MAX_ROWS) break;
    const date = parseOfxDate(ofxField(block, 'DTPOSTED'));
    const parsed = parseAmountCell(ofxField(block, 'TRNAMT'));
    if (!date || !parsed) { skipped += 1; continue; }

    const name = ofxField(block, 'NAME');
    const memo = ofxField(block, 'MEMO');
    const description = cleanDescription([name, memo].filter(Boolean).join(' - ')) || cleanDescription(name) || cleanDescription(memo);
    if (!description) { skipped += 1; continue; }

    const type = ofxField(block, 'TRNTYPE').toUpperCase();
    let direction = parsed.direction;
    if (/^(CREDIT|DEP|DIRECTDEP|INT|DIV)$/.test(type)) direction = 'credit';
    else if (/^(DEBIT|CHECK|PAYMENT|FEE|SRVCHG|ATM|POS|CASH|DIRECTDEBIT)$/.test(type)) direction = 'debit';

    const reference = ofxField(block, 'FITID');
    const signature = [date, parsed.amount.toFixed(2), direction, description.toLowerCase(), reference].join('|');
    const seen = (occurrences.get(signature) || 0) + 1;
    occurrences.set(signature, seen);

    rows.push({
      external_id: reference ? `ofx_${reference}` : `stmt_${fingerprintId(`${signature}#${seen}`)}`,
      date,
      description,
      merchant: cleanMerchantName(description) || undefined,
      amount: direction === 'debit' ? -parsed.amount : parsed.amount,
      currency: currency || undefined,
      status: 'posted',
      occurrence: seen,
    });
  }

  return { rows, warnings: ['ofx_parsed'], skipped };
}

// --- plain text --------------------------------------------------------------

const TEXT_DATE_HEAD = /^(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s*\d{0,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s*\d{0,4})\s+/;
const TEXT_AMOUNT_TAIL = /([(]?\s*(?:R\$|US\$|S\$|\$|€|£)?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\s*\)?)(?:\s*(D|C|DB|CR|DR))?\s*$/i;

function readTextLine(line: string): Draft | null {
  if (NON_TRANSACTION_LINE.test(line.toLowerCase())) return null;
  const dateMatch = line.match(TEXT_DATE_HEAD);
  if (!dateMatch) return null;

  const tail = line.slice(dateMatch[0].length);
  const amountMatch = tail.match(TEXT_AMOUNT_TAIL);
  if (!amountMatch) return null;

  const parsed = parseAmountCell(`${amountMatch[1]}${amountMatch[2] ? ` ${amountMatch[2]}` : ''}`);
  if (!parsed) return null;

  const middle = tail.slice(0, amountMatch.index).replace(/[\s|;,\-]+$/, '').trim();
  const description = cleanDescription(middle);
  if (!description || description.length < 2) return null;

  const marker = line.match(/\b(CR|CREDIT|CREDITO|CRÉDITO|REFUND|ESTORNO|REVERSAL)\b/i);
  const negative = /^[(]|-/.test(amountMatch[1].trim()) || /-\s*$/.test(amountMatch[1]);

  return {
    dateRaw: dateMatch[0].trim(),
    description,
    merchant: cleanMerchantName(description),
    reference: '',
    currency: '',
    status: detectStatus(line),
    amount: parsed.amount,
    direction: marker ? 'credit' : negative ? 'debit' : 'debit',
    explicit: Boolean(marker) || negative,
    signedNegative: negative,
  };
}

function parseText(
  content: string,
  fallbackCurrency: string,
  fallbackYear: number,
): { rows: StatementRow[]; warnings: string[]; skipped: number } {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const drafts: Draft[] = [];
  let skipped = 0;
  for (const line of lines) {
    const draft = readTextLine(line);
    if (draft) drafts.push(draft);
    else if (line.length > 3) skipped += 1;
  }
  if (drafts.length < 2) return { rows: [], warnings: ['text_unreadable'], skipped };

  const convention = detectDateConvention(drafts.map((d) => d.dateRaw), content);
  const built = buildRows(drafts, convention, fallbackYear, fallbackCurrency, skipped);
  return { rows: built.rows, warnings: [...built.warnings, 'text_parsed'], skipped: built.skipped };
}

// --- entry point -------------------------------------------------------------

function looksLikeOfx(content: string) {
  return /<OFX>|<STMTTRN>/i.test(content) || /^OFXHEADER\s*:/im.test(content);
}

export function parseStatement(input: string, options: { currency?: string } = {}): ParsedStatement {
  const raw = String(input || '');
  if (!raw.trim()) return { rows: [], warnings: ['empty'], skipped: 0, format: 'unknown' };

  const warnings: string[] = [];
  let content = raw;
  if (content.length > STATEMENT_MAX_CHARS) {
    content = content.slice(0, STATEMENT_MAX_CHARS);
    warnings.push('truncated');
  }

  const fallbackCurrency = detectCurrency(content, options.currency);
  const fallbackYear = fallbackYearOf(content);

  if (looksLikeOfx(content)) {
    const ofx = parseOfx(content, fallbackCurrency);
    if (ofx && ofx.rows.length) {
      return {
        rows: ofx.rows,
        warnings: [...warnings, ...ofx.warnings],
        skipped: ofx.skipped,
        format: 'ofx',
      };
    }
    warnings.push('ofx_unreadable');
  }

  const delimited = parseDelimited(content, fallbackCurrency, fallbackYear);
  if (delimited.rows.length) {
    return {
      rows: delimited.rows,
      warnings: [...warnings, ...delimited.warnings],
      skipped: delimited.skipped,
      format: 'delimited',
    };
  }

  const plain = parseText(content, fallbackCurrency, fallbackYear);
  if (plain.rows.length) {
    return {
      rows: plain.rows,
      warnings: [...warnings, ...plain.warnings],
      skipped: plain.skipped,
      format: 'text',
    };
  }

  const reason = delimited.warnings.includes('unsupported_columns')
    ? 'unsupported_columns'
    : delimited.warnings[0] || 'no_rows';

  return {
    rows: [],
    warnings: [...warnings, reason],
    skipped: delimited.skipped,
    format: 'unknown',
  };
}