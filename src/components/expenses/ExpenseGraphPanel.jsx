import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { formatCurrency, EXPENSE_CATEGORIES } from '@/lib/gatheringHelpers';

const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));
const CAT_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label]));
const PALETTE = ['#e05c48', '#1e2633', '#f07865', '#c8493a', '#7a8290', '#0ea5e9', '#8b5cf6', '#10b981'];

// Expense graph overlay — same sizing/layout as the Journey/Agent map overlay
// (tt-card p-3, rendered in the StickyBar mapRow slot via PageToolbar).
//
// Mixed-currency correctness: conversion to the base currency is only used when
// it is PROVEN for EVERY included expense (same-currency identity, persisted
// snapshot, or live rate). When ANY expense lacks a proven conversion —
// including a single foreign currency with no rate — amounts are NEVER
// manufactured into the base currency. Instead a per-original-currency
// selector switches between independent charts whose amounts are the real
// original amounts in that currency. The tooltip and legend always show the
// explicit selected currency, real values, and percentages.
//
// Amounts are validated finite/nonnegative. The legend is rendered as
// accessible text with values + percentages (not hidden clipped recharts
// labels). Empty/zero data shows a quiet empty state.
export default function ExpenseGraphPanel({ expenses, memberById, expenseInBase, displayFor, baseCurrency, ratesAvailable, scope }) {
  const scopeLabel = scope === 'mine' ? 'Your paid expenses' : 'All expenses';

  // Validate amounts finite/nonnegative.
  const valid = (expenses || []).filter((e) => {
    const n = Number(e.amount);
    return Number.isFinite(n) && n >= 0;
  });

  // Per-expense display {amount, currency}. Conversion is proven when the
  // display currency equals the base currency; otherwise the expense fell back
  // to its original currency and must NOT be summed into a base-currency total.
  const withDisplay = valid.map((e) => ({ e, disp: displayFor(e) }));
  const base = (baseCurrency || 'USD').toUpperCase();
  const allProven = withDisplay.length > 0 && withDisplay.every(({ disp }) => (disp.currency || '').toUpperCase() === base);

  // Per-original-currency selector state for the mixed/unproven branch. Must
  // be declared before any early return (Rules of Hooks).
  const [selCur, setSelCur] = useState('');

  if (!withDisplay.length) {
    return (
      <div className="tt-card p-3">
        <Header label={scopeLabel} total={0} currency={base} />
        <div className="flex flex-col items-center justify-center text-center py-5 px-4">
          <BarChart3 className="w-6 h-6 text-terra/40 mb-1.5" />
          <p className="text-xs text-ink-deep/70">No expenses to chart yet.</p>
          <p className="text-[11px] text-ink-deep/50 mt-0.5">Add expenses to see the breakdown.</p>
        </div>
      </div>
    );
  }

  if (allProven) {
    // Single base-currency chart — every amount is genuinely in base.
    const byPayer = {};
    withDisplay.forEach(({ e, disp }) => {
      const amt = Number(disp.amount) || 0;
      const key = e.payer_member_id;
      if (!byPayer[key]) byPayer[key] = { name: memberById[key]?.full_name || 'Unknown', value: 0 };
      byPayer[key].value += amt;
    });
    const payerData = Object.values(byPayer).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

    const byCat = {};
    withDisplay.forEach(({ e, disp }) => {
      const amt = Number(disp.amount) || 0;
      const key = e.category || 'other';
      if (!byCat[key]) byCat[key] = { key, name: CAT_LABEL[key] || 'Other', value: 0 };
      byCat[key].value += amt;
    });
    const catData = Object.values(byCat).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

    const total = payerData.reduce((s, d) => s + d.value, 0);

    return (
      <div className="tt-card p-3">
        <Header label={scopeLabel} total={total} currency={base} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ChartCard title="Paid by member" currency={base}>
            <PieChartMini data={payerData} colors={PALETTE} currency={base} />
          </ChartCard>
          <ChartCard title="By category" currency={base}>
            <PieChartMini data={catData.map((d) => ({ ...d, name: d.name }))} colors={catData.map((d) => CAT_COLOR[d.key] || '#7a8290')} currency={base} />
          </ChartCard>
        </div>
      </div>
    );
  }

  // Mixed/unproven: per-original-currency selector + independent charts using
  // the REAL original amounts (no manufactured conversion).
  const byCurrency = {};
  withDisplay.forEach(({ e }) => {
    const cur = (e.currency || 'USD').toUpperCase();
    if (!byCurrency[cur]) byCurrency[cur] = [];
    byCurrency[cur].push(e);
  });
  const currencies = Object.keys(byCurrency).sort();
  const activeCur = currencies.includes(selCur) ? selCur : currencies[0];
  const curExpenses = byCurrency[activeCur] || [];

  const byPayer = {};
  curExpenses.forEach((e) => {
    const amt = Number(e.amount) || 0;
    const key = e.payer_member_id;
    if (!byPayer[key]) byPayer[key] = { name: memberById[key]?.full_name || 'Unknown', value: 0 };
    byPayer[key].value += amt;
  });
  const payerData = Object.values(byPayer).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

  const byCat = {};
  curExpenses.forEach((e) => {
    const amt = Number(e.amount) || 0;
    const key = e.category || 'other';
    if (!byCat[key]) byCat[key] = { key, name: CAT_LABEL[key] || 'Other', value: 0 };
    byCat[key].value += amt;
  });
  const catData = Object.values(byCat).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

  const total = payerData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="tt-card p-3">
      <Header label={scopeLabel} total={total} currency={activeCur} />
      <p className="text-[11px] text-ink-deep/55 flex items-center gap-1 px-1 mb-2">
        <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600" />
        Rates unavailable for some currencies — showing original amounts per currency.
      </p>
      {currencies.length > 1 && (
        <div className="flex gap-1.5 mb-2 px-0.5 flex-wrap">
          {currencies.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSelCur(c)}
              className={`px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold border transition-colors ${c === activeCur ? 'border-terra/40 bg-terra/10 text-terra-deep' : 'border-ink-charcoal/15 bg-cream-pale text-ink-deep/60'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ChartCard title="Paid by member" currency={activeCur}>
          <PieChartMini data={payerData} colors={PALETTE} currency={activeCur} />
        </ChartCard>
        <ChartCard title="By category" currency={activeCur}>
          <PieChartMini data={catData.map((d) => ({ ...d, name: d.name }))} colors={catData.map((d) => CAT_COLOR[d.key] || '#7a8290')} currency={activeCur} />
        </ChartCard>
      </div>
    </div>
  );
}

function Header({ label, total, currency }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      <BarChart3 className="w-4 h-4 text-terra-deep" />
      <h3 className="font-display text-sm font-bold text-ink-deep">{label}</h3>
      <span className="text-[0.6875rem] text-ink-deep/45 ml-auto">{formatCurrency(total, currency)}</span>
    </div>
  );
}

function ChartCard({ title, currency, children }) {
  return (
    <div className="rounded-xl border border-ink-charcoal/10 bg-cream-pale/30 p-2">
      <p className="tt-label text-ink-deep/50 mb-1.5 px-0.5">{title} · {currency}</p>
      {children}
    </div>
  );
}

function PieChartMini({ data, colors, currency }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%" paddingAngle={1}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} stroke="hsl(var(--card))" strokeWidth={1.5} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
              return (
                <div className="rounded-lg border border-ink-charcoal/15 bg-card px-2.5 py-1.5 shadow-md text-xs">
                  <p className="font-semibold text-ink-deep">{d.name}</p>
                  <p className="text-ink-deep/60">{formatCurrency(d.value, currency)}</p>
                  <p className="text-ink-deep/45">{pct}% of total</p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Accessible legend: values + percentages as real text, not clipped */}
      <ul className="mt-1.5 space-y-1 px-0.5">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={i} className="flex items-center gap-1.5 text-[11px] text-ink-deep/70">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate flex-1 min-w-0">{d.name}</span>
              <span className="shrink-0 tabular-nums">{formatCurrency(d.value, currency)}</span>
              <span className="shrink-0 text-ink-deep/45 tabular-nums w-8 text-right">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}