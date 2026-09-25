import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useExpensesData } from '@/hooks/useExpensesData';
import { formatCurrency } from '@/lib/gatheringHelpers';
import MemberAvatar from '@/components/tt/MemberAvatar';
import CurrencySelect from '@/components/expenses/CurrencySelect';
import Skeleton from '@/components/tt/Skeleton';
import { ChevronLeft, ArrowRight, Scale, AlertTriangle } from 'lucide-react';

export default function ExpenseRunningBalance() {
  const navigate = useNavigate();
  const { id } = useParams();
  const d = useExpensesData();

  if (d.loading) return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Skeleton className="w-11 h-11 rounded-full" />
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    </div>
  );
  if (d.error) return (
    <div className="tt-card p-10 text-center max-w-md mx-auto">
      <p className="font-display text-2xl mb-2 text-ink-deep">Couldn't load balances</p>
      <button onClick={d.reload} className="px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">Try again</button>
    </div>
  );

  const { participantMembers, memberById, balances, settle, baseCurrency, changeBaseCurrency, currencyOptions, ratesAvailable, ratesLoading, ratesAsOf } = d;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-foreground/5 text-foreground"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="font-display text-xl font-bold text-foreground">Running Balance</h1>
        <div className="ml-auto"><CurrencySelect value={baseCurrency} onChange={changeBaseCurrency} options={currencyOptions} triggerClass="w-44 h-9" /></div>
      </div>
      <p className="text-[0.6875rem] text-ink-deep/45 flex items-center gap-1">
        {ratesLoading ? 'Loading live rates…' :
          ratesAvailable ? `Live rates as of ${ratesAsOf ? new Date(ratesAsOf).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'now'}` :
          (<><AlertTriangle className="w-3 h-3" /> Exchange rates unavailable — showing original amounts.</>)}
      </p>

      <section>
        <h3 className="tt-label text-foreground/50 mb-2.5">Member balances</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {participantMembers.map((m) => {
            const bal = balances[m.id] || 0;
            const positive = bal > 0.01;
            const negative = bal < -0.01;
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/gathering/${id}/expenses/statement/${m.id}`)}
                className="tt-card p-3.5 flex items-center gap-3 text-left hover:border-terra/30 transition-colors"
              >
                <MemberAvatar member={m} size="md" />
                <div className="min-w-0">
                  <p className="font-semibold text-ink-deep text-sm truncate">{m.full_name}</p>
                  <p className={`text-sm font-semibold ${positive ? 'text-terra-deep' : negative ? 'text-ink-deep/70' : 'text-ink-deep/40'}`}>
                    {positive ? 'is owed ' : negative ? 'owes ' : 'settled '}{formatCurrency(Math.abs(bal), baseCurrency)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {settle.length > 0 && (
        <section>
          <h3 className="tt-label text-foreground/50 mb-2.5">Settle up suggestions</h3>
          <div className="tt-card p-4 space-y-2">
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
    </div>
  );
}