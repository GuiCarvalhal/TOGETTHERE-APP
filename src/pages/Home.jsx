import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, CalendarDays, Compass, Route, Receipt, Sparkles, Inbox, RotateCw } from 'lucide-react';
import { gatheringDateStatus, gatheringSortKey, deriveGatheringMeta } from '@/lib/gatheringDates';
import { journeyIcon } from '@/lib/journeyIcons';
import { format, differenceInCalendarDays } from 'date-fns';
import EmptyState from '@/components/tt/EmptyState';
import AppHeader from '@/components/tt/AppHeader';
import Skeleton from '@/components/tt/Skeleton';
import GatheringCard from '@/components/tt/cards/GatheringCard';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import ProfileCompleteReminder from '@/components/tt/ProfileCompleteReminder';
import InstallBanner from '@/components/tt/InstallBanner';
import PendingImportCard from '@/components/home/PendingImportCard';
import NextBriefCard from '@/components/home/NextBriefCard';
import NewGatheringSheet from '@/components/home/NewGatheringSheet';
import PassportAwardsBanner from '@/components/home/PassportAwardsBanner';
import HeroSkeleton from '@/components/home/HeroSkeleton';
import ProfileCaixa from '@/components/home/ProfileCaixa';
import NowNextCaixa from '@/components/home/NowNextCaixa';
import PastGatheringRow from '@/components/home/PastGatheringRow';
import RecentlyDeletedRow from '@/components/tt/RecentlyDeletedRow';
import RecentlyDeletedSheet from '@/components/tt/RecentlyDeletedSheet';
import { useI18n } from '@/lib/i18n';
import { describeImportFailure } from '@/lib/importErrors';
import { setInboxCount as publishInboxBadge } from '@/lib/inboxBadge';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';

const FILTER_KEYS = [
  { key: 'all', tk: 'home.filterAll' },
  { key: 'upcoming', tk: 'home.filterUpcoming' },
  { key: 'past', tk: 'home.filterPast' },
];

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

