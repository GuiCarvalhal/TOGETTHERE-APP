import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Bookmark, BookmarkCheck, X, UtensilsCrossed, Compass, Coffee, BedDouble, MapPin } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';
import MemberAvatar from '@/components/tt/MemberAvatar';

const CAT_ICON = { restaurant: UtensilsCrossed, activity: Compass, cafe: Coffee, stay: BedDouble, experience: Sparkles };
const CAT_COLOR = { restaurant: '#E05A47', activity: '#F07865', cafe: '#C8493A', stay: '#1E2633', experience: '#E05A47' };

export default function GatheringAgent() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [recs, setRecs] = useState([]);
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
    } catch (e) {
      setError(e.message || 'The concierge is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }

  // group by day
  const byDay = {};
  recs.forEach((r) => {
    if (isDismissed(r.name)) return;
    const k = r.day || 'Your trip';
    (byDay[k] = byDay[k] || []).push(r);
  });
  const days = Object.keys(byDay);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-terra-coral" /> Agent
        </h2>
        <p className="text-cream/60 text-sm mt-1">Your AI concierge reads the group's profiles and journey, then tailors each day to where you'll actually be.</p>
      </div>

      {/* Stage / intro card */}
      <div className="tt-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-terra/15 border border-terra/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-terra-deep" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-xl font-bold text-ink-deep">Personalized for your crew</h3>
            <p className="text-sm text-ink-deep/60 mt-1">
              {members.filter((m) => m.role !== 'viewer').length} participants · matching dietary needs, interests, budgets and stay locations.
            </p>
          </div>
          <button onClick={generate} disabled={loading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep disabled:opacity-60 shrink-0">
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
        <div className="space-y-6">
          <div className="tt-card p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-terra mx-auto mb-4" />
            <p className="font-display text-xl text-ink-deep">Curating your trip…</p>
            <p className="text-ink-deep/60 text-sm mt-1">Reading profiles and the journey timeline.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="tt-card p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-xl" tone="cream" />
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

      {summary && (
        <p className="font-display italic text-lg text-cream/80 max-w-2xl">{summary}</p>
      )}

      {recs.length > 0 && (
        <div className="space-y-8">
          {days.map((day) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-terra/15 border border-terra/30 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-terra-coral" />
                </div>
                <div>
                  <p className="tt-label text-terra-coral">Recommendations</p>
                  <p className="font-display text-lg text-cream">{day}</p>
                </div>
                <div className="flex-1 h-px bg-white/10 ml-2" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {byDay[day].map((r, i) => {
                  const Icon = CAT_ICON[r.category] || Compass;
                  return (
                    <div key={i} className="tt-card p-5 flex flex-col">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${CAT_COLOR[r.category]}15`, border: `1px solid ${CAT_COLOR[r.category]}40` }}>
                          <Icon className="w-5 h-5" style={{ color: CAT_COLOR[r.category] }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display text-lg font-bold text-ink-deep leading-tight">{r.name}</h3>
                          <p className="text-xs text-ink-deep/50 capitalize mt-0.5">{r.location} · {r.category}{r.price_level ? ` · ${r.price_level}` : ''}</p>
                        </div>
                      </div>
                      {r.why_sentence && (
                        <p className="text-sm text-ink-deep/80 mt-3 italic font-display leading-relaxed border-l-2 border-terra/40 pl-3">{r.why_sentence}</p>
                      )}
                      <p className="text-sm text-ink-deep/70 mt-3">{r.description}</p>
                      {r.matches?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {r.matches.map((mt, j) => {
                            const member = members.find((m) => m.full_name === mt.member_name);
                            return (
                              <span key={j} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full bg-cream-pale border border-ink-charcoal/15" title={mt.reason}>
                                {member ? <MemberAvatar member={member} size="xs" /> : <span className="w-7 h-7 rounded-full bg-terra/15 text-terra-deep text-[0.625rem] font-bold flex items-center justify-center">{(mt.member_name || '?')[0]}</span>}
                                <span className="text-xs font-medium text-ink-deep">{mt.member_name}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {r.why?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {r.why.map((w, j) => (
                            <span key={j} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-terra/10 text-terra-deep text-xs font-medium border border-terra/20">
                              <Sparkles className="w-3 h-3" /> {w}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-ink-charcoal/10">
                        <button onClick={() => (isSaved(r.name) ? null : save(r.name))} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${isSaved(r.name) ? 'bg-terra text-cream' : 'bg-cream-pale text-ink-deep hover:bg-cream-warm'}`}>
                          {isSaved(r.name) ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                          {isSaved(r.name) ? 'Saved' : 'Save'}
                        </button>
                        <button onClick={() => dismiss(r.name)} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-ink-deep/50 hover:text-terra-deep hover:bg-cream-pale">
                          <X className="w-3.5 h-3.5" /> Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {state.saved.length > 0 && (
        <section>
          <h3 className="tt-label text-cream/50 mb-3">Saved by you</h3>
          <div className="flex flex-wrap gap-2">
            {state.saved.map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-terra/15 text-cream text-sm border border-terra/30">
                <BookmarkCheck className="w-3.5 h-3.5 text-terra-coral" /> {name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}