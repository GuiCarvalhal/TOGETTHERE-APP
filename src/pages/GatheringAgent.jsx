import React, { useState, useEffect, useCallback } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { timeAgo } from '@/lib/gatheringHelpers';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import PageToolbar from '@/components/tt/PageToolbar';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';
import PlaceCard from '@/components/agent/PlaceCard';
import VibeCard from '@/components/agent/VibeCard';
import GoodToKnowCard from '@/components/agent/GoodToKnowCard';
import TaskChecklist from '@/components/agent/TaskChecklist';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import { Sparkles, Loader2, Plus, Check, UtensilsCrossed, Compass, ClipboardList, CalendarDays } from 'lucide-react';

const CATS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'eat', label: 'Eat' },
  { key: 'do', label: 'Do' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'info', label: 'Info' },
];

function SectionHeader({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-terra-deep" />
      <h3 className="font-display text-base font-bold text-ink-deep">{title}</h3>
      {count != null && <span className="text-xs text-ink-deep/45">· {count}</span>}
    </div>
  );
}

export default function GatheringAgent() {
  const { gatheringId, gathering, members, currentMember, role, setFab } = useGathering();
  const { scope, setScope, images, setImages } = useViewPrefs(gatheringId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('all');
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [journeyInitial, setJourneyInitial] = useState(null);

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
      setError(e.response?.data?.error || e.message || 'The concierge is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [gatheringId, storeKey]);

  // Load the last cached brief on mount (no API call); the user regenerates manually.
  useEffect(() => {
    if (isViewer) return;
    try {
      const cached = localStorage.getItem(storeKey);
      if (cached) setData(JSON.parse(cached));
    } catch { /* ignore */ }
  }, [storeKey, isViewer]);

  useEffect(() => {
    if (!isViewer) setFab({ label: 'Regenerate', icon: Sparkles, onClick: generate });
    return () => setFab(null);
  }, [setFab, generate, isViewer]);

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
      alert(e.response?.data?.error || e.message || 'Could not add task');
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
        <p className="font-display text-2xl mb-2 text-ink-deep">Agent isn't available to viewers</p>
        <p className="text-ink-deep/60 text-sm">The AI concierge is a participant tool. Ask the organizer to change your role to Member.</p>
      </div>
    );
  }

  const phase = data?.phase;
  const showToday = phase === 'during' && data?.todaysPicks?.length > 0;
  const cats = CATS.filter((c) => c.key !== 'today' || showToday);
  const activeCat = cats.find((c) => c.key === cat) ? cat : 'all';

  const myName = currentMember?.full_name;
  const suggestedTasks = (data?.tasks || []).filter((t) => {
    if (scope !== 'mine') return true;
    const fm = t.forMembers || [];
    return fm.length === 0 || fm.includes(myName);
  });
  const savedTaskTitles = new Set(tasks.map((t) => t.title));

  const show = (key) => activeCat === 'all' || activeCat === key;
  const addPlace = (p) => setJourneyInitial({ type: 'activity', title: p.name, location_name: p.address });

  return (
    <div className="space-y-5">
      <PageToolbar scope={scope} setScope={setScope} images={images} setImages={setImages} />

      {/* Stage */}
      <div className="tt-card p-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-terra/15 border border-terra/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-terra-deep" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-ink-deep">Personalized for your crew</h3>
            <p className="text-sm text-ink-deep/60 mt-0.5 truncate">
              {members.filter((m) => m.role !== 'viewer').length} participants · {gathering?.destinations?.join(', ') || 'your destination'}
            </p>
            {data && !loading && <p className="text-[0.625rem] text-ink-deep/40 mt-1">Updated {timeAgo(data.generatedAt)} ago</p>}
          </div>
          <button onClick={generate} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep disabled:opacity-60 shrink-0 text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {data ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Category filter */}
      {data && phase !== 'ended' && (
        <div className="flex gap-2 overflow-x-auto tt-no-scrollbar -mx-1 px-1 pb-1">
          {cats.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${activeCat === c.key ? 'bg-terra text-cream' : 'tt-ink-panel text-ink-deep/70 hover:text-ink-deep'}`}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-5">
          <div className="tt-card p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-terra mx-auto mb-4" />
            <p className="font-display text-xl text-ink-deep">Curating your trip…</p>
            <p className="text-ink-deep/60 text-sm mt-1">Reading profiles, the journey timeline, and nearby places.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        </div>
      )}

      {error && (
        <div className="tt-card p-6 text-center max-w-md mx-auto border-terra/30">
          <Sparkles className="w-7 h-7 text-terra mx-auto mb-3" />
          <p className="font-display text-xl mb-1 text-ink-deep">The concierge hit a snag</p>
          <p className="text-ink-deep/60 text-sm mb-5">{error}</p>
          <button onClick={generate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep">
            <Sparkles className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {!loading && !data && !error && (
        <EmptyState icon={Sparkles} title="Your AI concierge" body="Generate a personalized brief: group vibe, real nearby places to eat and explore, prep tasks, and the practical info you need — all tuned to your route and dates." />
      )}

      {data && phase === 'ended' && (
        <div className="tt-card p-8 text-center max-w-md mx-auto">
          <CalendarDays className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">This trip has ended</p>
          <p className="text-ink-deep/60 text-sm">The concierge no longer generates new suggestions for past trips. Look back at your journey and expenses instead.</p>
        </div>
      )}

      {data && phase !== 'ended' && (
        <div className="space-y-7">
          {showToday && show('today') && (
            <section>
              <SectionHeader icon={CalendarDays} title="Today's picks" />
              <p className="text-xs text-ink-deep/55 mb-3 -mt-1">
                Fits the gaps in today's plan{data.todayItems?.length ? ` — ${data.todayItems.map((i) => i.title).join(', ')}` : ''}.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {data.todaysPicks.map((p, i) => <PlaceCard key={i} place={p} onAdd={() => addPlace(p)} />)}
              </div>
            </section>
          )}

          {show('info') && data.vibe && <VibeCard vibe={data.vibe} />}

          {show('eat') && data.whereToEat?.length > 0 && (
            <section>
              <SectionHeader icon={UtensilsCrossed} title="Where to eat" count={data.whereToEat.length} />
              <div className="grid sm:grid-cols-2 gap-3">
                {data.whereToEat.map((p, i) => <PlaceCard key={i} place={p} onAdd={() => addPlace(p)} />)}
              </div>
            </section>
          )}

          {show('do') && data.whatToDo?.length > 0 && (
            <section>
              <SectionHeader icon={Compass} title="What to do" count={data.whatToDo.length} />
              <div className="grid sm:grid-cols-2 gap-3">
                {data.whatToDo.map((p, i) => <PlaceCard key={i} place={p} onAdd={() => addPlace(p)} />)}
              </div>
            </section>
          )}

          {show('tasks') && (
            <section className="space-y-3">
              <div>
                <SectionHeader icon={ClipboardList} title="Trip tasks" />
                <TaskChecklist tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} loading={loadingTasks} />
              </div>
              {suggestedTasks.length > 0 && (
                <div>
                  <p className="tt-label text-ink-deep/45 mb-2">Suggested tasks</p>
                  <div className="space-y-2">
                    {suggestedTasks.map((t, i) => {
                      const added = savedTaskTitles.has(t.text);
                      return (
                        <div key={i} className="tt-card p-3 flex items-center gap-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink-deep leading-snug">{t.text}</p>
                            <span className="text-[0.625rem] text-ink-deep/45 capitalize">{t.category}</span>
                          </div>
                          {added ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#4a8b6f]/12 text-[#3f7a5e] text-xs font-semibold shrink-0">
                              <Check className="w-3.5 h-3.5" /> Added
                            </span>
                          ) : (
                            <button onClick={() => createTask(t.text)} className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-full bg-terra text-cream text-xs font-semibold hover:bg-terra-deep shrink-0">
                              <Plus className="w-3.5 h-3.5" /> Add
                            </button>
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

      {journeyInitial && (
        <JourneyItemForm
          gatheringId={gatheringId}
          currentMember={currentMember}
          initial={journeyInitial}
          onClose={() => setJourneyInitial(null)}
          onSaved={() => setJourneyInitial(null)}
        />
      )}
    </div>
  );
}