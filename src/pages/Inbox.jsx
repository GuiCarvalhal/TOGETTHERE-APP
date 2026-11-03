import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Inbox as InboxIcon, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppHeader from '@/components/tt/AppHeader';
import EmptyState from '@/components/tt/EmptyState';
import InboxItemCard from '@/components/inbox/InboxItemCard';
import FileInboxItemSheet from '@/components/inbox/FileInboxItemSheet';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { describeImportFailure } from '@/lib/importErrors';

// Journey inbox — the durable home for imported reservation segments.
//
// Every booking found in an email (two flights, or flights plus a hotel) is
// stored here as its own item with the FULL source email attached, whether or not
// it already made it into a gathering. Items that are not used yet wait here
// instead of getting lost, and they render with the standard journey card.
export default function Inbox() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [gatherings, setGatherings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fileTarget, setFileTarget] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [filing, setFiling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [inboxRes, gatheringRows] = await Promise.all([
        base44.functions.invoke('getJourneyInbox', {}),
        base44.entities.Gathering.filter({}),
      ]);
      setItems((inboxRes.data || inboxRes).items || []);
      setGatherings(Array.isArray(gatheringRows) ? gatheringRows : (gatheringRows?.items || []));
      setError('');
    } catch (e) {
      setError(e.message || t('inbox.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // The inbox opens from Home (and from the journey import flow), so it always
  // needs a way back; a direct link with no history falls back to Home.
  const onBack = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  }, [navigate]);

  async function fileItem(itemId, gatheringId) {
    setFiling(true);
    setBusyId(itemId);
    try {
      const res = await base44.functions.invoke('fileJourneyInboxItem', {
        item_id: itemId,
        gathering_id: gatheringId,
        action: 'file',
      });
      const data = res.data || res;
      toast({ title: data?.duplicate ? t('inbox.alreadyFiled') : t('inbox.filed') });
      setFileTarget(null);
      setItems((cur) => cur.filter((it) => it.id !== itemId));
    } catch (e) {
      const failure = describeImportFailure(e, t);
      const missing = e?.response?.data?.missing;
      if (failure.resolved) {
        // Resolved elsewhere (another tab or device): drop the stale card.
        setItems((cur) => cur.filter((it) => it.id !== itemId));
        toast({ title: failure.title });
      } else {
        if (Array.isArray(missing) && missing.length) {
          // The backend just refreshed what this segment still needs: show it on
          // the card instead of leaving the sheet open on a dead end.
          setItems((cur) => cur.map((it) => (it.id === itemId ? { ...it, missing } : it)));
          setFileTarget(null);
        }
        toast({ title: failure.title, description: failure.description, variant: 'destructive' });
      }
    } finally {
      setFiling(false);
      setBusyId('');
    }
  }

  async function dismissItem(itemId) {
    setBusyId(itemId);
    try {
      await base44.functions.invoke('fileJourneyInboxItem', { item_id: itemId, action: 'dismiss' });
      setItems((cur) => cur.filter((it) => it.id !== itemId));
      toast({ title: t('inbox.dismissed') });
    } catch (e) {
      const failure = describeImportFailure(e, t);
      if (failure.resolved) {
        setItems((cur) => cur.filter((it) => it.id !== itemId));
        toast({ title: failure.title });
      } else {
        toast({ title: failure.title, description: failure.description, variant: 'destructive' });
      }
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-deep/60 hover:text-ink-deep transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> {t('inbox.back')}
        </button>

        <div className="flex items-center gap-2 mb-1">
          <InboxIcon className="w-6 h-6 text-terra-deep" />
          <h1 className="font-display text-2xl font-bold text-ink-deep">{t('inbox.title')}</h1>
        </div>
        <p className="text-sm text-ink-deep/60 mb-6">{t('inbox.intro')}</p>

        {loading ? (
          <div className="tt-card p-10 flex items-center justify-center text-ink-deep/50">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="tt-card p-8 text-center space-y-3">
            <p className="text-sm text-ink-deep/60">{error}</p>
            <Button size="sm" variant="outline" onClick={() => { setLoading(true); load(); }}>
              {t('common.tryAgain')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={InboxIcon} title={t('inbox.empty')} body={t('inbox.emptyBody')} />
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <InboxItemCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onFile={(it) => setFileTarget(it)}
                onDismiss={(it) => dismissItem(it.id)}
              />
            ))}
          </div>
        )}
      </div>

      <FileInboxItemSheet
        open={!!fileTarget}
        onOpenChange={(open) => { if (!open) setFileTarget(null); }}
        item={fileTarget}
        gatherings={gatherings}
        busy={filing}
        onConfirm={(gatheringId) => fileTarget && fileItem(fileTarget.id, gatheringId)}
        onCreateGathering={() => { setFileTarget(null); navigate('/gathering/new'); }}
      />
    </div>
  );
}