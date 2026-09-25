import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useExpensesData } from '@/hooks/useExpensesData';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import { canSeeExpenses, canAddExpense, formatCurrency } from '@/lib/gatheringHelpers';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ExpenseTimelineCard from '@/components/tt/cards/ExpenseTimelineCard';
import PageToolbar from '@/components/tt/PageToolbar';
import { Timeline, TimelineDay } from '@/components/tt/Timeline';
import { Button } from '@/components/ui/button';
import CurrencySelect from '@/components/expenses/CurrencySelect';
import { Plus, Receipt as ReceiptIcon, Wallet, AlertTriangle, ChevronRight, Scale, FileText } from 'lucide-react';
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
                      <Skeleton className="w-10 h-10 rounded-xl" />
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

export default function GatheringExpenses() {
  const d = useExpensesData();
  const { gatheringId, setFab, role, currentMember } = d;
  const { scope, setScope } = useViewPrefs(gatheringId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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

  const { expenses, splits, members, baseCurrency, changeBaseCurrency, currencyOptions, balances, splitsByExpense, memberById, conv, ratesAvailable, ratesLoading, ratesAsOf, ratesError } = d;

  const visibleExpenses = scope === 'mine'
    ? expenses.filter((e) => e.payer_member_id === currentMember?.id || (splitsByExpense[e.id] || []).some((s) => s.member_id === currentMember?.id))
    : expenses;

  const me = currentMember;
  const groupTotal = expenses.reduce((s, e) => s + conv(e.amount, e.currency), 0);
  const myBalance = balances[me?.id] || 0;
  const unsettledIds = new Set(expenses.filter((e) => !e.settled).map((e) => e.id));
  const myPaid = expenses.filter((e) => !e.settled && e.payer_member_id === me?.id).reduce((s, e) => s + conv(e.amount, e.currency), 0);
  const myShare = splits.filter((s) => unsettledIds.has(s.expense_id) && s.member_id === me?.id).reduce((s, sp) => s + conv(sp.amount, d.expCurrency[sp.expense_id]), 0);

  // Chronological ascending + day grouping, mirroring the Journey timeline.
  // Expense dates are date-only (YYYY-MM-DD), so lexical sort == chronological.
  const sorted = [...visibleExpenses].sort((a, b) => new Date(a.date || a.created_date) - new Date(b.date || b.created_date));
  const byDay = {};
  sorted.forEach((e) => {
    const k = e.date || 'unscheduled';
    (byDay[k] = byDay[k] || []).push(e);
  });
  const days = Object.keys(byDay).sort();

  // Rail display amount/currency: converted to the gathering's display currency
  // when live rates are available, otherwise the original amount + currency
  // (matching the dashboard's "showing original amounts" fallback).
  const railDisplay = (exp) => ratesAvailable
    ? { amount: conv(exp.amount, exp.currency), currency: baseCurrency }
    : { amount: exp.amount, currency: exp.currency || 'USD' };

  async function deleteExpense(exp) {
    if (!confirm('Delete this expense?')) return;
    await base44.entities.ExpenseSplit.deleteMany({ expense_id: exp.id });
    await base44.entities.Expense.delete(exp.id);
    d.reload();
  }

  return (
    <PageToolbar
      scope={scope}
      setScope={setScope}
      showImagesToggle={false}
      onAdd={() => { setEditing(null); setOpen(true); }}
      canAdd={canAddExpense(role)}
    >
      <div className="space-y-5">
      {/* Compact personal dashboard */}
      <section className="tt-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-terra-deep" />
            <span className="text-sm font-semibold text-ink-deep">Your balance</span>
          </div>
          <CurrencySelect value={baseCurrency} onChange={changeBaseCurrency} options={currencyOptions} triggerClass="w-44 h-9" />
        </div>
        <p className="text-[0.6875rem] text-ink-deep/45 mt-2 flex items-center gap-1">
          {ratesLoading ? 'Loading live rates…' :
            ratesAvailable ? `Live rates as of ${ratesAsOf ? new Date(ratesAsOf).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'now'}` :
            (<><AlertTriangle className="w-3 h-3" /> Exchange rates unavailable — showing original amounts.</>)}
        </p>
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          <div>
            <p className="tt-label text-ink-deep/40">You paid</p>
            <p className="font-display text-lg font-bold text-ink-deep truncate">{formatCurrency(myPaid, baseCurrency)}</p>
          </div>
          <div>
            <p className="tt-label text-ink-deep/40">Your share</p>
            <p className="font-display text-lg font-bold text-ink-deep truncate">{formatCurrency(myShare, baseCurrency)}</p>
          </div>
          <div>
            <p className="tt-label text-ink-deep/40">Net</p>
            <p className={`font-display text-lg font-bold truncate ${myBalance > 0.01 ? 'text-terra-deep' : myBalance < -0.01 ? 'text-ink-deep/70' : 'text-ink-deep/40'}`}>
              {myBalance > 0.01 ? '+' : ''}{formatCurrency(myBalance, baseCurrency)}
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-deep/55 mt-2">
          {myBalance > 0.01 ? `You are owed ${formatCurrency(myBalance, baseCurrency)}` : myBalance < -0.01 ? `You owe ${formatCurrency(Math.abs(myBalance), baseCurrency)}` : 'You are settled up.'}
        </p>
      </section>

      {/* Group total + navigation to Running Balance / Statement */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40">Group total</p>
          <p className="font-display text-xl font-bold text-ink-deep mt-1 truncate">{formatCurrency(groupTotal, baseCurrency)}</p>
          <p className="text-xs text-ink-deep/50 mt-1">{expenses.length} expense{expenses.length === 1 ? '' : 's'}</p>
        </div>
        <Link to={`/gathering/${gatheringId}/expenses/balance`} className="tt-card p-4 flex items-center gap-3 hover:border-terra/30 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-terra/10 flex items-center justify-center shrink-0"><Scale className="w-5 h-5 text-terra-deep" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink-deep text-sm">Running balance</p>
            <p className="text-xs text-ink-deep/50">Who owes whom</p>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-deep/30 shrink-0" />
        </Link>
        <Link to={`/gathering/${gatheringId}/expenses/statement/${currentMember?.id || ''}`} className="tt-card p-4 flex items-center gap-3 hover:border-terra/30 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-terra/10 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-terra-deep" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink-deep text-sm">My statement</p>
            <p className="text-xs text-ink-deep/50">Your full breakdown</p>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-deep/30 shrink-0" />
        </Link>
      </section>

      {/* Expense timeline — same rail, day markers and card rhythm as Journey */}
      <section>
        <h3 className="tt-label text-foreground/50 mb-2.5">{scope === 'mine' ? 'Your expenses' : 'All expenses'}</h3>
        {visibleExpenses.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title={scope === 'mine' ? 'None involving you yet' : 'No expenses yet'}
            body={scope === 'mine' ? 'Expenses you pay or are split on will appear here.' : 'Add the first shared cost — dinner, gas, a rental — and TOGETTHERE splits it fairly and tracks who owes whom.'}
            action={canAddExpense(role) ? (
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
                        canEdit={role === 'owner' || (role === 'member' && exp.payer_member_id === currentMember?.id)}
                        onEdit={() => { setEditing(exp); setOpen(true); }}
                        onDelete={() => deleteExpense(exp)}
                        displayAmount={disp.amount}
                        displayCurrency={disp.currency}
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
          onClose={() => setOpen(false)}
          onSaved={d.reload}
        />
      )}
    </PageToolbar>
  );
}