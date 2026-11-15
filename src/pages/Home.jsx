import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Route, Receipt, Sparkles, Inbox } from 'lucide-react';
import { gatheringDateStatus, gatheringSortKey, deriveGatheringMeta } from '@/lib/gatheringDates';
import AppHeader from '@/components/tt/AppHeader';
import ProfileCompleteReminder from '@/components/tt/ProfileCompleteReminder';
import InstallBanner from '@/components/tt/InstallBanner';
import PendingImportCard from '@/components/home/PendingImportCard';
import NewGatheringSheet from '@/components/home/NewGatheringSheet';
import PassportAwardsBanner from '@/components/home/PassportAwardsBanner';
import ProfileCaixa from '@/components/home/ProfileCaixa';
import GatheringsCaixa from '@/components/home/GatheringsCaixa';
import RecentlyDeletedRow from '@/components/tt/RecentlyDeletedRow';
import RecentlyDeletedSheet from '@/components/tt/RecentlyDeletedSheet';
import { useI18n } from '@/lib/i18n';
import { describeImportFailure } from '@/lib/importErrors';
import { setInboxCount as publishInboxBadge } from '@/lib/inboxBadge';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';

// Shell of the last successful Home payload. A return visit paints the trips
// immediately from here while the fresh payload loads behind it — the network is
// still the source of truth, the cache only removes the empty first frame.
// Inbox cards and counters are deliberately NOT cached: a resolved import must
// never reappear, and those are cheap to wait for.
const SHELL_KEY = 'tt-home-shell-v1';
const SHELL_TTL = 2 * 60 * 1000;

