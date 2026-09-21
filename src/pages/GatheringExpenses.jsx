import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import {
  canSeeExpenses, canAddExpense, computeBalances, settleUp, formatCurrency,
  COMMON_CURRENCIES,
} from '@/lib/gatheringHelpers';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ExpenseCard from '@/components/tt/cards/ExpenseCard';
import PageToolbar from '@/components/tt/PageToolbar';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import MemberAvatar from '@/components/tt/MemberAvatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import usePolling from '@/hooks/usePolling';
import { Plus, ArrowRight, Receipt as ReceiptIcon, Wallet, AlertTriangle } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';

export default function GatheringExpenses() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const { scope, setScope, images, setImages } = useViewPrefs(gatheringId);
  const [expenses, setExpenses] = useState([]);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [baseTouched, setBaseTouched] = useState(false);
  const [rates, setRates] = useState(null);
  const [ratesAsOf, setRatesAsOf] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState(null);

  const denied = !canSeeExpenses(role);

  async function load(silent) {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const [es, sp] = await Promise.all([
        base44.entities.Expense.filter({ gathering_id: gatheringId }),
        base44.entities.ExpenseSplit.filter({ gathering_id: gatheringId }),
      ]);
      es.sort((a, b) => new Date(b.date || b.created_date) - new Date(a.date || a.created_date));
      setExpenses(es);
      setSplits(sp);
    } catch (e) {
      if (!silent) setError(e);
    } finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { load(); }, [gatheringId]);
  usePolling(() => load(true), 25000);

  async function loadRates() {
    setRatesLoading(true); setRatesError(null);
    try {
      const res = await base44.functions.invoke('getExchangeRates', {});
      const data = res.data || res;
      setRates(data.rates || null);
      setRatesAsOf(data.as_of || null);
    } catch (e) {
      setRatesError(e);
    } finally {
      setRatesLoading(false);
    }
  }
  useEffect(() => { loadRates(); }, []);

  // Default the base currency to the gathering's most common currency.
  useEffect(() => {
    if (!baseTouched && expenses.length) {
      const counts = {};
      expenses.forEach((e) => { const c = (e.currency || 'USD').toUpperCase(); counts[c] = (counts[c] || 0) + 1; });
      const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (mode && mode !== baseCurrency) setBaseCurrency(mode);
    }
  }, [expenses, baseTouched, baseCurrency]);

  useEffect(() => {
    if (canAddExpense(role)) {
      setFab({ label: 'Add Expense', icon: Plus, onClick: () => { setEditing(null); setOpen(true); } });
    }
    return () => setFab(null);
  }, [setFab, role]);

  if (denied) {
    return (
      <div className="tt-card p-10 text-center max-w-md mx-auto">
        <ReceiptIcon className="w-10 h-10 text-terra mx-auto mb-4" />
        <p className="font-display text-2xl mb-2 text-ink-deep">Viewers aren't part of expenses</p>
        <p className="text-ink-deep/60 text-sm">Expenses are only for trip participants. Ask the organizer to change your role to Member.</p>
      </div>
    );
  }
  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-full" />
      <section>
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="tt-card p-4 flex items-center gap-3">
              <Skeleton className="w-11 h-11 rounded-full" tone="cream" />
              <div className="space-y-2 flex-1"><Skeleton className="h-4 w-20" tone="cream" /><Skeleton className="h-3 w-16" tone="cream" /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
  if (error) return (
    <div className="tt-card p-10 text-center max-w-md mx-auto">
      <ReceiptIcon className="w-10 h-10 text-terra mx-auto mb-4" />
      <p className="font-display text-2xl mb-2 text-ink-deep">Couldn't load expenses</p>
      <p className="text-ink-deep/60 mb-6 text-sm">{error.message || 'Something went wrong.'}</p>
      <button onClick={load} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">Try again</button>
    </div>
  );

  const participantMembers = members.filter((m) => m.role === 'owner' || m.role === 'member');
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const expCurrency = Object.fromEntries(expenses.map((e) => [e.id, (e.currency || 'USD').toUpperCase()]));

  const rateOf = (c) => (c === 'USD' ? 1 : rates?.[String(c).toUpperCase()]);
  const toBase = (amount, currency) => {
    const cur = (currency || 'USD').toUpperCase();
    const base = baseCurrency.toUpperCase();
    if (!rates) return null;
    const rCur = rateOf(cur);
    const rBase = rateOf(base);
    if (rCur == null || rBase == null) return null;
    return (Number(amount || 0) / rCur) * rBase;
  };
  const conv = (amount, currency) => {
    const b = toBase(amount, currency);
    return b == null ? Number(amount || 0) : b;
  };
  const ratesAvailable = !!rates && !ratesError;

  // Convert all amounts to the base currency before computing balances, so
  // mixed-currency expenses (AUD, EUR, AED, USD…) are comparable.
  const baseExpensesForBalances = expenses.map((e) => ({ payer_member_id: e.payer_member_id, amount: conv(e.amount, e.currency), settled: e.settled }));
  const baseSplitsForBalances = splits.map((s) => ({ expense_id: s.expense_id, member_id: s.member_id, amount: conv(s.amount, expCurrency[s.expense_id]) }));
  const balances = computeBalances(baseExpensesForBalances, baseSplitsForBalances, participantMembers.map((m) => m.id));
  const settle = settleUp(balances);

  const splitsByExpense = {};
  splits.forEach((s) => { (splitsByExpense[s.expense_id] = splitsByExpense[s.expense_id] || []).push(s); });

  const visibleExpenses = scope === 'mine'
    ? expenses.filter((e) => e.payer_member_id === currentMember?.id || (splitsByExpense[e.id] || []).some((s) => s.member_id === currentMember?.id))
    : expenses;

  // Personal dashboard (unsettled, in base currency).
  const me = currentMember;
  const unsettledIds = new Set(expenses.filter((e) => !e.settled).map((e) => e.id));
  const myPaid = expenses.filter((e) => !e.settled && e.payer_member_id === me?.id).reduce((s, e) => s + conv(e.amount, e.currency), 0);
  const myShare = splits.filter((s) => unsettledIds.has(s.expense_id) && s.member_id === me?.id).reduce((s, sp) => s + conv(sp.amount, expCurrency[sp.expense_id]), 0);
  const myBalance = balances[me?.id] || 0;

  async function toggleSettled(exp) {
    try {
      await base44.functions.invoke('settleExpense', { gathering_id: gatheringId, expense_id: exp.id, settled: !exp.settled });
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not update expense');
    }
  }
  async function deleteExpense(exp) {
    if (!confirm('Delete this expense?')) return;
    await base44.entities.ExpenseSplit.deleteMany({ expense_id: exp.id });
    await base44.entities.Expense.delete(exp.id);
    load();
  }

  const presentCurrencies = [...new Set(expenses.map((e) => (e.currency || 'USD').toUpperCase()))];
  const currencyOptions = [...new Set([...COMMON_CURRENCIES, ...presentCurrencies])];

  return (
    <div className="space-y-6">
      <PageToolbar scope={scope} setScope={setScope} images={images} setImages={setImages} />

      {/* Personal dashboard + base currency */}
      <section className="tt-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-terra-deep" />
            <span className="text-sm font-semibold text-ink-deep">Your balance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-deep/50">in</span>
            <Select value={baseCurrency} onValueChange={(v) => { setBaseCurrency(v); setBaseTouched(true); }}>
              <SelectTrigger className="w-24 h-9 bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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

      {/* Running balances (all members) */}
      <section>
        <h3 className="tt-label text-foreground/50 mb-3">Running balances</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {participantMembers.map((m) => {
            const bal = balances[m.id] || 0;
            const positive = bal > 0.01;
            const negative = bal < -0.01;
            return (
              <div key={m.id} className="tt-card p-3.5 flex items-center gap-3">
                <MemberAvatar member={m} size="md" />
                <div className="min-w-0">
                  <p className="font-semibold text-ink-deep text-sm truncate">{m.full_name}</p>
                  <p className={`text-sm font-semibold ${positive ? 'text-terra-deep' : negative ? 'text-ink-deep/70' : 'text-ink-deep/40'}`}>
                    {positive ? 'is owed ' : negative ? 'owes ' : 'settled '}{formatCurrency(Math.abs(bal), baseCurrency)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Settle up suggestions */}
      {settle.length > 0 && (
        <section>
          <h3 className="tt-label text-foreground/50 mb-3">Settle up suggestions</h3>
          <div className="tt-card p-4 space-y-2.5">
            {settle.map((t, i) => (
              <div key={i} className="flex items-center gap-2 sm:gap-3 min-w-0">
                <MemberAvatar member={memberById[t.from]} size="sm" />
                <span className="text-sm text-ink-deep font-medium min-w-0 truncate">{memberById[t.from]?.full_name}</span>
                <ArrowRight className="w-4 h-4 text-terra-deep mx-1 shrink-0" />
                <MemberAvatar member={memberById[t.to]} size="sm" />
                <span className="text-sm text-ink-deep font-medium min-w-0 truncate">{memberById[t.to]?.full_name}</span>
                <span className="ml-auto font-display text-base font-bold text-terra-deep shrink-0">{formatCurrency(t.amount, baseCurrency)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Expense list */}
      <section>
        <h3 className="tt-label text-foreground/50 mb-3">{scope === 'mine' ? 'Your expenses' : 'All expenses'}</h3>
        {visibleExpenses.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title={scope === 'mine' ? 'None involving you yet' : 'No expenses yet'}
            body={scope === 'mine' ? 'Expenses you pay or are split on will appear here.' : 'Add the first shared cost — dinner, gas, a rental — and TOGETTHERE splits it fairly and tracks who owes whom.'}
            action={canAddExpense(role) ? (
              <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep">
                <Plus className="w-4 h-4" /> Add expense
              </button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {visibleExpenses.map((exp) => (
              <ExpenseCard
                key={exp.id}
                exp={exp}
                payer={memberById[exp.payer_member_id]}
                splits={splitsByExpense[exp.id] || []}
                members={members}
                canEdit={role === 'owner' || (role === 'member' && exp.payer_member_id === currentMember?.id)}
                onToggleSettled={() => toggleSettled(exp)}
                onEdit={() => { setEditing(exp); setOpen(true); }}
                onDelete={() => deleteExpense(exp)}
                showImages={images}
                baseCurrency={baseCurrency}
                baseAmount={toBase(exp.amount, exp.currency)}
                rate={toBase(1, exp.currency)}
              />
            ))}
          </div>
        )}
      </section>

      {open && (
        <ExpenseForm
          gatheringId={gatheringId}
          members={members}
          currentMember={currentMember}
          expense={editing}
          splits={editing ? splitsByExpense[editing.id] || [] : []}
          onClose={() => setOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}