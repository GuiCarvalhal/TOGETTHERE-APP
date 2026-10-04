import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import { OVERLAY_VIEWPORT_CLASS } from '@/lib/overlayViewport';

const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));
const PALETTE = ['#e05c48', '#1e2633', '#f07865', '#c8493a', '#7a8290', '#0ea5e9', '#8b5cf6', '#10b981'];

// Expense graph overlay — identical outer sizing to the Journey/Agent map
// overlay (tt-card p-3, OVERLAY_VIEWPORT_CLASS viewport). Always TWO equal
// columns side by side at every width (never stacks, even at 320px mobile).
// Header, optional currency selector/warning, two donut charts and their
// internally scrollable legends all fit within the same map-sized bounded
// viewport. All branches (empty, zero, mixed-currency, error) preserve the
// same bounded footprint via the shared ViewportShell.
//
// Mixed-currency correctness: conversion to the base currency is only used
// when it is PROVEN for EVERY included expense (same-currency identity,
// persisted snapshot, or live rate). When ANY expense lacks a proven
// conversion, a per-original-currency selector switches between independent
// charts whose amounts are the real original amounts in that currency. The
// tooltip and legend always show the explicit selected currency, real
// values, and percentages.
//
// Amounts are validated finite/nonnegative. The legend is rendered as
// accessible text with values + percentages (not hidden clipped recharts
// labels). Empty/zero/all-zero data shows a quiet empty state inside the
// same bounded viewport.
function ViewportShell({ children }) {
  return (
    <div className="tt-card p-3">
      <div className={`${OVERLAY_VIEWPORT_CLASS} flex flex-col min-h-0 min-w-0`}>
        {children}
      </div>
    </div>
  );
}

function Header({ label, total, currency, fmt }) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 mb-1 px-0.5">
      <BarChart3 className="w-3.5 h-3.5 text-terra-deep shrink-0" />
      <h3 className="font-display text-xs font-bold text-ink-deep truncate">{label}</h3>
      <span className="text-[0.625rem] text-ink-deep/45 ml-auto shrink-0 tabular-nums">{fmt.formatCurrency(total, currency)}</span>
    </div>
  );
}

function EmptyBody({ icon: Icon, title, body }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center min-h-0 px-4">
      <Icon className="w-6 h-6 text-terra/40 mb-1.5" />
      <p className="text-xs text-ink-deep/70">{title}</p>
      {body && <p className="text-[11px] text-ink-deep/50 mt-0.5">{body}</p>}
    </div>
  );
}

