import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, CalendarDays, Check, Eye, Users, ArrowRight } from 'lucide-react';
import { formatDateRange } from '@/lib/gatheringHelpers';

export default function JoinGathering() {
  const { gatheringId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const asViewer = params.get('as') === 'viewer';
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await base44.functions.invoke('getJoinInfo', { gathering_id: gatheringId });
        const data = res.data || res;
        if (!active) return;
        setInfo(data);
        if (data.isMember) {
          navigate(`/gathering/${gatheringId}/journey`, { replace: true });
        }
      } catch (e) {
        setError(e.response?.data?.error || e.message || 'Could not load gathering');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [gatheringId]);

  async function handleJoin() {
    setActing(true);
    try {
      const res = await base44.functions.invoke('requestToJoin', {
        gathering_id: gatheringId,
        requested_role: asViewer ? 'viewer' : 'member',
      });
      const data = res.data || res;
      // Joining is immediate through either link. An existing member is never
      // re-joined and never has their role changed by a link.
      if (data.status === 'joined' || data.status === 'already_member') {
        setResult('joined');
        setTimeout(() => navigate(`/gathering/${gatheringId}/journey`, { replace: true }), 700);
      } else {
        setResult('joined');
        setTimeout(() => navigate(`/gathering/${gatheringId}/journey`, { replace: true }), 700);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not join');
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-terra" />
      </div>
    );
  }
  if (error || !info) {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center text-cream px-6 text-center">
        <p className="font-display text-3xl mb-2">Couldn't open this invite</p>
        <p className="text-cream/60 mb-6">{error || 'This gathering may have been removed.'}</p>
        <Link to="/" className="px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">Back to gatherings</Link>
      </div>
    );
  }

  const g = info.gathering;

  return (
    <div className="min-h-screen bg-ink text-cream flex flex-col">
      <header className="sticky top-0 z-30 bg-ink/95 backdrop-blur-xl border-b border-white/5 tt-safe-top">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">TOGETTHERE</Link>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Preview card */}
        <div className="tt-card overflow-hidden">
          <div className="relative aspect-[16/8] w-full overflow-hidden bg-cream-pale">
            {g.cover_image ? (
              <Image src={g.cover_image} alt={g.name} className="w-full h-full object-cover" fittingType="fill" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-ink-soft via-ink to-ink-deep flex items-center justify-center">
                <span className="font-display italic text-cream/30 text-5xl">TOGETTHERE</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-deep/80 via-transparent to-transparent" />
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              {asViewer && <span className="tt-stamp bg-transparent text-ink-deep/55 border-ink-charcoal/25 border-dashed">Viewer invite</span>}
              {!asViewer && <span className="tt-stamp bg-transparent text-ink-deep/55 border-ink-charcoal/25 border-dashed">Member invite</span>}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink-deep leading-tight">{g.name}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-ink-deep/70 text-sm">
              {g.start_date && <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-terra-deep" />{formatDateRange(g.start_date, g.end_date)}</span>}
              {g.destinations?.length > 0 && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-terra-deep" />{g.destinations.join(' · ')}</span>}
            </div>
            {g.description && <p className="text-ink-deep/70 text-sm mt-4 leading-relaxed">{g.description}</p>}
          </div>
        </div>

        {/* Action panel — immediate join, role set by the link */}
        <div className="mt-6 tt-card p-6">
          {result === 'joined' ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-terra/15 text-terra-deep flex items-center justify-center mx-auto mb-3"><Check className="w-6 h-6" /></div>
              <p className="font-display text-2xl text-ink-deep mb-1">You're in!</p>
              <p className="text-ink-deep/60 text-sm">Taking you to the gathering…</p>
            </div>
          ) : (
            <div>
              <p className="text-ink-deep/70 text-sm mb-4">
                {asViewer
                  ? "You'll join as a Viewer with read-only access to the journey and members — no expenses or agent."
                  : "You'll join as a Member and can take part in the journey, expenses, and the agent."}
              </p>
              <Button onClick={handleJoin} disabled={acting} className="w-full bg-terra hover:bg-terra-deep text-cream rounded-full h-11">
                {acting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : (asViewer ? <Eye className="w-5 h-5 mr-2" /> : <Users className="w-5 h-5 mr-2" />)}
                {asViewer ? 'Join as Viewer' : 'Join gathering'}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-cream/55 hover:text-cream text-sm">Back to gatherings <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </main>
    </div>
  );
}