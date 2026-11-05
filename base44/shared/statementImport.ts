// Statement (CSV / TSV / text export) parser for the financial integration.
//
// The MVP transaction source is an exported statement: the user drops a bank or
// card export (or pastes its text) and this module turns it into the SAME raw row
// shape a provider adapter returns. Normalization, dedupe and suggestions stay in
// financialTransactions.ts, so a statement import and a provider sync land
// identical records. Nothing here writes to the database.

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

type ColumnKey =
  | 'date' | 'description' | 'merchant' | 'amount' | 'debit' | 'credit'
  | 'currency' | 'reference' | 'status' | 'category' | 'type';

// Aliases are compared against a normalized header label (lowercase, accents
// stripped, punctuation collapsed to single spaces), EN and PT-BR.
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  date: [
    'date', 'data', 'data da compra', 'data compra', 'data do lancamento',
    'data lancamento', 'transaction date', 'posted date', 'posting date',
    'data movimento', 'data da transacao',
  ],
  description: [
    'description', 'descricao', 'memo', 'historico', 'lancamento', 'details',
    'detail', 'narrative', 'transaction', 'transaction description', 'observacao',
    'detalhes',
  ],
  merchant: [
    'merchant', 'estabelecimento', 'comerciante', 'payee', 'beneficiario',
    'favorecido', 'nome do estabelecimento',
  ],
  amount: [
    'amount', 'valor', 'transaction amount', 'montante', 'quantia', 'valor em conta',
  ],
  debit: ['debit', 'debito', 'saida', 'valor debito', 'debitos', 'valor saida'],
  credit: ['credit', 'credito', 'entrada', 'valor credito', 'creditos', 'valor entrada'],
  currency: ['currency', 'moeda', 'moeda original', 'coin'],
  reference: [
    'reference', 'referencia', 'id', 'fitid', 'transaction id', 'id transacao',
    'identificador', 'codigo', 'autorizacao', 'autenticacao',
  ],
  status: ['status', 'situacao', 'estado'],
  category: ['category', 'categoria', 'raw category'],
  type: ['type', 'tipo', 'natureza', 'debito credito', 'd c', 'credit debit'],
};

const COLUMN_ORDER: ColumnKey[] = [
  'date', 'type', 'debit', 'credit', 'amount', 'description', 'merchant',
  'currency', 'reference', 'status', 'category',
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
  const limit = Math.min(lines.length, 12);
  for (let i = 0; i < limit; i += 1) {
    const delimiter = detectDelimiter(lines[i]);
    const columns = mapColumns(splitLine(lines[i], delimiter));
    const hasAmount = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
    if (columns.date !== undefined && hasAmount) return i;
  }
  return -1;
}

function cellAt(cells: string[], index?: number) {
  return index === undefined ? '' : text(cells[index]);
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

// Totals, balances and section headers sit in the same columns as real rows: a
// row only counts when its date cell actually holds a date.
function looksLikeDate(value: string) {
  const raw = text(value);
  if (!raw) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return true;
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(raw)) return true;
  return Number.isFinite(Date.parse(raw));
}

function readDraft(cells: string[], columns: Partial<Record<ColumnKey, number>>): Draft | null {
  const dateRaw = cellAt(cells, columns.date);
  if (!dateRaw || !looksLikeDate(dateRaw)) return null;

  const debit = normalizeAmount(cellAt(cells, columns.debit));
  const credit = normalizeAmount(cellAt(cells, columns.credit));
  const plain = normalizeAmount(cellAt(cells, columns.amount));
  const typeLabel = normalizeLabel(cellAt(cells, columns.type));

  let amount = 0;
  let direction: 'debit' | 'credit' = 'debit';
  let explicit = false;

  if (debit) { amount = debit.amount; direction = 'debit'; explicit = true; }
  else if (credit) { amount = credit.amount; direction = 'credit'; explicit = true; }
  else if (plain && typeLabel) {
    amount = plain.amount;
    direction = typeLabel.startsWith('cred') || typeLabel === 'c' || typeLabel.includes('entrada') ? 'credit' : 'debit';
    explicit = true;
  } else if (plain) {
    amount = plain.amount;
    direction = plain.direction;
  } else {
    return null;
  }
  if (!amount) return null;

  const description = cellAt(cells, columns.description);
  const merchant = cellAt(cells, columns.merchant);
  const statusRaw = normalizeLabel(cellAt(cells, columns.status));

  return {
    dateRaw,
    description: description || merchant,
    merchant,
    reference: cellAt(cells, columns.reference),
    currency: cellAt(cells, columns.currency).toUpperCase(),
    status: statusRaw.includes('pend') ? 'pending' : 'posted',
    amount,
    direction,
    explicit,
    signedNegative: (plain?.direction === 'debit') || (debit !== null),
  };
}

// Stable per-row id so re-importing the same file (or the same month twice)
// never creates a second record. The occurrence counter keeps two identical
// charges on the same day distinct.
function fingerprintId(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function parseStatement(input: string): {
  rows: StatementRow[];
  warnings: string[];
  skipped: number;
} {
  const warnings: string[] = [];
  const raw = String(input || '');
  if (!raw.trim()) return { rows: [], warnings: ['empty'], skipped: 0 };

  let content = raw;
  if (content.length > STATEMENT_MAX_CHARS) {
    content = content.slice(0, STATEMENT_MAX_CHARS);
    warnings.push('truncated');
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], warnings: ['no_rows'], skipped: 0 };

  const headerIndex = findHeaderIndex(lines);
  if (headerIndex < 0) return { rows: [], warnings: ['no_header'], skipped: 0 };

  const delimiter = detectDelimiter(lines[headerIndex]);
  const columns = mapColumns(splitLine(lines[headerIndex], delimiter));
  const hasAmount = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
  if (columns.date === undefined || !hasAmount) {
    return { rows: [], warnings: ['unsupported_columns'], skipped: 0 };
  }

  const drafts: Draft[] = [];
  let skipped = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (drafts.length >= STATEMENT_MAX_ROWS) { warnings.push('row_limit'); break; }
    const draft = readDraft(splitLine(line, delimiter), columns);
    if (!draft) { skipped += 1; continue; }
    drafts.push(draft);
  }

  if (!drafts.length) return { rows: [], warnings: ['no_rows'], skipped };

  // Charge lists usually print every amount positive. With no minus sign and no
  // explicit debit/credit column, positive amounts are the expenses.
  const anySign = drafts.some((d) => d.explicit || d.signedNegative);
  if (!anySign) {
    drafts.forEach((d) => { d.direction = 'debit'; });
    warnings.push('assumed_debit');
  }

  const occurrences = new Map<string, number>();
  const rows: StatementRow[] = drafts.map((draft) => {
    const signature = [
      draft.dateRaw,
      draft.amount.toFixed(2),
      draft.direction,
      draft.description.toLowerCase(),
      draft.reference,
    ].join('|');
    const seen = (occurrences.get(signature) || 0) + 1;
    occurrences.set(signature, seen);

    return {
      external_id: `stmt_${fingerprintId(`${signature}#${seen}`)}`,
      date: draft.dateRaw,
      description: draft.description,
      merchant: draft.merchant || undefined,
      amount: draft.direction === 'debit' ? -draft.amount : draft.amount,
      currency: draft.currency || undefined,
      status: draft.status,
      occurrence: seen,
    };
  });

  return { rows, warnings, skipped };
}