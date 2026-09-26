import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useGathering } from '@/lib/gatheringContext';
import { computeBalances, settleUp, COMMON_CURRENCIES } from '@/lib/gatheringHelpers';
import usePolling from '@/hooks/usePolling';

const LS_BASE = (gid) => `tt-exp-base-${gid}`;

// Shared expenses data layer for the three expense screens (home, Running
// Balance, Individual Statement). Loads expenses + splits + live exchange
// rates, derives the base/group currency (persisted per gathering, defaulting
// to the gathering's most common currency), and computes converted balances
// and settle-up transactions.
//
// Currency model (no USD round-trip at save; deterministic display):
//  - Canonical storage is the ORIGINAL entered amount + payment currency
//    (Expense.amount/currency) and per-person splits in that same currency
//    (ExpenseSplit.amount). Nothing is converted to USD when saving.
//  - At save time, createExpense also snapshots a display-currency amount
//    (Expense.display_amount / display_currency) using the live rate THEN, so
//    an old expense renders the same value forever — it never re-fetches a live
//    rate (no drift over time). Historical rows without a snapshot fall back.
//  - displayFor(expense) returns {amount, currency} applying, in order:
//      SAME-CURRENCY (payment === display) => original amount exactly, no
//        conversion, no round-trip;
//      SNAPSHOT (persisted display_amount in the current display currency) =>
//        the snapshot (no live rate);
//      FALLBACK => live USD conversion, or the original amount (in its own
//        currency) when rates are unavailable — the number is never mislabeled.
//  - splitInBase(split) is derived PROPORTIONALLY from its expense's base
//    amount, so a split and its expense always use the same rate and the
//    splits sum exactly to the expense's base amount (no mixed-rate /
//    double-conversion math; rounding happens only at the final balance).
export function useExpensesData() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const [expenses, setExpenses] = useState([]);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rates, setRates] = useState(null);
  const [ratesAsOf, setRatesAsOf] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState(null);
  const [baseCurrency, setBaseCurrency] = useState(() => {
    try { return localStorage.getItem(LS_BASE(gatheringId)) || 'USD'; } catch { return 'USD'; }
  });

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
    } finally {
      if (!silent) setLoading(false);
    }
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

  // Default base currency to the gathering's most common currency, unless the
  // user has already chosen one (persisted). Does not override an explicit choice.
  useEffect(() => {
    if (!expenses.length) return;
    let stored = null;
    try { stored = localStorage.getItem(LS_BASE(gatheringId)); } catch {}
    if (stored) { if (stored !== baseCurrency) setBaseCurrency(stored); return; }
    const counts = {};
    expenses.forEach((e) => { const c = (e.currency || 'USD').toUpperCase(); counts[c] = (counts[c] || 0) + 1; });
    const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (mode && mode !== baseCurrency) setBaseCurrency(mode);
  }, [expenses, gatheringId]);

  function changeBaseCurrency(c) {
    setBaseCurrency(c);
    try { localStorage.setItem(LS_BASE(gatheringId), c); } catch {}
  }

  const participantMembers = members.filter((m) => m.role === 'owner' || m.role === 'member');
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const expenseById = Object.fromEntries(expenses.map((e) => [e.id, e]));

  const rateOf = (c) => (c === 'USD' ? 1 : rates?.[String(c).toUpperCase()]);

  // {amount, currency} to display for an expense. The currency always matches
  // the amount: same-currency/snapshot/live-success => base; fallback (rates
  // unavailable or unknown) => the original payment currency, so a fallback
  // number is never mislabeled as the base currency.
  const displayFor = (e) => {
    const cur = (e.currency || 'USD').toUpperCase();
    const base = baseCurrency.toUpperCase();
    if (cur === base) return { amount: Number(e.amount || 0), currency: base };
    if (e.display_amount != null && e.display_currency && e.display_currency.toUpperCase() === base) {
      return { amount: Number(e.display_amount), currency: base };
    }
    if (!rates) return { amount: Number(e.amount || 0), currency: cur };
    const rCur = rateOf(cur);
    const rBase = rateOf(base);
    if (rCur == null || rBase == null) return { amount: Number(e.amount || 0), currency: cur };
    return { amount: (Number(e.amount || 0) / rCur) * rBase, currency: base };
  };

  // Canonical display-currency amount for a single expense (see rules above).
  const expenseInBase = (e) => displayFor(e).amount;

  // A split's display-currency share, derived PROPORTIONALLY from its expense's
  // base amount so both use the same rate and the splits sum to the expense.
  const splitInBase = (s) => {
    const e = expenseById[s.expense_id];
    if (!e) return 0;
    const base = expenseInBase(e);
    const amt = Number(e.amount || 0);
    if (!amt) return 0;
    return (Number(s.amount || 0) / amt) * base;
  };

  const ratesAvailable = !!rates && !ratesError;

  // Convert all amounts to the base currency before computing balances, using
  // the canonical per-expense amount + proportional splits (same rate per
  // expense, no mixed-rate math). `id` is carried so computeBalances can match
  // each expense's splits to it.
  const baseExpensesForBalances = expenses.map((e) => ({ id: e.id, payer_member_id: e.payer_member_id, amount: expenseInBase(e), settled: e.settled }));
  const baseSplitsForBalances = splits.map((s) => ({ expense_id: s.expense_id, member_id: s.member_id, amount: splitInBase(s) }));
  const balances = computeBalances(baseExpensesForBalances, baseSplitsForBalances, participantMembers.map((m) => m.id));
  const settle = settleUp(balances);

  const splitsByExpense = {};
  splits.forEach((s) => { (splitsByExpense[s.expense_id] = splitsByExpense[s.expense_id] || []).push(s); });

  const presentCurrencies = [...new Set(expenses.map((e) => (e.currency || 'USD').toUpperCase()))];
  const currencyOptions = [...new Set([...COMMON_CURRENCIES, ...presentCurrencies])];

  return {
    gatheringId, members, currentMember, role, setFab,
    expenses, splits, loading, error, reload: () => load(false),
    rates, ratesAsOf, ratesLoading, ratesError, ratesAvailable,
    baseCurrency, changeBaseCurrency, currencyOptions,
    participantMembers, memberById, expenseById,
    expenseInBase, splitInBase, displayFor,
    balances, settle, splitsByExpense,
  };
}