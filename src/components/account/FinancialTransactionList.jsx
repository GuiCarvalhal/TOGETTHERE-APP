import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/tt/Skeleton';
import { useI18n } from '@/lib/i18n';
import { Receipt, Ban, RotateCcw, Loader2, RefreshCw } from 'lucide-react';

const FILTERS = ['all', 'pending', 'suggested', 'new', 'linked', 'ignored'];

// Review list for imported transactions. Every row is a suggestion: creating an
// expense always opens the standard expense form, and the transaction is only
// marked `linked` after that expense is actually saved.
// `filter` is controlled by the parent when provided (the pending banner on the
// accounts section switches it); fallback to local state otherwise.
export default function FinancialTransactionList({
  transactions,
  gatheringNames,
  onChanged,
  onCreateExpense,
  loading,
  error,
  onRetry,
  filter,
  onFilterChange,
}) {
  const { t, fmt } = useI18n();
  const [localFilter, setLocalFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');

  const activeFilter = onFilterChange ? (filter || 'all') : localFilter;
  const setFilter = onFilterChange || setLocalFilter;

  const visible = useMemo(() => (transactions || []).filter((tx) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'pending') return tx.review_status === 'new' || tx.review_status === 'suggested';
    return tx.review_status === activeFilter;
  }), [transactions, activeFilter]);

  async function act(id, action) {
    setBusyId(id);
    setActionError('');
    try {
      await base44.functions.invoke('updateFinancialTransaction', { id, action });
      onChanged();
    } catch (err) {
      setActionError(err.response?.data?.error || err.message || t('finance.updateFailed'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-ink-deep">{t('finance.transactions')}</h3>
      </div>

      <div className="flex gap-1.5 overflow-x-auto tt-no-scrollbar pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-semibold border transition-colors ${activeFilter === f ? 'bg-terra text-cream border-terra' : 'bg-cream-pale text-ink-deep/70 border-ink-charcoal/20'}`}
          >
            {t(`finance.filter_${f}`)}
          </button>
        ))}
      </div>

      {(error || actionError) && (
        <div className="tt-card-flat p-3 space-y-2">
          <p className="text-xs text-terra-deep">{error || actionError}</p>
          {error && onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw /> {t('finance.loadRetry')}
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : !visible.length ? (
        <div className="tt-card p-6 text-center">
          <p className="text-sm font-semibold text-ink-deep mb-1">{t('finance.noTransactions')}</p>
          <p className="text-xs text-ink-deep/55">{t('finance.noTransactionsBody')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((tx) => {
            const isCredit = tx.direction === 'credit';
            const gatheringName = gatheringNames?.[tx.gathering_suggestion_id] || '';
            const canCreate = !isCredit && tx.review_status !== 'linked' && tx.review_status !== 'ignored';
            return (
              <div key={tx.id} className="tt-card-flat p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-deep truncate">{tx.merchant || tx.description}</p>
                    <p className="text-[11px] text-ink-deep/55 truncate">
                      {fmt.formatDate(tx.date)} ···· {tx.account_mask}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${isCredit ? 'text-emerald-600' : 'text-ink-deep'}`}>
                      {isCredit ? '+' : '−'}{fmt.formatCurrency(tx.amount, tx.currency)}
                    </p>
                    {tx.status === 'pending' && (
                      <span className="tt-stamp border-terra/30 text-terra-deep bg-terra/10">{t('finance.pendingChip')}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {isCredit && (
                    <span className="tt-stamp border-emerald-600/35 text-emerald-700 bg-emerald-500/10" title={t('finance.refundHint')}>
                      {t('finance.refundChip')}
                    </span>
                  )}
                  <span className="tt-stamp border-ink-charcoal/25 text-ink-deep/70">
                    {t(`expenseCategories.${tx.category_suggestion || 'other'}`)}
                  </span>
                  {gatheringName && (
                    <span className="tt-stamp border-terra/30 text-terra-deep">{gatheringName}</span>
                  )}
                  <span className="tt-stamp border-ink-charcoal/25 text-ink-deep/60">
                    {t(`finance.review_${tx.review_status}`)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canCreate && (
                    <Button size="sm" onClick={() => onCreateExpense(tx)} disabled={busyId === tx.id}>
                      <Receipt /> {t('finance.createExpense')}
                    </Button>
                  )}
                  {tx.review_status === 'linked' ? (
                    <Button size="sm" variant="ghost" onClick={() => act(tx.id, 'reset')} disabled={busyId === tx.id}>
                      {busyId === tx.id ? <Loader2 className="animate-spin" /> : <RotateCcw />} {t('finance.unlink')}
                    </Button>
                  ) : tx.review_status === 'ignored' ? (
                    <Button size="sm" variant="secondary" onClick={() => act(tx.id, 'reset')} disabled={busyId === tx.id}>
                      {busyId === tx.id ? <Loader2 className="animate-spin" /> : <RotateCcw />} {t('finance.restore')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => act(tx.id, 'ignore')} disabled={busyId === tx.id}>
                      {busyId === tx.id ? <Loader2 className="animate-spin" /> : <Ban />} {t('finance.ignore')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}