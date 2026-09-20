import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, MapPin } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';
import AgentCard from '@/components/tt/cards/AgentCard';
import PageToolbar from '@/components/tt/PageToolbar';
import { useViewPrefs } from '@/hooks/useViewPrefs';

export default function GatheringAgent() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const { scope, setScope, images, setImages } = useViewPrefs(gatheringId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [recs, setRecs] = useState([]);
  const [daySummaries, setDaySummaries] = useState([]);
  const storeKey = `tt-agent-${gatheringId}`;
  const [state, setState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || '{"saved":[],"dismissed":[]}'); }
    catch { return { saved: [], dismissed: [] }; }
  });

  useEffect(() => {
    setFab({ label: 'Ask Agent', icon: Sparkles, onClick: generate });
    return () => setFab(null);
  }, [setFab]);

  if (role === 'viewer') {
    return (
      <div className="tt-card p-10 text-center max-w-md mx-auto">
        <Sparkles className="w-10 h-10 text-terra mx-auto mb-4" />
        <p className="font-display text-2xl mb-2 text-ink-deep">Agent isn't available to viewers</p>
        <p className="text-ink-deep/60 text-sm">The AI concierge is a participant tool. Ask the organizer to change your role to Member.</p>
      </div>
    );
  }

  function persist(next) {
    setState(next);
    localStorage.setItem(storeKey, JSON.stringify(next));
  }
  function save(name) {
    if (state.saved.includes(name)) return;
    persist({ ...state, saved: [...state.saved, name], dismissed: state.dismissed.filter((n) => n !== name) });
  }
  function dismiss(name) {
    persist({ ...state, saved: state.saved.filter((n) => n !== name), dismissed: [...state.dismissed, name] });
  }
  function isDismissed(name) { return state.dismissed.includes(name); }
  function isSaved(name) { return state.saved.includes(name); }

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('generateRecommendations', { gathering_id: gatheringId });
      const data = res.data || res;
      setSummary(data.summary || '');
      setRecs(data.recommendations || []);
      setDaySummaries(data.day_summaries || []);
    } catch (e) {
      setError(e.message || 'The concierge is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }

  const visibleRecs = recs.filter((r) => {
    if (isDismissed(r.name)) return false;
    if (scope === 'mine') return (r.matches || []).some((mt) => mt.member_name === currentMember?.full_name);
    return true;
  });
  const byDay = {};
  visibleRecs.forEach((r) => {
    const k = r.day || 'Your trip';
    (byDay[k] = byDay[k] || []).push(r);
  });
  const days = Object.keys(byDay);
  const daySummaryMap = {};
  (daySummaries || []).forEach((d) => { daySummaryMap[d.day] = d.summary; });

  return (
    <div className="space-y-6">
      <PageToolbar scope={scope} setScope={setScope} images={images} setImages={setImages} />

      {/* Stage / intro card */}
      <div className="tt-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-terra/15 border border-terra/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-terra-deep" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-ink-deep">Personalized for your crew</h3>
            <p className="text-sm text-ink-deep/60 mt-0.5">
              {members.filter((m) => m.role !== 'viewer').length} participants · matching dietary needs, interests, budgets and stay locations.
            </p>
          </div>
          <button onClick={generate} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep disabled:opacity-60 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {recs.length ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="tt-card p-6 text-center max-w-md mx-auto border-terra/30">
          <div className="w-14 h-14 rounded-2xl bg-terra/10 border border-terra/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-terra" strokeWidth={1.5} />
          </div>
          <p className="font-display text-xl mb-1 text-ink-deep">The concierge hit a snag</p>
          <p className="text-ink-deep/60 text-sm mb-5">{error}</p>
          <button onClick={generate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep">
            <Sparkles className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {loading && recs.length === 0 && (
        <div className="space-y-5">
          <div className="tt-card p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-terra mx-auto mb-4" />
            <p className="font-display text-xl text-ink-deep">Curating your trip…</p>
            <p className="text-ink-deep/60 text-sm mt-1">Reading profiles and the journey timeline.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="tt-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg" tone="cream" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" tone="cream" /><Skeleton className="h-3 w-1/3" tone="cream" /></div>
                </div>
                <Skeleton className="h-3 w-full" tone="cream" />
                <Skeleton className="h-3 w-4/5" tone="cream" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && recs.length === 0 && !error && (
        <EmptyState
          icon={Sparkles}
          title="No recommendations yet"
          body="Generate tailored picks for restaurants, cafés and activities near where the group will actually be — each one matched to your crew's diets, interests and budget."
        />
      )}

      {!loading && recs.length > 0 && visibleRecs.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="None matched to you"
          body="No recommendations in this view are tailored to you. Switch to Group to see the full list."
        />
      )}

      {summary && (
        <p className="font-display italic text-base text-foreground/80 max-w-2xl">{summary}</p>
      )}

      {visibleRecs.length > 0 && (
        <div className="space-y-7">
          {days.map((day) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-terra/15 border border-terra/30 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-terra-coral" />
                </div>
                <div>
                  <p className="tt-label text-terra-coral">Recommendations</p>
                  <p className="font-display text-base text-foreground">{day}</p>
                </div>
                <div className="flex-1 h-px bg-foreground/10 ml-2" />
              </div>
              {daySummaryMap[day] && (
                <p className="text-sm text-foreground/70 italic font-display leading-relaxed mb-3 pl-1">{daySummaryMap[day]}</p>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                {byDay[day].map((r, i) => (
                  <AgentCard
                    key={i}
                    rec={r}
                    members={members}
                    isSaved={isSaved(r.name)}
                    onSave={() => save(r.name)}
                    onDismiss={() => dismiss(r.name)}
                    showImages={images}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {state.saved.length > 0 && (
        <section>
          <h3 className="tt-label text-foreground/50 mb-3">Saved by you</h3>
          <div className="flex flex-wrap gap-2">
            {state.saved.map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-terra/15 text-foreground text-sm border border-terra/30">
                <Sparkles className="w-3.5 h-3.5 text-terra-coral" /> {name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}