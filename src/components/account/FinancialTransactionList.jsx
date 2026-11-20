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
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
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
              <div key={tx.id} className="tt-card-flat px-3 py-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-deep truncate">{tx.merchant || tx.description}</p>
                  <p className="text-[11px] text-ink-deep/55 truncate">
                    {fmt.formatDate(tx.date)} ···· {tx.account_mask} · {t(`expenseCategories.${tx.category_suggestion || 'other'}`)}
                    {gatheringName ? ` · ${gatheringName}` : ''}
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    {tx.status === 'pending' && (
                      <span className="tt-stamp border-terra/30 text-terra-deep bg-terra/10 px-1.5 py-0 text-[0.5625rem]">
                        {t('finance.pendingChip')}
                      </span>
                    )}
                    {isCredit && (
                      <span className="tt-stamp border-emerald-600/35 text-emerald-700 bg-emerald-500/10 px-1.5 py-0 text-[0.5625rem]" title={t('finance.refundHint')}>
                        {t('finance.refundChip')}
                      </span>
                    )}
                    <p className={`text-sm font-bold ${isCredit ? 'text-emerald-600' : 'text-ink-deep'}`}>
                      {isCredit ? '+' : '−'}{fmt.formatCurrency(tx.amount, tx.currency)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {canCreate && (
                      <Button
                        size="sm"
                        className="h-7 w-7 px-0"
                        onClick={() => onCreateExpense(tx)}
                        disabled={busyId === tx.id}
                        title={t('finance.createExpense')}
                        aria-label={t('finance.createExpense')}
                      >
                        <Receipt />
                      </Button>
                    )}
                    {tx.review_status === 'linked' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 px-0"
                        onClick={() => act(tx.id, 'reset')}
                        disabled={busyId === tx.id}
                        title={t('finance.unlink')}
                        aria-label={t('finance.unlink')}
                      >
                        {busyId === tx.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      </Button>
                    ) : tx.review_status === 'ignored' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 w-7 px-0"
                        onClick={() => act(tx.id, 'reset')}
                        disabled={busyId === tx.id}
                        title={t('finance.restore')}
                        aria-label={t('finance.restore')}
                      >
                        {busyId === tx.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 px-0"
                        onClick={() => act(tx.id, 'ignore')}
                        disabled={busyId === tx.id}
                        title={t('finance.ignore')}
                        aria-label={t('finance.ignore')}
                      >
                        {busyId === tx.id ? <Loader2 className="animate-spin" /> : <Ban />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}