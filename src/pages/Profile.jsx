import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import OwnProfileEdit from '@/components/profile/OwnProfileEdit';
import OtherProfileView from '@/components/profile/OtherProfileView';
import { ArrowLeft } from 'lucide-react';

// Dedicated full Profile page. Own profile is editable; another member's is a
// visibility-gated view driven by the reciprocal close/casual trust model.
export default function Profile() {
  const { id: gatheringId, userId } = useParams();
  const navigate = useNavigate();
  const outlet = useOutletContext();
  const openMore = outlet?.openMore;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getProfile', { gathering_id: gatheringId, user_id: userId });
      setData(res.data || res);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [gatheringId, userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-foreground/5 text-foreground/70 min-h-[40px]" aria-label="Back">
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
        <OwnProfileEdit data={data} gatheringId={gatheringId} onSaved={load} openMore={openMore} />
      ) : (
        <OtherProfileView data={data} gatheringId={gatheringId} userId={userId} onChanged={load} />
      )}
    </div>
  );
}