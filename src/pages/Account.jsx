import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import AppHeader from '@/components/tt/AppHeader';
import ProfileActionBar from '@/components/tt/ProfileActionBar';
import OwnProfileEdit from '@/components/profile/OwnProfileEdit';
import OwnProfileView from '@/components/profile/OwnProfileView';
import AccountSettings from '@/components/tt/AccountSettings';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

// Canonical universal Account page — the ONE self-profile + app-settings
// surface, opened from the top-right avatar on every page (Home and inside
// gatherings). Independent of any gathering: profile reads/writes target only
// the authenticated account globally (updateMe), with no Member/ACL/role
// writes. App settings (theme, language, sign out) are global and immediate.
//
// Two clear sections: Profile (own personal info / preferences / family) and
// App Settings (global). Chrome matches the rest of the app: the shared TopBar
// header + a sticky ProfileActionBar (Back / Edit / Save / Cancel) for the
// profile section. The App Settings section sits below as its own card with
// immediate-effect controls. Back returns to the originating route, falling
// back to Home on a direct link (no gathering dependency).
export default function Account() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editRef = useRef(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getProfile', { user_id: user.id });
      setData(res.data || res);
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('profile.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // After a self-profile save, reload the profile data AND refresh the shared
  // auth user so the top avatar / name update everywhere without a full reload.
  const onSaved = useCallback(() => {
    load();
    refreshUser();
  }, [load, refreshUser]);

  const onDirtyChange = useCallback((v) => setDirty(v), []);
  const onSavingChange = useCallback((v) => setSaving(v), []);
  const handleSave = useCallback(() => editRef.current?.save(), []);
  const handleCancel = useCallback(() => setEditing(false), []);
  const handleEdit = useCallback(() => setEditing(true), []);

  // Back returns to the originating route; on a direct link (no app history)
  // fall back to Home so the page is never stranded without a gathering.
  const onBack = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  }, [navigate]);

  if (!user?.id) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 pb-24">
        <h1 className="font-display text-2xl font-bold text-ink-deep mb-1">{t('account.account')}</h1>
        <p className="text-sm text-ink-deep/55 mb-4">{t('account.accountDesc')}</p>

        <ProfileActionBar
          onBack={onBack}
          isOwner
          editing={editing}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
          canSave={dirty}
          saving={saving}
        />

        <div className="mt-5 space-y-4">
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
          ) : editing ? (
            <OwnProfileEdit
              ref={editRef}
              data={data}
              userId={user?.id}
              onSaved={onSaved}
              onSaveDone={() => setEditing(false)}
              onDirtyChange={onDirtyChange}
              onSavingChange={onSavingChange}
            />
          ) : (
            <OwnProfileView data={data} userId={user?.id} onChanged={onSaved} />
          )}
        </div>

        {/* App Settings — global, immediate effect, always visible */}
        <div className="mt-6">
          <AccountSettings />
        </div>
      </div>
    </div>
  );
}