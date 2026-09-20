import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import {
  canSeeExpenses, canAddExpense, computeBalances, settleUp, formatCurrency, formatDate, EXPENSE_CATEGORIES,
} from '@/lib/gatheringHelpers';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AttachmentChip from '@/components/tt/AttachmentChip';
import usePolling from '@/hooks/usePolling';
import { Plus, Pencil, Check, Loader2, ArrowRight, Receipt as ReceiptIcon, Calculator } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';

const CAT_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label]));

export default function GatheringExpenses() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const [expenses, setExpenses] = useState([]);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [convertTo, setConvertTo] = useState('EUR');
  const [convertResult, setConvertResult] = useState(null);
  const [convertLoading, setConvertLoading] = useState(false);

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
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
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
      <section>
        <Skeleton className="h-4 w-28 mb-3" />
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="tt-card p-5 flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" tone="cream" />
              <div className="flex-1 space-y-2"><Skeleton className="h-5 w-1/2" tone="cream" /><Skeleton className="h-3 w-2/3" tone="cream" /><Skeleton className="h-3 w-1/3" tone="cream" /></div>
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
  const balances = computeBalances(expenses, splits, participantMembers.map((m) => m.id));
  const settle = settleUp(balances);
  const splitsByExpense = {};
  splits.forEach((s) => { (splitsByExpense[s.expense_id] = splitsByExpense[s.expense_id] || []).push(s); });

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

  async function runConvert() {
    if (!expenses.filter((e) => !e.settled).length) return;
    setConvertLoading(true);
    try {
      const items = expenses.filter((e) => !e.settled).map((e) => ({ amount: e.amount, currency: e.currency || 'USD' }));
      const res = await base44.functions.invoke('convertCurrency', { items, to: (convertTo || 'USD').toUpperCase() });
      setConvertResult(res.data || res);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Conversion failed');
    } finally {
      setConvertLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold">Expenses</h2>
        <p className="text-cream/60 text-sm mt-1">Shared costs, fair splits, and who owes whom — all settled up.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-terra" /></div>
      ) : (
        <>
          {/* Currency converter — read-only display, does not alter expenses */}
          <section className="tt-card p-4 flex items-center gap-2 flex-wrap">
            <Calculator className="w-5 h-5 text-terra-deep shrink-0" />
            <span className="text-sm text-ink-deep/70">Unsettled total in</span>
            <Input value={convertTo} onChange={(e) => setConvertTo(e.target.value.toUpperCase().slice(0, 3))} placeholder="EUR" className="w-20 h-9 bg-cream-pale border-ink-charcoal/20 text-ink-deep uppercase" />
            <Button type="button" onClick={runConvert} disabled={convertLoading} className="bg-terra hover:bg-terra-deep text-cream rounded-full h-9">
              {convertLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
              Convert
            </Button>
            {convertResult && (
              <span className="text-sm font-semibold text-ink-deep">≈ {formatCurrency(convertResult.total, convertResult.to)}</span>
            )}
          </section>

          {/* Balances */}
          <section>
            <h3 className="tt-label text-cream/50 mb-3">Running balances</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {participantMembers.map((m) => {
                const bal = balances[m.id] || 0;
                const positive = bal > 0.01;
                const negative = bal < -0.01;
                return (
                  <div key={m.id} className="tt-card p-4 flex items-center gap-3">
                    <MemberAvatar member={m} size="md" />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-deep text-sm truncate">{m.full_name}</p>
                      <p className={`text-sm font-semibold ${positive ? 'text-terra-deep' : negative ? 'text-ink-deep/70' : 'text-ink-deep/40'}`}>
                        {positive ? 'is owed ' : negative ? 'owes ' : 'settled '}{formatCurrency(Math.abs(bal), expenses[0]?.currency || 'USD')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Settle up */}
          {settle.length > 0 && (
            <section>
              <h3 className="tt-label text-cream/50 mb-3">Settle up suggestions</h3>
              <div className="tt-card p-5 space-y-3">
                {settle.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <MemberAvatar member={memberById[t.from]} size="sm" />
                    <span className="text-sm text-ink-deep font-medium min-w-0 truncate">{memberById[t.from]?.full_name}</span>
                    <ArrowRight className="w-4 h-4 text-terra-deep mx-1 shrink-0" />
                    <MemberAvatar member={memberById[t.to]} size="sm" />
                    <span className="text-sm text-ink-deep font-medium min-w-0 truncate">{memberById[t.to]?.full_name}</span>
                    <span className="ml-auto font-display text-lg font-bold text-terra-deep shrink-0">{formatCurrency(t.amount, expenses[0]?.currency || 'USD')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Expense list */}
          <section>
            <h3 className="tt-label text-cream/50 mb-3">All expenses</h3>
            {expenses.length === 0 ? (
              <EmptyState
                icon={ReceiptIcon}
                title="No expenses yet"
                body="Add the first shared cost — dinner, gas, a rental — and TOGETTHERE splits it fairly and tracks who owes whom."
                action={canAddExpense(role) ? (
                  <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep">
                    <Plus className="w-4 h-4" /> Add expense
                  </button>
                ) : undefined}
              />
            ) : (
              <div className="space-y-3">
                {expenses.map((exp) => {
                  const payer = memberById[exp.payer_member_id];
                  const esplits = splitsByExpense[exp.id] || [];
                  const canEdit = role === 'owner' || (role === 'member' && exp.payer_member_id === currentMember?.id);
                  return (
                    <div key={exp.id} className={`tt-card p-4 sm:p-5 ${exp.settled ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cream-pale border border-ink-charcoal/15 flex items-center justify-center shrink-0">
                          <ReceiptIcon className="w-5 h-5 text-terra-deep" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2 flex-wrap">
                              <h3 className="font-display text-lg font-bold text-ink-deep">{exp.title}</h3>
                              <span className="px-2 py-0.5 rounded-full bg-cream-pale text-[0.625rem] font-semibold uppercase tracking-wide text-ink-deep/60 border border-ink-charcoal/10">{CAT_LABEL[exp.category]}</span>
                              {exp.settled && <span className="px-2 py-0.5 rounded-full bg-terra/15 text-[0.625rem] font-semibold uppercase tracking-wide text-terra-deep">Settled</span>}
                            </div>
                            <span className="font-display text-xl font-bold text-ink-deep shrink-0 whitespace-nowrap">{formatCurrency(exp.amount, exp.currency)}</span>
                          </div>
                          <p className="text-sm text-ink-deep/60 mt-0.5">
                            {payer?.full_name} · {formatDate(exp.date)}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {esplits.map((s) => (
                              <span key={s.member_id} className="text-xs text-ink-deep/60 px-2 py-0.5 rounded-full bg-cream-pale border border-ink-charcoal/10">
                                {memberById[s.member_id]?.full_name}: {formatCurrency(s.amount, exp.currency)}
                              </span>
                            ))}
                          </div>
                          {exp.receipt && (
                            <div className="mt-2">
                              <AttachmentChip url={exp.receipt} />
                            </div>
                          )}
                          {canEdit && (
                            <div className="flex items-center gap-1 mt-3 pt-2 border-t border-ink-charcoal/10">
                              <button onClick={() => toggleSettled(exp)} title={exp.settled ? 'Mark unsettled' : 'Mark settled'} className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg ${exp.settled ? 'text-terra-deep' : 'text-ink-deep/40 hover:text-terra-deep'} hover:bg-cream-pale`}><Check className="w-4 h-4" /></button>
                              <button onClick={() => { setEditing(exp); setOpen(true); }} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-deep/40 hover:text-terra-deep hover:bg-cream-pale"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteExpense(exp)} className="ml-auto p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-deep/40 hover:text-terra-deep hover:bg-cream-pale">✕</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

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