function ChartCard({ title, currency, children }) {
  return (
    <div className="rounded-xl border border-ink-charcoal/10 bg-cream-pale/30 p-1.5 flex flex-col min-h-0 overflow-hidden">
      <p className="shrink-0 tt-label text-ink-deep/50 mb-1 px-0.5 text-[0.625rem]">{title} · {currency}</p>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function PieChartMini({ data, colors, currency, fmt, t }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0 || data.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-[10px] text-ink-deep/40 min-h-0">{t('expenseGraph.noData')}</div>;
  }
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 w-full">
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
                    <p className="text-ink-deep/60">{fmt.formatCurrency(d.value, currency)}</p>
                    <p className="text-ink-deep/45">{t('expenseGraph.pctOfTotal', { pct })}</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="shrink-0 mt-0.5 space-y-0.5 px-0.5 overflow-y-auto tt-no-scrollbar max-h-[45%]">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={i} className="flex items-center gap-1 text-[10px] text-ink-deep/70">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate flex-1 min-w-0">{d.name}</span>
              <span className="shrink-0 tabular-nums">{fmt.formatCurrency(d.value, currency)}</span>
              <span className="shrink-0 text-ink-deep/45 tabular-nums w-7 text-right">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ExpenseGraphPanel({ expenses, memberById, expenseInBase, displayFor, baseCurrency, ratesAvailable, scope }) {
  const { t, fmt } = useI18n();
  const scopeLabel = scope === 'mine' ? t('expenseGraph.yourPaid') : t('expenseGraph.allExpenses');
  const catLabel = (key) => t('expenseCategories.' + key) || t('expenseCategories.other');

  const valid = (expenses || []).filter((e) => {
    const n = Number(e.amount);
    return Number.isFinite(n) && n >= 0;
  });

  const withDisplay = valid.map((e) => ({ e, disp: displayFor(e) }));
  const base = (baseCurrency || 'USD').toUpperCase();
  const allProven = withDisplay.length > 0 && withDisplay.every(({ disp }) => (disp.currency || '').toUpperCase() === base);

  const [selCur, setSelCur] = useState('');

  if (!withDisplay.length) {
    return (
      <ViewportShell>
        <Header label={scopeLabel} total={0} currency={base} fmt={fmt} />
        <EmptyBody icon={BarChart3} title={t('expenseGraph.noExpensesChart')} body={t('expenseGraph.noExpensesChartBody')} />
      </ViewportShell>
    );
  }

  if (allProven) {
    const byPayer = {};
    withDisplay.forEach(({ e, disp }) => {
      const amt = Number(disp.amount) || 0;
      const key = e.payer_member_id;
      if (!byPayer[key]) byPayer[key] = { name: memberById[key]?.full_name || t('expenseGraph.unknown'), value: 0 };
      byPayer[key].value += amt;
    });
    const payerData = Object.values(byPayer).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

    const byCat = {};
    withDisplay.forEach(({ e, disp }) => {
      const amt = Number(disp.amount) || 0;
      const key = e.category || 'other';
      if (!byCat[key]) byCat[key] = { key, name: catLabel(key), value: 0 };
      byCat[key].value += amt;
    });
    const catData = Object.values(byCat).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

    const total = payerData.reduce((s, d) => s + d.value, 0);

    if (payerData.length === 0 && catData.length === 0) {
      return (
        <ViewportShell>
          <Header label={scopeLabel} total={0} currency={base} fmt={fmt} />
          <EmptyBody icon={BarChart3} title={t('expenseGraph.noAmounts')} />
        </ViewportShell>
      );
    }

    return (
      <ViewportShell>
        <Header label={scopeLabel} total={total} currency={base} fmt={fmt} />
        <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
          <ChartCard title={t('expenseGraph.paidByMember')} currency={base}>
            <PieChartMini data={payerData} colors={PALETTE} currency={base} fmt={fmt} t={t} />
          </ChartCard>
          <ChartCard title={t('expenseGraph.byCategory')} currency={base}>
            <PieChartMini data={catData.map((d) => ({ ...d, name: d.name }))} colors={catData.map((d) => CAT_COLOR[d.key] || '#7a8290')} currency={base} fmt={fmt} t={t} />
          </ChartCard>
        </div>
      </ViewportShell>
    );
  }

  // Mixed/unproven: per-original-currency selector + independent charts.
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
    if (!byPayer[key]) byPayer[key] = { name: memberById[key]?.full_name || t('expenseGraph.unknown'), value: 0 };
    byPayer[key].value += amt;
  });
  const payerData = Object.values(byPayer).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

  const byCat = {};
  curExpenses.forEach((e) => {
    const amt = Number(e.amount) || 0;
    const key = e.category || 'other';
    if (!byCat[key]) byCat[key] = { key, name: catLabel(key), value: 0 };
    byCat[key].value += amt;
  });
  const catData = Object.values(byCat).filter((d) => d.value > 0.005).sort((a, b) => b.value - a.value);

  const total = payerData.reduce((s, d) => s + d.value, 0);

  if (payerData.length === 0 && catData.length === 0) {
    return (
      <ViewportShell>
        <Header label={scopeLabel} total={0} currency={activeCur} fmt={fmt} />
        <EmptyBody icon={BarChart3} title={t('expenseGraph.noAmountsCurrency')} />
      </ViewportShell>
    );
  }

  return (
    <ViewportShell>
      <Header label={scopeLabel} total={total} currency={activeCur} fmt={fmt} />
      <div className="shrink-0 flex items-center gap-1.5 px-0.5 mb-1">
        <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600" aria-hidden="true" />
        <span className="text-[10px] text-ink-deep/55 truncate shrink-0 max-w-[35%]" title={t('expenseGraph.ratesUnavailableMixed')}>
          {t('expenseGraph.ratesUnavailableMixed')}
        </span>
        {currencies.length > 1 && (
          <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto tt-no-scrollbar" role="tablist" aria-label={t('expenseGraph.currencySelector')}>
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={c === activeCur}
                onClick={() => setSelCur(c)}
                className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${c === activeCur ? 'border-terra/40 bg-terra/10 text-terra-deep' : 'border-ink-charcoal/15 bg-cream-pale text-ink-deep/60'}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
        <ChartCard title={t('expenseGraph.paidByMember')} currency={activeCur}>
          <PieChartMini data={payerData} colors={PALETTE} currency={activeCur} fmt={fmt} t={t} />
        </ChartCard>
        <ChartCard title={t('expenseGraph.byCategory')} currency={activeCur}>
          <PieChartMini data={catData.map((d) => ({ ...d, name: d.name }))} colors={catData.map((d) => CAT_COLOR[d.key] || '#7a8290')} currency={activeCur} fmt={fmt} t={t} />
        </ChartCard>
      </div>
    </ViewportShell>
  );
}