// JOURNEY_ICONS is imported from @/lib/journeyIcons (centralized with the
// Journey timeline and Add Segment picker so Main Event always renders Star).
const JOURNEY_TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.color]));

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
  const filtered = annotated.filter(({ status }) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return status.key === 'ongoing' || status.key === 'upcoming';
    if (filter === 'past') return status.key === 'past';
    return true;
  });
  const sorted = [...filtered].sort((a, b) =>
    a.sortKey.bucket - b.sortKey.bucket || a.sortKey.ts - b.sortKey.ts
  );
  // Live trips stay as full cards; past ones drop to a compact row list so they
  // never compete with the caixas above.
  const liveSorted = sorted.filter(({ status }) => status.key !== 'past');
  const pastSorted = sorted.filter(({ status }) => status.key === 'past');
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

  // Featured eyebrow: date-focused relative + absolute timing for the next
  // upcoming segment (replaces the gathering name). Ongoing ??? HAPPENING NOW ??
  // TODAY ?? <today>; upcoming ??? UP NEXT ?? <relative> ?? <start date>. The exact
  // departure clock time lives on the JourneyCard below; this line is the
  // calendar-date + how-soon context, which is the more important line.
  const featuredEyebrow = (() => {
    if (!nextUpcoming) return null;
    const start = nextUpcoming.item.start_datetime ? new Date(nextUpcoming.item.start_datetime) : null;
    const refDate = nextUpcoming.ongoing ? now : start;
    const absDate = refDate ? format(refDate, 'EEE, MMM d') : '';
    const days = start ? differenceInCalendarDays(start, now) : 0;
    const relative = nextUpcoming.ongoing
      ? t('home.today')
      : days <= 0 ? t('home.today') : days === 1 ? t('home.tomorrow') : t('home.inDays', { count: days });
    const statusLabel = nextUpcoming.ongoing ? t('home.happeningNow') : t('home.upNext');
    return { statusLabel, relative, absDate };
  })();

  // Caixas data: the next gathering's own itinerary (ordered, never the
  // soft-deleted rows) and how many trips are live right now.
  const nextAnnotation = nextUpcoming
    ? annotated.find((a) => a.g.id === nextUpcoming.gatheringId)
    : null;
  const caixaItems = nextUpcoming
    ? (itemsByGathering[nextUpcoming.gatheringId] || [])
        .filter((it) => !it.is_deleted)
        .slice()
        .sort((a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0))
        .slice(0, 12)
    : [];
  const activeCount = annotated.filter(({ status }) => status.key === 'ongoing' || status.key === 'upcoming').length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Universal header */}
      <AppHeader />

      {/* Hero intro ??? or the user's next upcoming journey segment when one exists */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10">
        {loading && !nextUpcoming ? (
          /* Instant placeholder: same shape as the module below, so the first
             frame is never the marketing headline when a trip is about to load. */
          <HeroSkeleton />
        ) : nextUpcoming ? (
          /* ONE continuous module: the NEXT line, the featured segment and the
             agent tips share a single surface — no stacked cards, no second box. */
          <div className="tt-card-hairline p-3.5 sm:p-4">
            {featuredEyebrow && (
              <p className="text-sm font-bold mb-2.5 tracking-wide flex flex-wrap items-center gap-x-2 px-0.5">
                <span className="text-terra-coral uppercase">{featuredEyebrow.statusLabel}</span>
                <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />
                <span className="text-ink-deep uppercase">{featuredEyebrow.relative}</span>
                <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />
                <span className="text-ink-deep/75">{featuredEyebrow.absDate}</span>
              </p>
            )}
            <JourneyCard
              item={nextUpcoming.item}
              leg={nextUpcoming.item.type === 'hotel' ? 'check-in' : undefined}
              typeColor={JOURNEY_TYPE_COLOR[nextUpcoming.item.type] || JOURNEY_TYPE_COLOR.other}
              icon={journeyIcon(nextUpcoming.item.type)}
              participants={nextUpcoming.participants}
              showImages
              embedded
              to={`/gathering/${nextUpcoming.gatheringId}/journey/${nextUpcoming.item.id}`}
            />
            <NextBriefCard next={nextUpcoming} />
          </div>
        ) : (
          <>
            <p className="tt-label text-terra-coral mb-3">{t('home.groupTravel')}</p>
            <h1 className="font-display text-4xl sm:text-6xl font-bold leading-[1.05] tt-text-balance max-w-3xl">
              {t('home.heroLine1')}<br /><span className="italic text-terra-coral">{t('home.heroLine2')}</span>
            </h1>
            {gatherings.length > 0 && (
              <p className="mt-4 text-sm text-ink-deep/60">{t('home.featuredEmpty')}</p>
            )}
          </>
        )}
      </section>

      {/* Home "caixas" — two large thematic cards: the profile summary and the
          gathering happening now/next, whose upcoming items scroll inside the
          card. The NEXT ITEM module above stays the first thing on the page. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
          <ProfileCaixa
            user={user}
            gatheringCount={gatherings.length}
            upcomingCount={activeCount}
          />
          {nextAnnotation ? (
            <NowNextCaixa
              annotation={nextAnnotation}
              items={caixaItems}
              people={previews[nextAnnotation.g.id] || []}
              ongoing={!!nextUpcoming?.ongoing}
            />
          ) : null}
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

      {/* Gatherings grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h2 className="font-display text-2xl font-bold whitespace-nowrap">{t('home.yourGatherings')}</h2>
            {/* Upcoming is the default view, so the switcher must also appear when
                that default would otherwise hide the user's only gathering. */}
            {(gatherings.length > 1 || (gatherings.length > 0 && sorted.length === 0)) && (
              <div className="flex items-center gap-2">
                {FILTER_KEYS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${filter === f.key ? 'bg-primary text-primary-foreground' : 'tt-ink-panel text-muted-foreground hover:text-foreground'}`}>
                    {t(f.tk)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button onClick={() => navigate('/gathering/new')} size="sm" className="shrink-0"><Plus /> {t('home.new')}</Button>
        </div>

        {loadError && !loading && (
          <div className="tt-card p-4 mb-5 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-deep/70">{t('home.couldNotLoad')}</p>
            <Button size="sm" variant="secondary" onClick={() => load()} className="shrink-0">
              <RotateCw className="w-3.5 h-3.5" />
              {t('common.tryAgain')}
            </Button>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tt-card overflow-hidden">
                <Skeleton className="h-[155px] w-full" />
                <div className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3" tone="cream" />
                  <Skeleton className="h-3 w-1/2" tone="cream" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-6 w-20 rounded-full" tone="cream" />
                    <Skeleton className="h-7 w-24 rounded-full" tone="cream" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : gatherings.length === 0 && !loadError ? (
          <EmptyState
            icon={Compass}
            title={t('home.noGatherings')}
            body={t('home.noGatheringsBody')}
            action={<Button onClick={() => navigate('/gathering/new')}><Plus /> {t('home.createGathering')}</Button>}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={filter === 'past' ? CalendarDays : Compass}
            title={filter === 'past' ? t('home.noPast') : t('home.noUpcoming')}
            body={filter === 'past' ? t('home.noPastBody') : t('home.noUpcomingBody')}
          />
        ) : (
          <div className="space-y-6">
            {liveSorted.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveSorted.map(({ g, status, meta }) => (
                  <GatheringCard
                    key={g.id}
                    gathering={g}
                    dateLabel={status.label}
                    meta={meta}
                    role={roleOf(g.id)}
                    people={previews[g.id] || []}
                    to={`/gathering/${g.id}/journey`}
                  />
                ))}
              </div>
            )}

            {/* Past gatherings: compact rows, still one tap from the journey. */}
            {pastSorted.length > 0 && (
              <div>
                <h3 className="tt-label text-ink-deep/45 mb-2">{t('home.pastGatherings')}</h3>
                <div className="tt-card-hairline overflow-hidden">
                  {pastSorted.map(({ g, status }, i) => (
                    <PastGatheringRow
                      key={g.id}
                      gathering={g}
                      dateLabel={status.label}
                      last={i === pastSorted.length - 1}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <RecentlyDeletedRow
          count={deletedGatherings.length}
          label={t('recentlyDeleted.openAction')}
          onClick={() => setDeletedOpen(true)}
        />
      </section>

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