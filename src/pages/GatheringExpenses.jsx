import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useExpensesData } from '@/hooks/useExpensesData';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import { canSeeExpenses, canAddExpense, formatCurrency, EXPENSE_CATEGORIES, mineExpenses } from '@/lib/gatheringHelpers';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ExpenseTimelineCard from '@/components/tt/cards/ExpenseTimelineCard';
import PageToolbar from '@/components/tt/PageToolbar';
import FilterChips from '@/components/tt/FilterChips';
import { Timeline, TimelineDay } from '@/components/tt/Timeline';
import { Button } from '@/components/ui/button';
import CurrencySelect from '@/components/expenses/CurrencySelect';
import ExpenseGraphPanel from '@/components/expenses/ExpenseGraphPanel';
import { Plus, Receipt as ReceiptIcon, Wallet, AlertTriangle, Scale, FileText } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';

// Journey-style timeline skeleton: dashboard + nav placeholders, then the rail
// with day markers and rows (medallion + amount block + card) so loading reads
// the same as the Journey page.
function ExpenseTimelineSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 w-full" />
      <div className="grid sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-foreground/12" aria-hidden />
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 flex justify-center shrink-0">
                  <Skeleton className="w-10 h-10 rounded-full" />
                </div>
                <div className="space-y-2"><Skeleton className="h-3 w-14" /><Skeleton className="h-5 w-36" /></div>
              </div>
              <div className="space-y-3">
                {[0, 1].map((j) => (
                  <div key={j} className="flex gap-2">
                    <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <Skeleton className="h-3 w-10 mt-1.5" />
                    </div>
                    <div className="flex-1 tt-card p-3 space-y-2">
                      <Skeleton className="h-3 w-1/4" tone="cream" />
                      <Skeleton className="h-4 w-2/3" tone="cream" />
                      <Skeleton className="h-3 w-1/2" tone="cream" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CAT_FILTER_OPTIONS = [{ key: 'all', label: 'All' }, ...EXPENSE_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))];

export default function GatheringExpenses() {
  const d = useExpensesData();
  const { gatheringId, setFab, role, currentMember } = d;
  const { scope, setScope, images, setImages, graphOpen, setGraphOpen } = useViewPrefs(gatheringId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [catFilter, setCatFilter] = useState('all');

  // No floating Add button — the sticky PageToolbar Add button is the single
  // entry point, matching the Journey page.
  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  if (!canSeeExpenses(role)) {
    return (
      <div className="tt-card p-10 text-center max-w-md mx-auto">
        <ReceiptIcon className="w-10 h-10 text-terra mx-auto mb-4" />
        <p className="font-display text-2xl mb-2 text-ink-deep">Viewers aren't part of expenses</p>
        <p className="text-ink-deep/60 text-sm">Expenses are only for trip participants. Ask the organizer to change your role to Member.</p>
      </div>
    );
  }
  if (d.loading) return <ExpenseTimelineSkeleton />;
  if (d.error) return (
    <div className="tt-card p-10 text-center max-w-md mx-auto">
      <ReceiptIcon className="w-10 h-10 text-terra mx-auto mb-4" />
      <p className="font-display text-2xl mb-2 text-ink-deep">Couldn't load expenses</p>
      <p className="text-ink-deep/60 mb-6 text-sm">{d.error.message || 'Something went wrong.'}</p>
      <Button onClick={d.reload}>Try again</Button>
    </div>
  );

  const { expenses, splits, members, baseCurrency, changeBaseCurrency, currencyOptions, balances, splitsByExpense, memberById, expenseInBase, displayFor, ratesAvailable, ratesLoading, ratesAsOf, ratesError } = d;

  // Mine = expenses where the current member is the PAYER (not merely in the
  // split). Group = all gathering expenses. Uses the shared helper so the
  // payer-vs-split semantics are unit-tested.
  const visibleExpenses = scope === 'mine'
    ? mineExpenses(expenses, currentMember?.id)
    : expenses;
  // Category filter composes with scope + currency/settlement behavior: it
  // narrows only the timeline list. The summary (group total, your balance,
  // rates) stays on the full visible set so the financial picture is unchanged.
  const filteredExpenses = catFilter === 'all' ? visibleExpenses : visibleExpenses.filter((e) => e.category === catFilter);

  const me = currentMember;
  const groupTotal = expenses.reduce((s, e) => s + expenseInBase(e), 0);
  const myBalance = balances[me?.id] || 0;

  // Chronological ascending + day grouping, mirroring the Journey timeline.
  // Expense dates are date-only (YYYY-MM-DD), so lexical sort == chronological.
  const sorted = [...filteredExpenses].sort((a, b) => new Date(a.date || a.created_date) - new Date(b.date || b.created_date));
  const byDay = {};
  sorted.forEach((e) => {
    const k = e.date || 'unscheduled';
    (byDay[k] = byDay[k] || []).push(e);
  });
  const days = Object.keys(byDay).sort();

  // Rail display amount/currency: same-currency => original; snapshot =>
  // persisted display amount; otherwise live conversion (or original when rates
  // are unavailable). displayFor always returns the currency matching the amount.
  const railDisplay = (exp) => displayFor(exp);

  async function deleteExpense(exp) {
    await base44.entities.ExpenseSplit.deleteMany({ expense_id: exp.id });
    await base44.entities.Expense.delete(exp.id);
    d.reload();
  }

  const graphRow = (
    <ExpenseGraphPanel
      expenses={visibleExpenses}
      memberById={memberById}
      expenseInBase={expenseInBase}
      displayFor={displayFor}
      baseCurrency={baseCurrency}
      ratesAvailable={ratesAvailable}
      scope={scope}
    />
  );

  return (
    <PageToolbar
      scope={scope}
      setScope={setScope}
      images={images}
      setImages={setImages}
      showImagesToggle
      showGraphToggle
      graphOpen={graphOpen}
      setGraphOpen={setGraphOpen}
      graphRow={graphRow}
      onAdd={() => { setEditing(null); setOpen(true); }}
      canAdd={canAddExpense(role)}
      filterRow={<FilterChips options={CAT_FILTER_OPTIONS} value={catFilter} onChange={setCatFilter} />}
    >
      <div className="space-y-5">
      {/* Compact summary: group total, your balance, currency, balance + statement */}
      <section className="tt-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tt-label text-ink-deep/40">Group total</p>
            <p className="font-display text-xl font-bold text-ink-deep truncate">{formatCurrency(groupTotal, baseCurrency)}</p>
            <p className="text-xs text-ink-deep/50 mt-0.5">{expenses.length} expense{expenses.length === 1 ? '' : 's'}</p>
          </div>
          <CurrencySelect value={baseCurrency} onChange={changeBaseCurrency} options={currencyOptions} triggerClass="w-36 h-9 shrink-0" />
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-ink-charcoal/10">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet className="w-4 h-4 text-terra-deep shrink-0" />
            <span className="text-sm font-semibold text-ink-deep whitespace-nowrap">Your balance</span>
          </div>
          <p className={`font-display text-lg font-bold truncate ${myBalance > 0.01 ? 'text-terra-deep' : myBalance < -0.01 ? 'text-ink-deep/70' : 'text-ink-deep/40'}`}>
            {myBalance > 0.01 ? '+' : ''}{formatCurrency(myBalance, baseCurrency)}
          </p>
        </div>

        <p className="text-[0.6875rem] text-ink-deep/45 flex items-center gap-1">
          {ratesLoading ? 'Loading live rates…' :
            ratesAvailable ? `Live rates as of ${ratesAsOf ? new Date(ratesAsOf).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'now'}` :
            (<><AlertTriangle className="w-3 h-3" /> Exchange rates unavailable — showing original amounts.</>)}
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={`/gathering/${gatheringId}/expenses/balance`}><Scale /> Balance</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={`/gathering/${gatheringId}/expenses/statement/${currentMember?.id || ''}`}><FileText /> Individual Statement</Link>
          </Button>
        </div>
      </section>

      {/* Expense timeline — same rail, day markers and card rhythm as Journey */}
      <section>
        <h3 className="tt-label text-foreground/50 mb-2.5">{scope === 'mine' ? 'Your expenses' : 'All expenses'}</h3>
        {filteredExpenses.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title={catFilter !== 'all' ? 'No expenses of this type' : (scope === 'mine' ? 'None involving you yet' : 'No expenses yet')}
            body={catFilter !== 'all' ? 'Switch to All to see every expense, or pick another category.' : (scope === 'mine' ? 'Expenses you pay or are split on will appear here.' : 'Add the first shared cost — dinner, gas, a rental — and TOGETTHERE splits it fairly and tracks who owes whom.')}
            action={canAddExpense(role) && catFilter === 'all' ? (
              <Button onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus /> Add expense
              </Button>
            ) : undefined}
          />
        ) : (
          <Timeline>
            {days.map((day) => (
              <div key={day} className="space-y-3">
                <TimelineDay day={day} />
                <div className="space-y-3">
                  {byDay[day].map((exp) => {
                    const disp = railDisplay(exp);
                    return (
                      <ExpenseTimelineCard
                        key={exp.id}
                        exp={exp}
                        payer={memberById[exp.payer_member_id]}
                        splits={splitsByExpense[exp.id] || []}
                        members={members}
                        canEdit={role === 'owner' || role === 'admin' || (role === 'member' && exp.payer_member_id === currentMember?.id)}
                        onEdit={() => { setEditing(exp); setOpen(true); }}
                        displayAmount={disp.amount}
                        displayCurrency={disp.currency}
                        showImages={images}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </Timeline>
        )}
      </section>

      </div>
      {open && (
        <ExpenseForm
          gatheringId={gatheringId}
          members={members}
          currentMember={currentMember}
          expense={editing}
          splits={editing ? splitsByExpense[editing.id] || [] : []}
          baseCurrency={baseCurrency}
          onClose={() => setOpen(false)}
          onSaved={d.reload}
          onDelete={() => deleteExpense(editing)}
        />
      )}
    </PageToolbar>
  );
}