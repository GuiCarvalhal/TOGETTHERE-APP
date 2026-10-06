import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import AppHeader from '@/components/tt/AppHeader';
import ProfileActionBar from '@/components/tt/ProfileActionBar';
import OwnProfileEdit from '@/components/profile/OwnProfileEdit';
import OwnProfileView from '@/components/profile/OwnProfileView';
import OtherProfileView from '@/components/profile/OtherProfileView';
import { useI18n } from '@/lib/i18n';

// Canonical universal Profile page. Not gathering-scoped: the user_id is the
// only route param. An optional ?g=<gatheringId> query param provides gathering
// context (role, relationship, visibility, arrival/departure) which is shown
// as a distinct context section, never as a second editable profile.
//
// Chrome matches the rest of the app: the same TopBar mini header used by
// gathering pages, and a sticky ProfileActionBar (built on the shared StickyBar
// shell) directly below it. The owner gets an Edit → Save/Cancel flow; other
// viewers see Back only.
export default function Profile() {
  const { t } = useI18n();
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const gatheringId = searchParams.get('g') || '';
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getProfile', { gathering_id: gatheringId || undefined, user_id: userId });
      setData(res.data || res);
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('profile.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  }, [gatheringId, userId]);

  useEffect(() => { load(); }, [load]);

  const onDirtyChange = useCallback((v) => setDirty(v), []);
  const onSavingChange = useCallback((v) => setSaving(v), []);
  const handleSave = useCallback(() => editRef.current?.save(), []);
  const handleCancel = useCallback(() => setEditing(false), []);
  const handleEdit = useCallback(() => setEditing(true), []);
  const onBack = useCallback(() => navigate(-1), [navigate]);

  const isOwner = !!data?.isSelf;

  // Self-profile now lives on the unified Account page; redirect there so the
  // legacy /profile/<ownId> route (and any deep links) land on the canonical
  // surface instead of rendering a duplicate.
  if (!loading && isOwner) return <Navigate to="/account" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader gatheringId={gatheringId} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 pb-24">
        <ProfileActionBar
          onBack={onBack}
          isOwner={isOwner}
          editing={editing}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
          canSave={dirty}
          saving={saving}
        />

        <div className="mt-5">
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
              <p className="font-display text-lg text-ink-deep mb-1">{t('profile.profileUnavailable')}</p>
              <p className="text-sm text-ink-deep/60">{error}</p>
            </div>
          ) : isOwner ? (
            editing ? (
              <OwnProfileEdit
                ref={editRef}
                data={data}
                gatheringId={gatheringId}
                userId={userId}
                onSaved={load}
                onSaveDone={() => setEditing(false)}
                onDirtyChange={onDirtyChange}
                onSavingChange={onSavingChange}
              />
            ) : (
              <OwnProfileView data={data} gatheringId={gatheringId} userId={userId} onChanged={load} />
            )
          ) : (
            <OtherProfileView data={data} gatheringId={gatheringId} userId={userId} onChanged={load} />
          )}
        </div>
      </div>
    </div>
  );
}