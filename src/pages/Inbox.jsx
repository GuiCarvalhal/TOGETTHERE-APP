import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Inbox as InboxIcon, Loader2, Plus, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppHeader from '@/components/tt/AppHeader';
import EmptyState from '@/components/tt/EmptyState';
import StickyBar from '@/components/tt/StickyBar';
import InboxItemCard from '@/components/inbox/InboxItemCard';
import InboxImportSheet from '@/components/inbox/InboxImportSheet';
import FileInboxItemSheet from '@/components/inbox/FileInboxItemSheet';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { describeImportFailure } from '@/lib/importErrors';
import { setInboxCount } from '@/lib/inboxBadge';

// Journey inbox — the durable home for imported reservation segments, and the ONE
// place bookings are imported (PDF, screenshot or pasted text). Chrome matches the
// rest of the app: the shared sticky action bar (back + page title + the page's
// actions), and the same journey card used on the timeline.
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
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  // Keep the global header badge in sync with what is actually listed here.
  useEffect(() => { if (!loading) setInboxCount(items.length); }, [items, loading]);

  // The inbox opens from the header, Home and the journey page, so it always
  // needs a way back; a direct link with no history falls back to Home.
  const onBack = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  }, [navigate]);

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncInboxConnections', { force: true });
      const s = res.data?.summary || {};
      toast({
        title: t('home.inboxSynced', { count: s.synced || 0 }),
        description: `${t('home.inboxSyncImported', { count: s.imported || 0 })}${
          s.failed ? ` · ${t('home.inboxSyncFailedCount', { count: s.failed })}` : ''
        }`,
      });
      await load();
    } catch {
      toast({ title: t('home.inboxSyncFailed'), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <StickyBar>
          <Button variant="default" size="icon" onClick={onBack} aria-label={t('inbox.back')} className="shrink-0">
            <ArrowLeft />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <InboxIcon className="w-4 h-4 text-terra-coral shrink-0" />
            <h1 className="font-display text-lg font-bold text-ink-deep truncate">{t('inbox.title')}</h1>
            {items.length > 0 && (
              <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-terra text-cream text-[11px] font-bold">
                {items.length}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={syncNow} disabled={syncing} className="shrink-0">
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              <span className="hidden sm:inline">{syncing ? t('home.inboxSyncing') : t('inbox.syncNow')}</span>
            </Button>
            <Button size="sm" onClick={() => setImportOpen(true)} className="shrink-0">
              <Plus />
              <span className="hidden sm:inline">{t('inbox.import')}</span>
            </Button>
          </div>
        </StickyBar>

        <p className="text-sm text-ink-deep/60 mt-4 mb-5">{t('inbox.intro')}</p>

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
          <EmptyState
            icon={InboxIcon}
            title={t('inbox.empty')}
            body={t('inbox.emptyBody')}
            action={<Button onClick={() => setImportOpen(true)}><Plus /> {t('inbox.import')}</Button>}
          />
        ) : (
          <div className="space-y-5">
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

      <InboxImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={load}
      />

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