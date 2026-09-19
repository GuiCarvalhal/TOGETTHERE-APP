import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, CalendarDays, Check, Clock, Lock, Eye, Users, ArrowRight, Sparkles } from 'lucide-react';
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
      setResult(data.status);
      if (data.status === 'joined') {
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
  const mode = g.privacy_mode || 'invite';

  return (
    <div className="min-h-screen bg-ink text-cream flex flex-col">
      <header className="border-b border-white/5">
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
              <span className="tt-stamp bg-terra/15 text-terra-coral border-terra/30 capitalize">{g.status}</span>
              {asViewer && <span className="tt-stamp bg-transparent text-ink-deep/55 border-ink-charcoal/25 border-dashed">Viewer invite</span>}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink-deep leading-tight">{g.name}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-ink-deep/70 text-sm">
              {g.start_date && <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-terra-deep" />{formatDateRange(g.start_date, g.end_date)}</span>}
              {g.destinations?.length > 0 && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-terra-deep" />{g.destinations.join(' · ')}</span>}
            </div>
            {g.description && <p className="text-ink-deep/70 text-sm mt-4 leading-relaxed">{g.description}</p>}
          </div>
        </div>

        {/* Action panel */}
        <div className="mt-6 tt-card p-6">
          {result === 'joined' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-terra/15 text-terra-deep flex items-center justify-center mx-auto mb-3"><Check className="w-6 h-6" /></div>
              <p className="font-display text-2xl text-ink-deep mb-1">You're in!</p>
              <p className="text-ink-deep/60 text-sm">Taking you to the gathering…</p>
            </div>
          )}
          {result === 'requested' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-terra/15 text-terra-deep flex items-center justify-center mx-auto mb-3"><Clock className="w-6 h-6" /></div>
              <p className="font-display text-2xl text-ink-deep mb-1">Request sent</p>
              <p className="text-ink-deep/60 text-sm">The host will review your request and let you in.</p>
            </div>
          )}
          {result === 'pending' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-terra/15 text-terra-deep flex items-center justify-center mx-auto mb-3"><Clock className="w-6 h-6" /></div>
              <p className="font-display text-2xl text-ink-deep mb-1">Already requested</p>
              <p className="text-ink-deep/60 text-sm">You have a pending request. The host will respond soon.</p>
            </div>
          )}
          {!result && mode === 'invite' && (
            <div className="text-center py-2">
              <Lock className="w-10 h-10 text-terra mx-auto mb-3" />
              <p className="font-display text-2xl text-ink-deep mb-1">Invite-only</p>
              <p className="text-ink-deep/60 text-sm max-w-sm mx-auto">This gathering is invite-only. Ask the host to add you directly, or send you a personal invite link.</p>
            </div>
          )}
          {!result && mode === 'open' && (
            <div>
              <p className="text-ink-deep/70 text-sm mb-4">This gathering is open — anyone with the link can join. {asViewer ? 'You\'ll join as a Viewer with read-only access.' : 'You\'ll join as a Member.'}</p>
              <Button onClick={handleJoin} disabled={acting} className="w-full bg-terra hover:bg-terra-deep text-cream rounded-full h-11">
                {acting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : (asViewer ? <Eye className="w-5 h-5 mr-2" /> : <Users className="w-5 h-5 mr-2" />)}
                {asViewer ? 'Join as Viewer' : 'Join gathering'}
              </Button>
            </div>
          )}
          {!result && mode === 'approval' && (
            <div>
              <p className="text-ink-deep/70 text-sm mb-4">The host approves each request. {asViewer ? 'You\'re requesting to join as a Viewer (read-only).' : 'You\'re requesting to join as a Member.'}</p>
              <Button onClick={handleJoin} disabled={acting} className="w-full bg-terra hover:bg-terra-deep text-cream rounded-full h-11">
                {acting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
                Request to join
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