import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { Landmark, Plus, RefreshCw, Ban, Loader2 } from 'lucide-react';
import FinancialConnectSheet from '@/components/account/FinancialConnectSheet';
import FinancialTransactionList from '@/components/account/FinancialTransactionList';
import TransactionExpenseSheet from '@/components/account/TransactionExpenseSheet';

// Bank/card foundation: connect an account, import transactions, review the
// suggestions and turn one into an expense through the standard form.
// Nothing is ever written to a gathering or to Expenses by the import itself.
export default function FinancialAccounts() {
  const { t, fmt } = useI18n();
  const [data, setData] = useState({ connections: [], transactions: [], counts: {} });
  const [gatherings, setGatherings] = useState([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [expenseTx, setExpenseTx] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('getFinancialData', {});
      const d = res.data || res;
      setData({
        connections: d.connections || [],
        transactions: d.transactions || [],
        counts: d.counts || {},
      });
    } catch (err) {
      setNotice(err.response?.data?.error || err.message || t('finance.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    load();
    base44.entities.Gathering.filter({})
      .then((rows) => setGatherings((rows || []).map((g) => ({ id: g.id, name: g.name }))))
      .catch(() => {});
  }, [load]);

  const gatheringNames = Object.fromEntries(gatherings.map((g) => [g.id, g.name]));

  async function sync(connectionId) {
    setBusyId(connectionId || 'all');
    setNotice('');
    try {
      const res = await base44.functions.invoke('syncFinancialTransactions', connectionId ? { connection_id: connectionId } : {});
      const summary = (res.data || res)?.summary || {};
      setNotice(summary.imported ? t('finance.syncDone', { count: summary.imported }) : t('finance.syncNone'));
      await load();
    } catch (err) {
      setNotice(err.response?.data?.error || err.message || t('finance.syncFailed'));
    } finally {
      setBusyId('');
    }
  }

  async function disconnect(connectionId) {
    if (!confirm(t('finance.disconnectConfirm'))) return;
    setBusyId(connectionId);
    try {
      await base44.functions.invoke('disconnectFinancialAccount', { connection_id: connectionId });
      setNotice(t('finance.disconnected'));
      await load();
    } catch (err) {
      setNotice(err.response?.data?.error || err.message || t('finance.disconnectFailed'));
    } finally {
      setBusyId('');
    }
  }

  const connections = (data.connections || []).filter((c) => c.status !== 'disconnected');

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-ink-deep">{t('finance.title')}</h2>
          <p className="text-xs text-ink-deep/55 leading-relaxed">{t('finance.desc')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setConnectOpen(true)} className="shrink-0">
          <Plus /> {t('finance.connect')}
        </Button>
      </div>

      {notice && <p className="text-xs text-terra-deep">{notice}</p>}

      {!connections.length ? (
        <div className="tt-card p-6 text-center">
          <Landmark className="w-6 h-6 text-ink-deep/40 mx-auto mb-2" />
          <p className="text-sm font-semibold text-ink-deep mb-1">{t('finance.noAccounts')}</p>
          <p className="text-xs text-ink-deep/55">{t('finance.noAccountsBody')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <div key={c.id} className="tt-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cream-pale grid place-items-center shrink-0">
                  <Landmark className="w-5 h-5 text-ink-deep/60" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-deep truncate">
                    {c.institution_name} ···· {c.account_mask}
                  </p>
                  <p className="text-[11px] text-ink-deep/55 truncate">
                    {c.last_sync_at ? t('finance.lastSync', { time: fmt.timeAgo(c.last_sync_at) }) : t('finance.neverSynced')}
                  </p>
                </div>
                <span className={`tt-stamp shrink-0 ${c.status === 'attention' ? 'border-terra/40 text-terra-deep bg-terra/10' : 'border-emerald-600/30 text-emerald-700 bg-emerald-500/10'}`}>
                  {c.status === 'attention' ? t('finance.statusAttention') : t('finance.statusConnected')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => sync(c.id)} disabled={!!busyId}>
                  {busyId === c.id ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t('finance.sync')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => disconnect(c.id)} disabled={!!busyId}>
                  <Ban /> {t('finance.disconnect')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FinancialTransactionList
        transactions={data.transactions}
        gatheringNames={gatheringNames}
        onChanged={load}
        onCreateExpense={setExpenseTx}
      />

      <FinancialConnectSheet
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={async () => { setNotice(t('finance.connectedToast')); await sync(); }}
      />

      {expenseTx && (
        <TransactionExpenseSheet
          transaction={expenseTx}
          gatherings={gatherings}
          onClose={() => setExpenseTx(null)}
          onLinked={async () => { setExpenseTx(null); setNotice(t('finance.expenseLinked')); await load(); }}
        />
      )}
    </section>
  );
}