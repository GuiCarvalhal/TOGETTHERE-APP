import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import OwnProfileEdit from '@/components/profile/OwnProfileEdit';
import OtherProfileView from '@/components/profile/OtherProfileView';
import { ArrowLeft } from 'lucide-react';

// Canonical universal Profile page. Not gathering-scoped: the user_id is the
// only route param. An optional ?g=<gatheringId> query param provides gathering
// context (role, relationship, visibility, arrival/departure) which is shown
// as a distinct context section, never as a second editable profile.
export default function Profile() {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const gatheringId = searchParams.get('g') || '';
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getProfile', { gathering_id: gatheringId || undefined, user_id: userId });
      setData(res.data || res);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [gatheringId, userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 pb-24">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-foreground/5 text-foreground" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">Profile</h1>
        </div>

        {loading ? (
          <div className="tt-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-16 h-16 rounded-full" />
              <div className="space-y-2 flex-1"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-24" /></div>
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div className="tt-card p-8 text-center">
            <p className="font-display text-lg text-ink-deep mb-1">Profile unavailable</p>
            <p className="text-sm text-ink-deep/60">{error}</p>
          </div>
        ) : data?.isSelf ? (
          <OwnProfileEdit data={data} gatheringId={gatheringId} userId={userId} onSaved={load} />
        ) : (
          <OtherProfileView data={data} gatheringId={gatheringId} userId={userId} onChanged={load} />
        )}
      </div>
    </div>
  );
}