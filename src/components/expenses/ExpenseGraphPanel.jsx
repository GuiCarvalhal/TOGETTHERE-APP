import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { formatCurrency, EXPENSE_CATEGORIES } from '@/lib/gatheringHelpers';

const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));
const CAT_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label]));
const PALETTE = ['#e05c48', '#1e2633', '#f07865', '#c8493a', '#7a8290', '#0ea5e9', '#8b5cf6', '#10b981'];

// Expense graph overlay — same sizing/layout as the Journey/Agent map overlay
// (tt-card p-3, rendered in the StickyBar mapRow slot via PageToolbar). Two
// accessible pie charts:
//   1. "Paid by member" — actual amounts paid (Expense.amount), grouped by payer
//   2. "By category" — actual amounts, grouped by expense category
//
// Aggregates ONLY valid authorized actual expenses (the scope-filtered set
// passed in), never balances. Mixed currencies are handled via the existing
// base-currency conversion (expenseInBase): all amounts are converted to the
// display currency using the same rules as the rest of the page (same-currency
// => original, snapshot => persisted, fallback => live or original). The
// currency label is always shown. When rates are unavailable and expenses span
// multiple original currencies, a warning is shown (amounts may be in mixed
// currencies — the per-expense displayFor currency is used, which may differ).
//
// Empty/zero data shows a quiet empty state. Category labels and totals are
// always shown in the chart legend/tooltip.
export default function ExpenseGraphPanel({ expenses, memberById, expenseInBase, displayFor, baseCurrency, ratesAvailable, scope }) {
  const scopeLabel = scope === 'mine' ? 'Your paid expenses' : 'All expenses';

  // Group by payer for chart 1
  const byPayer = {};
  expenses.forEach((e) => {
    const amt = expenseInBase(e);
    const key = e.payer_member_id;
    if (!byPayer[key]) byPayer[key] = { name: memberById[key]?.full_name || 'Unknown', value: 0 };
    byPayer[key].value += amt;
  });
  const payerData = Object.values(byPayer)
    .filter((d) => d.value > 0.005)
    .sort((a, b) => b.value - a.value);

  // Group by category for chart 2
  const byCat = {};
  expenses.forEach((e) => {
    const amt = expenseInBase(e);
    const key = e.category || 'other';
    if (!byCat[key]) byCat[key] = { key, name: CAT_LABEL[key] || 'Other', value: 0 };
    byCat[key].value += amt;
  });
  const catData = Object.values(byCat)
    .filter((d) => d.value > 0.005)
    .sort((a, b) => b.value - a.value);

  const total = payerData.reduce((s, d) => s + d.value, 0);
  const hasData = payerData.length > 0 && total > 0.005;

  // Check for mixed original currencies when rates are unavailable
  const origCurrencies = [...new Set(expenses.map((e) => (e.currency || 'USD').toUpperCase()))];
  const mixedCurrencies = !ratesAvailable && origCurrencies.length > 1;

  return (
    <div className="tt-card p-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <BarChart3 className="w-4 h-4 text-terra-deep" />
        <h3 className="font-display text-sm font-bold text-ink-deep">{scopeLabel}</h3>
        <span className="text-[0.6875rem] text-ink-deep/45 ml-auto">{formatCurrency(total, baseCurrency)}</span>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center text-center py-5 px-4">
          <BarChart3 className="w-6 h-6 text-terra/40 mb-1.5" />
          <p className="text-xs text-ink-deep/70">No expenses to chart yet.</p>
          <p className="text-[11px] text-ink-deep/50 mt-0.5">Add expenses to see the breakdown.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mixedCurrencies && (
            <p className="text-[11px] text-ink-deep/55 flex items-center gap-1 px-1">
              <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600" />
              Rates unavailable — amounts in mixed currencies ({origCurrencies.join(', ')}). Values may not be comparable.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChartCard title="Paid by member" currencyLabel={baseCurrency}>
              <PieChartMini data={payerData} colors={PALETTE} />
            </ChartCard>
            <ChartCard title="By category" currencyLabel={baseCurrency}>
              <PieChartMini data={catData.map((d) => ({ ...d, name: d.name }))} colors={catData.map((d) => CAT_COLOR[d.key] || '#7a8290')} />
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, currencyLabel, children }) {
  return (
    <div className="rounded-xl border border-ink-charcoal/10 bg-cream-pale/30 p-2">
      <p className="tt-label text-ink-deep/50 mb-1.5 px-0.5">{title} · {currencyLabel}</p>
      {children}
    </div>
  );
}

function PieChartMini({ data, colors }) {
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="70%"
            innerRadius="40%"
            paddingAngle={1}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} stroke="hsl(var(--card))" strokeWidth={1.5} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-lg border border-ink-charcoal/15 bg-card px-2.5 py-1.5 shadow-md text-xs">
                  <p className="font-semibold text-ink-deep">{d.name}</p>
                  <p className="text-ink-deep/60">{formatCurrency(d.value)}</p>
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: '11px', lineHeight: '1.4', maxHeight: '60px', overflow: 'hidden' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}