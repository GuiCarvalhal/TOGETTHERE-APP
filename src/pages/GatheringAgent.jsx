import React, { useState, useEffect, useCallback } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { timeAgo } from '@/lib/gatheringHelpers';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import PageToolbar from '@/components/tt/PageToolbar';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';
import AgentPlaceCard from '@/components/agent/AgentPlaceCard';
import VibeCard from '@/components/agent/VibeCard';
import GoodToKnowCard from '@/components/agent/GoodToKnowCard';
import TaskChecklist from '@/components/agent/TaskChecklist';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import JourneyMapPanel from '@/components/journey/JourneyMapPanel';
import { Timeline } from '@/components/tt/Timeline';
import { suggestionRouteNumbers, suggestionKey } from '@/lib/journeyMap';
import { useAgentPlaceCoords, agentPlaceKey } from '@/lib/useAgentPlaceCoords';
import { useJourneyItemCoords, augmentItemsWithCoords } from '@/lib/useJourneyItemCoords';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, Plus, Check, UtensilsCrossed, Compass, ClipboardList, CalendarDays, Users } from 'lucide-react';
import { ListChevronsDownUp, ListChevronsUpDown } from '@/components/tt/ListChevronsIcons';
import { useI18n } from '@/lib/i18n';
import { sliceAgentData, shouldShowReloadHint } from '@/lib/agentSlice';

const CAT_KEYS = [
  { key: 'all', tk: 'agent.catAll' },
  { key: 'today', tk: 'agent.catToday' },
  { key: 'eat', tk: 'agent.catEat' },
  { key: 'do', tk: 'agent.catDo' },
  { key: 'tasks', tk: 'agent.catTasks' },
  { key: 'info', tk: 'agent.catInfo' },
];

function SectionHeader({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <Icon className="w-4 h-4 text-terra-deep" />
      <h3 className="font-display text-base font-bold text-ink-deep">{title}</h3>
      {count != null && <span className="text-xs text-ink-deep/45">· {count}</span>}
    </div>
  );
}