function readShellCache(userId) {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(SHELL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId) return null;
    if (Date.now() - parsed.at > SHELL_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeShellCache(userId, data) {
  if (!userId) return;
  try {
    sessionStorage.setItem(SHELL_KEY, JSON.stringify({ at: Date.now(), userId, data }));
  } catch { /* ignore */ }
}

export default function Home() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState([]);
  const [gatherings, setGatherings] = useState([]);
  const [previews, setPreviews] = useState({});
  const [itemsByGathering, setItemsByGathering] = useState({});
  const [pendingImports, setPendingImports] = useState([]);
  const [importChoiceById, setImportChoiceById] = useState({});
  const [resolvingImportId, setResolvingImportId] = useState('');
  const [createForImportId, setCreateForImportId] = useState('');
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Home opens on the trips that matter now: Upcoming is the default view every
  // time the page loads. The full All / Past options stay one tap away.
  const [filter, setFilter] = useState('upcoming');
  const [nextUpcoming, setNextUpcoming] = useState(null);
  // Soft-deleted gatherings the owner can still bring back (30-day window).
  const [deletedGatherings, setDeletedGatherings] = useState([]);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [restoringGatheringId, setRestoringGatheringId] = useState('');
  // Every refresh takes a ticket; only the newest one may apply its response, so
  // a background sync finishing after an explicit refresh can never overwrite
  // fresher data (or resurrect an import that was just resolved).
  const loadSeqRef = useRef(0);
  // True once anything is on screen (cache or network): suppresses the skeleton
  // so a revalidating refresh never flashes it back.
  const hydratedRef = useRef(false);

  async function load({ silent = false } = {}) {
    const seq = ++loadSeqRef.current;
    if (!silent && !hydratedRef.current) setLoading(true);
    try {
      // The user's timezone decides what "today" means for the featured card.
      const res = await base44.functions.invoke('getHomePreviews', {
        tz_offset_minutes: new Date().getTimezoneOffset(),
      });
      if (seq !== loadSeqRef.current) return;
      const data = res.data || res;
      setGatherings(data.gatherings || []);
      setMemberships(data.memberships || []);
      setPreviews(data.previews || {});
      setItemsByGathering(data.itemsByGathering || {});
      setPendingImports(data.pendingImports || []);
      // Keep the header badge in step with what automatic mailbox sync just
      // pulled in (journey items + pending transactions).
      publishInboxBadge(data.inboxCount || 0);
      setUserId(data.userId || null);
      setNextUpcoming(data.nextUpcoming || null);
      setDeletedGatherings(data.deletedGatherings || []);
      setLoadError(false);
      writeShellCache(data.userId || user?.id, {
        gatherings: data.gatherings || [],
        memberships: data.memberships || [],
        previews: data.previews || {},
        itemsByGathering: data.itemsByGathering || {},
        nextUpcoming: data.nextUpcoming || null,
        deletedGatherings: data.deletedGatherings || [],
        userId: data.userId || user?.id || null,
      });
      hydratedRef.current = true;
    } catch (e) {
      console.error(e);
      if (seq === loadSeqRef.current) setLoadError(true);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  // Paint the last shell first (return visits only), then let the network call
  // above replace it. Synchronous, so it lands in the same frame as the mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    const shell = readShellCache(user?.id);
    if (!shell) return;
    hydratedRef.current = true;
    setGatherings(shell.gatherings || []);
    setMemberships(shell.memberships || []);
    setPreviews(shell.previews || {});
    setItemsByGathering(shell.itemsByGathering || {});
    setNextUpcoming(shell.nextUpcoming || null);
    setDeletedGatherings(shell.deletedGatherings || []);
    setUserId(shell.userId || user?.id || null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, []);

  const roleOf = (gid) => memberships.find((m) => m.gathering_id === gid)?.role;

  // Derive each gathering's date status + sort key + range from its journey
  // items (current user's items first, falling back to all). Ordering: ongoing
  // first, then future (nearest first), then past (most recent first), TBD last.
  const now = new Date();
  const annotated = gatherings.map((g) => {
    const items = itemsByGathering[g.id] || [];
    const r = roleOf(g.id);
    const status = gatheringDateStatus(g, items, userId, r, now);
    const sortKey = gatheringSortKey(g, items, userId, r, now);
    const meta = deriveGatheringMeta(g, items, userId, r, { t, formatDateTime: fmt.formatDateTime, formatDate: fmt.formatDate });
    return { g, status, sortKey, meta };
  });
  // Both sides of the caixa's Upcoming / Past switch, already ordered: ongoing
  // first, then future (nearest first), then past (most recent first), TBD last.
  const bySortKey = (a, b) => a.sortKey.bucket - b.sortKey.bucket || a.sortKey.ts - b.sortKey.ts;
  const upcomingAnnotated = annotated
    .filter(({ status }) => status.key === 'ongoing' || status.key === 'upcoming')
    .sort(bySortKey);
  const pastAnnotated = annotated.filter(({ status }) => status.key === 'past').sort(bySortKey);
  // Default each import to its suggested gathering, but never overwrite a choice
  // the user already made while a refresh is in flight.
  useEffect(() => {
    const knownIds = new Set(gatherings.map((g) => g.id));
    setImportChoiceById((cur) => {
      const next = {};
      pendingImports.forEach((it) => {
        const candidates = Array.isArray(it.candidate_gathering_ids) ? it.candidate_gathering_ids : [];
        const kept = cur[it.id];
        if (kept && knownIds.has(kept)) next[it.id] = kept;
        else next[it.id] = it.suggested_gathering_id || candidates[0] || '';
      });
      return next;
    });
  }, [pendingImports, gatherings]);

  async function resolveImport(importId, action) {
    if (resolvingImportId === importId) return;
    const gatheringId = importChoiceById[importId];
    setResolvingImportId(importId);
    try {
      await base44.functions.invoke('resolveReservationImport', {
        import_id: importId,
        action,
        ...(action === 'create' ? { gathering_id: gatheringId } : {}),
      });
      toast({ title: action === 'create' ? t('home.importResolved') : t('home.importDismissed') });
    } catch (e) {
      // 422 = the reservation misses the standard item's minimum data; say which
      // fields instead of a generic failure. 409 = already resolved elsewhere.
      const failure = describeImportFailure(e, t, t('home.importResolveFailed'));
      if (!failure.resolved) {
        toast({ title: failure.title, description: failure.description, variant: 'destructive' });
      }
    } finally {
      setResolvingImportId('');
      // Always resync: on success the card must disappear, and on a 409 (already
      // resolved elsewhere, e.g. another tab or device) the stale card must too.
      await load({ silent: true });
    }
  }

  async function handleGatheringCreated(gathering) {
    const importId = createForImportId;
    setCreateForImportId('');
    if (!gathering?.id) return;
    setGatherings((cur) => (cur.some((g) => g.id === gathering.id) ? cur : [...cur, gathering]));
    if (importId) setImportChoiceById((cur) => ({ ...cur, [importId]: gathering.id }));
    toast({ title: t('newGathering.created') });
    await load({ silent: true });
  }

  async function restoreGathering(row) {
    if (restoringGatheringId === row.id) return;
    setRestoringGatheringId(row.id);
    try {
      await base44.functions.invoke('restoreGathering', { gathering_id: row.id });
      toast({ title: t('recentlyDeleted.restored'), description: t('recentlyDeleted.restoredDesc', { title: row.title }) });
      await load({ silent: true });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('recentlyDeleted.restoreFailed'),
        description: e?.response?.data?.error || e?.data?.error || e?.message,
      });
    } finally {
      setRestoringGatheringId('');
    }
  }

  // How many trips are live right now — used by the profile caixa.
  const activeCount = annotated.filter(({ status }) => status.key === 'ongoing' || status.key === 'upcoming').length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Universal header */}
      <AppHeader />

      {/* Brand-new users only: the intro headline. Once there is anything to
          show, the gatherings caixa below owns the top of the page (its header
          line is the NEXT / NOW line), so the marketing copy never competes. */}
      {gatherings.length === 0 && !loading && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8">
          <p className="tt-label text-terra-coral mb-3">{t('home.groupTravel')}</p>
          <h1 className="font-display text-4xl sm:text-6xl font-bold leading-[1.05] tt-text-balance max-w-3xl">
            {t('home.heroLine1')}<br /><span className="italic text-terra-coral">{t('home.heroLine2')}</span>
          </h1>
        </section>
      )}

      {/* THE gatherings caixa — one surface for the whole resolution: the
          NEXT/NOW header line with the New action, the featured segment with its
          Next brief, the Upcoming / Past switch, and the other trips as a
          swipeable carousel. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6">
        <GatheringsCaixa
          loading={loading}
          loadError={loadError}
          onRetry={() => load()}
          nextUpcoming={nextUpcoming}
          featuredPeople={nextUpcoming ? previews[nextUpcoming.gatheringId] || [] : []}
          upcoming={upcomingAnnotated}
          past={pastAnnotated}
          filter={filter}
          onFilterChange={setFilter}
          roleOf={roleOf}
          previews={previews}
          totalCount={gatherings.length}
          onNew={() => navigate('/gathering/new')}
        />

        <RecentlyDeletedRow
          count={deletedGatherings.length}
          label={t('recentlyDeleted.openAction')}
          onClick={() => setDeletedOpen(true)}
        />
      </section>

      {/* Profile caixa — identity plus the shortcuts into the account areas. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        <div className="sm:max-w-sm">
          <ProfileCaixa
            user={user}
            gatheringCount={gatherings.length}
            upcomingCount={activeCount}
          />
        </div>
      </section>

      {/* Passport & Awards: progress at a glance, and the celebration when a new
          stamp or award landed since the user last acknowledged one. */}
      <PassportAwardsBanner />

      <ProfileCompleteReminder />

      {/* Install prompt ??? sits above the gatherings list; hidden when running as an installed app */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        <InstallBanner />
      </section>

      {pendingImports.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
          <div className="tt-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-terra-coral" />
              <h3 className="font-display text-lg font-bold text-ink-deep">{t('home.pendingImportsTitle')}</h3>
            </div>
            <p className="text-sm text-ink-deep/65">{t('home.pendingImportsBody')}</p>
            <div className="space-y-3">
              {pendingImports.map((it) => {
                const choice = importChoiceById[it.id];
                return (
                  <PendingImportCard
                    key={it.id}
                    item={it}
                    gatherings={gatherings}
                    selectedId={gatherings.some((g) => g.id === choice) ? choice : ''}
                    onSelect={(v) => setImportChoiceById((cur) => ({ ...cur, [it.id]: v }))}
                    onRefresh={() => load({ silent: true })}
                    onCreateNew={() => setCreateForImportId(it.id)}
                    onConfirm={() => resolveImport(it.id, 'create')}
                    onDiscard={() => resolveImport(it.id, 'discard')}
                    busy={resolvingImportId === it.id}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      <NewGatheringSheet
        open={!!createForImportId}
        onOpenChange={(open) => { if (!open) setCreateForImportId(''); }}
        onCreated={handleGatheringCreated}
      />

      <RecentlyDeletedSheet
        open={deletedOpen}
        onClose={() => setDeletedOpen(false)}
        title={t('recentlyDeleted.gatheringsTitle')}
        items={deletedGatherings.map((g) => ({
          id: g.id,
          title: g.name || t('common.untitled'),
          meta: (g.destinations || []).join(' · '),
          deletedAt: g.deleted_at,
        }))}
        loading={false}
        onRestore={restoreGathering}
        restoringId={restoringGatheringId}
        emptyLabel={t('recentlyDeleted.gatheringsEmpty')}
      />

      {/* Three pillars ??? horizontal, icon + headline only, each links to how-it-works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: Route, title: t('home.pillarItinerary') },
            { icon: Receipt, title: t('home.pillarSplits') },
            { icon: Sparkles, title: t('home.pillarAI') },
          ].map((f) => (
            <Link
              key={f.title}
              to="/how-it-works"
              aria-label={f.title}
              className="tt-ink-panel p-3 flex flex-col items-center text-center gap-2 rounded-xl hover:bg-foreground/5 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
            >
              <div className="w-9 h-9 rounded-lg bg-terra/15 border border-terra/25 flex items-center justify-center shrink-0">
                <f.icon className="w-4 h-4 text-terra-coral" />
              </div>
              <p className="font-display text-xs font-bold text-foreground leading-tight">{f.title}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Legal footer — the privacy policy link is a discoverability
          requirement for the Google OAuth verification. */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-foreground/50">
          <p>© {new Date().getFullYear()} TOGETTHERE</p>
          <nav className="flex items-center gap-4">
            <Link to="/how-it-works" className="hover:text-foreground hover:underline">
              {t('howItWorks.label')}
            </Link>
            <Link to="/privacy-policy" className="hover:text-foreground hover:underline">
              Privacy Policy
            </Link>
          </nav>
        </div>
      </footer>

    </div>
  );
}