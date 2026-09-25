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
// and settle-up transactions. Balance/settlement math is identical to the
// beta — only the loading is centralized here.
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

  const presentCurrencies = [...new Set(expenses.map((e) => (e.currency || 'USD').toUpperCase()))];
  const currencyOptions = [...new Set([...COMMON_CURRENCIES, ...presentCurrencies])];

  return {
    gatheringId, members, currentMember, role, setFab,
    expenses, splits, loading, error, reload: () => load(false),
    rates, ratesAsOf, ratesLoading, ratesError, ratesAvailable,
    baseCurrency, changeBaseCurrency, currencyOptions,
    participantMembers, memberById, expCurrency,
    toBase, conv, balances, settle, splitsByExpense,
  };
}