// Loading skeleton matching the rendered layout: a brief-header card + a stack
// of place-card skeletons on the same card surface/rhythm as Journey/Expenses.
function AgentSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-20 w-full" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-ink-charcoal/15 bg-card p-3 space-y-2 tt-shadow-float">
            <div className="flex gap-2"><Skeleton className="h-4 w-16" tone="cream" /><Skeleton className="h-4 w-10" tone="cream" /></div>
            <Skeleton className="h-4 w-2/3" tone="cream" />
            <Skeleton className="h-3 w-full" tone="cream" />
            <Skeleton className="h-8 w-32 mt-1" tone="cream" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GatheringAgent() {
  const { t, fmt } = useI18n();
  const { gatheringId, gathering, members, currentMember, role, setFab } = useGathering();
  const CATS = CAT_KEYS.map((c) => ({ ...c, label: t(c.tk) }));
  const { images, setImages, mapOpen, setMapOpen, agentLength, setAgentLength } = useViewPrefs(gatheringId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('all');
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [journeyInitial, setJourneyInitial] = useState(null);
  const [journeyItems, setJourneyItems] = useState([]);

  // Slice the underlying 10+10 set to Short (5+5) or Long (10+10). Switching
  // is instant — no re-generation or network calls. todaysPicks are not sliced.
  const slicedData = sliceAgentData(data, agentLength);
  const eatPlaces = slicedData?.whereToEat || [];
  const doPlaces = slicedData?.whatToDo || [];
  const todaysPicks = slicedData?.todaysPicks || [];
  const showReloadHint = shouldShowReloadHint(data, agentLength);

  // All AI-suggested places on the page (today + eat + do), tagged with their
  // section label, for layering on the route map. Uses the SLICED list so
  // counts, cards, map pins and numbering all stay consistent with the
  // Short/Long toggle. Empty until a brief exists.
  const allSuggestions = [];
  if (data) {
    todaysPicks.forEach((p) => allSuggestions.push({ place: p, categoryLabel: t('agent.catToday') }));
    eatPlaces.forEach((p) => allSuggestions.push({ place: p, categoryLabel: t('agent.catEat') }));
    doPlaces.forEach((p) => allSuggestions.push({ place: p, categoryLabel: t('agent.catDo') }));
  }
  // Resolve suggestion coords only while the map panel is open (lazy), via the
  // existing getPlaceInfo path — cached + deduped in the hook.
  const { coords: suggCoords, pending: suggPending } = useAgentPlaceCoords(
    mapOpen ? allSuggestions.map((s) => s.place) : []
  );

  // Journey items for the base route map — fetched only when the panel opens.
  useEffect(() => {
    if (!mapOpen) return;
    let active = true;
    (async () => {
      try {
        const list = await base44.entities.JourneyItem.filter({ gathering_id: gatheringId });
        if (active) setJourneyItems(list);
      } catch { /* ignore — base map just won't draw */ }
    })();
    return () => { active = false; };
  }, [mapOpen, gatheringId]);

  // Runtime-only geocoding for journey items that lack native coords (most
  // legacy items carry only free-text location strings). Same shared engine as
  // suggestions; resolves lazily, only while the map panel is open, and never
  // writes a record. Declared before the viewer early-return so hook order is
  // stable across every render.
  // Agent map uses GROUP context — all journey items, not filtered by Mine.
  const visibleItems = journeyItems;
  const destName = gathering?.destination_places?.[0]?.name || gathering?.destinations?.[0] || '';
  const { coords: itemCoords, pending: itemCoordsPending } = useJourneyItemCoords(
    mapOpen ? visibleItems : [], destName
  );

  const isViewer = role === 'viewer';

  const storeKey = `tt-agent-data-${gatheringId}`;
  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('generateRecommendations', { gathering_id: gatheringId });
      const d = res.data || res;
      setData(d);
      try { localStorage.setItem(storeKey, JSON.stringify(d)); } catch { /* ignore */ }
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('agent.unavailable'));
    } finally {
      setLoading(false);
    }
  }, [gatheringId, storeKey]);

  // Load the last cached brief on mount (no API call); the user regenerates
  // manually from the sticky bar.
  useEffect(() => {
    if (isViewer) return;
    try {
      const cached = localStorage.getItem(storeKey);
      if (cached) setData(JSON.parse(cached));
    } catch { /* ignore */ }
  }, [storeKey, isViewer]);

  // Regenerate lives in the sticky PageToolbar (canonical button), not a FAB.
  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const list = await base44.entities.Task.filter({ gathering_id: gatheringId });
      list.sort((a, b) => (a.done - b.done) || new Date(a.created_date) - new Date(b.created_date));
      setTasks(list);
    } catch { /* ignore */ } finally { setLoadingTasks(false); }
  }, [gatheringId]);
  useEffect(() => { if (!isViewer) loadTasks(); }, [loadTasks, isViewer]);

  const memberIds = (members || []).map((m) => m.user_id).filter(Boolean);
  async function createTask(title) {
    try {
      await base44.entities.Task.create({ gathering_id: gatheringId, title, done: false, member_user_ids: memberIds, source: 'ai' });
      loadTasks();
    } catch (e) {
      alert(e.response?.data?.error || e.message || t('agent.couldNotAddTask'));
    }
  }
  async function toggleTask(t) {
    try { await base44.entities.Task.update(t.id, { done: !t.done }); loadTasks(); } catch { /* ignore */ }
  }
  async function deleteTask(t) {
    try { await base44.entities.Task.delete(t.id); loadTasks(); } catch { /* ignore */ }
  }

  if (isViewer) {
    return (
      <div className="tt-card p-10 text-center max-w-md mx-auto">
        <Sparkles className="w-10 h-10 text-terra mx-auto mb-4" />
        <p className="font-display text-2xl mb-2 text-ink-deep">{t('agent.notAvailable')}</p>
        <p className="text-ink-deep/60 text-sm">{t('agent.notAvailableBody')}</p>
      </div>
    );
  }

  const phase = data?.phase;
  const showToday = phase === 'during' && todaysPicks.length > 0;
  const cats = CATS.filter((c) => c.key !== 'today' || showToday);
  const activeCat = cats.find((c) => c.key === cat) ? cat : 'all';

  // Agent tasks use GROUP context — all suggested tasks, not filtered by Mine.
  const suggestedTasks = data?.tasks || [];
  const savedTaskTitles = new Set(tasks.map((t) => t.title));

  const show = (key) => activeCat === 'all' || activeCat === key;
  const addPlace = (p) => setJourneyInitial({ type: 'activity', title: p.name, location_name: p.address });
  const placePath = `/gathering/${gatheringId}/agent/place`;

  // Build the suggested-marker layer from resolved coords. Suggestions without
  // coords are counted (quietly) only once resolution has finished.
  const suggMarkers = [];
  let suggWithoutCoords = 0;
  allSuggestions.forEach((s) => {
    const c = suggCoords[agentPlaceKey(s.place)];
    if (c && c.lat != null && c.lng != null) {
      suggMarkers.push({
        lat: c.lat, lng: c.lng, name: s.place.name,
        categoryLabel: s.categoryLabel, rating: s.place.rating,
        to: placePath, place: s.place,
      });
    } else if (!suggPending) {
      suggWithoutCoords += 1;
    }
  });

  // Shared numbering source for suggestion pins (map) and card rail markers.
  // Only resolved suggestions carry a number; while coords are pending the map
  // shows no suggestion pins, so cards show no numbers either — the two can
  // never drift. Both the map and the cards derive from this same pure function
  // over the same resolved list (suggMarkers).
  const suggNumbers = suggPending > 0 ? new Map() : suggestionRouteNumbers(suggMarkers);

  // Batched: keep the native-only set while resolving (no per-pin flicker),
  // then swap in the augmented set once resolution finishes — one map re-render.
  const mapItems = itemCoordsPending > 0 ? visibleItems : augmentItemsWithCoords(visibleItems, itemCoords);

  const mapRow = (
    <JourneyMapPanel
      items={mapItems}
      gatheringId={gatheringId}
      suggestions={suggPending > 0 ? [] : suggMarkers}
      suggestionsWithoutCoords={suggWithoutCoords}
      suggestionsPending={suggPending}
      itemsPending={itemCoordsPending}
    />
  );

  const regenerateAction = (
    <Button onClick={generate} disabled={loading} size="sm" className="shrink-0" aria-label={t('agent.reload')}>
      {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
      <span>{t('agent.reload')}</span>
    </Button>
  );
  const lengthSwitcher = (
    <div className="flex items-center gap-2">
      <Button
        variant={agentLength === 'short' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setAgentLength('short')}
        aria-pressed={agentLength === 'short'}
        aria-label={t('agent.short')}
        title={t('agent.short')}
        className={agentLength === 'short' ? 'bg-terra/10 text-terra-deep hover:bg-terra/15 border border-terra/25' : ''}
      >
        <ListChevronsDownUp />
      </Button>
      <Button
        variant={agentLength === 'long' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setAgentLength('long')}
        aria-pressed={agentLength === 'long'}
        aria-label={t('agent.long')}
        title={t('agent.long')}
        className={agentLength === 'long' ? 'bg-terra/10 text-terra-deep hover:bg-terra/15 border border-terra/25' : ''}
      >
        <ListChevronsUpDown />
      </Button>
    </div>
  );

  const filterRow = data && phase !== 'ended' && phase !== 'no_participants' ? (
    cats.map((c) => (
      <button key={c.key} onClick={() => setCat(c.key)} className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${activeCat === c.key ? 'bg-terra text-cream' : 'bg-foreground/5 text-foreground/70 hover:text-foreground border border-foreground/10'}`}>
        {c.label}
      </button>
    ))
  ) : null;

  return (
    <PageToolbar switcher={lengthSwitcher} images={images} setImages={setImages} mapOpen={mapOpen} setMapOpen={setMapOpen} showMapToggle mapRow={mapRow} action={regenerateAction} filterRow={filterRow}>
      <div className="space-y-5">
        {showReloadHint && (
          <p className="text-xs text-ink-deep/50 flex items-center gap-1.5 px-1">
            <Sparkles className="w-3 h-3 text-terra-deep shrink-0" />
            {t('agent.reloadHint')}
          </p>
        )}

        {loading && !data && <AgentSkeleton />}

        {error && (
          <div className="tt-card p-6 text-center max-w-md mx-auto border-terra/30">
            <Sparkles className="w-7 h-7 text-terra mx-auto mb-3" />
            <p className="font-display text-xl mb-1 text-ink-deep">{t('agent.conciergeSnag')}</p>
            <p className="text-ink-deep/60 text-sm mb-5">{error}</p>
            <Button onClick={generate}><Sparkles /> {t('common.tryAgain')}</Button>
          </div>
        )}

        {!loading && !data && !error && (
          <EmptyState
            icon={Sparkles}
            title={t('agent.yourConcierge')}
            body={t('agent.conciergeBody')}
            action={<Button onClick={generate}><Sparkles /> {t('agent.generateBrief')}</Button>}
          />
        )}

        {data && phase === 'ended' && (
          <div className="tt-card p-8 text-center max-w-md mx-auto">
            <CalendarDays className="w-10 h-10 text-terra mx-auto mb-4" />
            <p className="font-display text-2xl mb-2 text-ink-deep">{t('agent.tripEnded')}</p>
            <p className="text-ink-deep/60 text-sm">{t('agent.tripEndedBody')}</p>
          </div>
        )}

        {data && phase === 'no_participants' && (
          <div className="tt-card p-8 text-center max-w-md mx-auto">
            <Users className="w-10 h-10 text-terra mx-auto mb-4" />
            <p className="font-display text-2xl mb-2 text-ink-deep">{t('agent.noParticipants')}</p>
            <p className="text-ink-deep/60 text-sm">{data.message || t('agent.noParticipantsBody')}</p>
          </div>
        )}

        {data && phase !== 'ended' && phase !== 'no_participants' && (
          <div className="space-y-5">
            {showToday && show('today') && (
              <section>
                <SectionHeader icon={CalendarDays} title={t('agent.todaysPicks')} />
                <p className="text-xs text-ink-deep/55 mb-2.5 -mt-1">
                  Fits the gaps in today's plan{data.todayItems?.length ? ` — ${data.todayItems.map((i) => i.title).join(', ')}` : ''}.
                </p>
                <Timeline>
                  <div className="space-y-3">
                    {todaysPicks.map((p, i) => <AgentPlaceCard key={i} place={p} categoryLabel={t('agent.catToday')} gatheringId={gatheringId} onAdd={() => addPlace(p)} to={placePath} showImages={images} routeNumber={mapOpen ? suggNumbers.get(suggestionKey({ categoryLabel: t('agent.catToday'), place: p })) : undefined} />)}
                  </div>
                </Timeline>
              </section>
            )}

            {show('info') && data.vibe && <VibeCard vibe={data.vibe} />}

            {show('eat') && eatPlaces.length > 0 && (
              <section>
                <SectionHeader icon={UtensilsCrossed} title={t('agent.whereToEat')} count={eatPlaces.length} />
                <Timeline>
                  <div className="space-y-3">
                    {eatPlaces.map((p, i) => <AgentPlaceCard key={i} place={p} categoryLabel={t('agent.catEat')} gatheringId={gatheringId} onAdd={() => addPlace(p)} to={placePath} showImages={images} routeNumber={mapOpen ? suggNumbers.get(suggestionKey({ categoryLabel: t('agent.catEat'), place: p })) : undefined} />)}
                  </div>
                </Timeline>
              </section>
            )}

            {show('do') && doPlaces.length > 0 && (
              <section>
                <SectionHeader icon={Compass} title={t('agent.whatToDo')} count={doPlaces.length} />
                <Timeline>
                  <div className="space-y-3">
                    {doPlaces.map((p, i) => <AgentPlaceCard key={i} place={p} categoryLabel={t('agent.catDo')} gatheringId={gatheringId} onAdd={() => addPlace(p)} to={placePath} showImages={images} routeNumber={mapOpen ? suggNumbers.get(suggestionKey({ categoryLabel: t('agent.catDo'), place: p })) : undefined} />)}
                  </div>
                </Timeline>
              </section>
            )}

            {show('tasks') && (
              <section className="space-y-3">
                <div>
                  <SectionHeader icon={ClipboardList} title={t('agent.tripTasks')} />
                  <TaskChecklist tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} loading={loadingTasks} />
                </div>
                {suggestedTasks.length > 0 && (
                  <div>
                    <p className="tt-label text-ink-deep/45 mb-2">{t('agent.suggestedTasks')}</p>
                    <div className="space-y-2">
                      {suggestedTasks.map((task, i) => {
                        const added = savedTaskTitles.has(task.text);
                        return (
                          <div key={i} className="tt-card p-3 flex items-center gap-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-ink-deep leading-snug">{task.text}</p>
                              <span className="text-[0.625rem] text-ink-deep/45 capitalize">{task.category}</span>
                            </div>
                            {added ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#4a8b6f]/12 text-[#3f7a5e] text-xs font-semibold shrink-0">
                                <Check className="w-3.5 h-3.5" /> {t('agent.added')}
                              </span>
                              ) : (
                              <Button size="sm" onClick={() => createTask(task.text)} className="shrink-0">
                                <Plus /> {t('common.add')}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {show('info') && data.goodToKnow && <GoodToKnowCard goodToKnow={data.goodToKnow} rate={data.rate} />}
          </div>
        )}
      </div>

      {journeyInitial && (
        <JourneyItemForm
          gatheringId={gatheringId}
          currentMember={currentMember}
          initial={journeyInitial}
          onClose={() => setJourneyInitial(null)}
          onSaved={() => setJourneyInitial(null)}
        />
      )}
    </PageToolbar>
  );
}