import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Inbox, MailPlus, RefreshCw } from 'lucide-react';
import InboxMetricCard from '@/components/home/InboxMetricCard';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui/use-toast';

// Compact "how long ago" token for the sync metric: 12m / 3h / 2d.
function compactSince(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// Home entry point for the journey inbox: three action cards, one number each —
// sync the mailboxes, open what arrived, manage the accounts. Every number comes
// from the Home payload already loaded, so nothing extra is fetched.
export default function JourneyInboxPanel({ count = 0, connections = [], onSynced }) {
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const active = connections.filter((c) => c.status !== 'disconnected');
  const lastSyncAt = active.map((c) => c.last_sync_at).filter(Boolean).sort().pop() || '';
  const cadence = active.length ? Math.min(...active.map((c) => c.sync_interval_minutes || 30)) : 0;
  // Minutes since the last sync; before the first one, the configured cadence.
  const syncMetric = lastSyncAt ? compactSince(lastSyncAt) : cadence ? `${cadence}m` : '—';

  async function syncNow() {
    // No mailbox yet: the useful action is connecting one.
    if (!active.length) {
      navigate('/account');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('syncInboxConnections', { force: true });
      const s = res.data?.summary || {};
      toast({
        title: t('home.inboxSynced', { count: s.synced || 0 }),
        description: `${t('home.inboxSyncImported', { count: s.imported || 0 })}${
          s.failed ? ` · ${t('home.inboxSyncFailedCount', { count: s.failed })}` : ''
        }`,
      });
      await onSynced?.();
    } catch {
      toast({ title: t('home.inboxSyncFailed'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Inbox className="w-3.5 h-3.5 text-terra-coral" />
        <p className="tt-label text-ink-deep/55">{t('inbox.title')}</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <InboxMetricCard icon={RefreshCw} value={syncMetric} label={t('home.inboxCardSync')} onClick={syncNow} busy={busy} />
        <InboxMetricCard
          icon={Inbox}
          value={fmt.formatNumber(count)}
          label={t('home.inboxCardItems')}
          onClick={() => navigate('/inbox')}
          highlight={count > 0}
        />
        <InboxMetricCard
          icon={MailPlus}
          value={fmt.formatNumber(active.length)}
          label={t('home.inboxCardMailboxes')}
          onClick={() => navigate('/account')}
        />
      </div>
    </div>
  );
}