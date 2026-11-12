import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import ProfileActionBar from '@/components/tt/ProfileActionBar';
import OwnProfileEdit from '@/components/profile/OwnProfileEdit';
import OwnProfileView from '@/components/profile/OwnProfileView';
import { useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

// Personal info area of the account flow. Reads and writes ONLY the signed-in
// user's own global profile (getProfile / updateMe through OwnProfileEdit), with
// no Member/ACL/role writes. The sticky bar keeps Edit / Save / Cancel at thumb
// reach; the area page header carries the single Back link to the hub.
export default function AccountAreaPersonal() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
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

  // After a self-profile save, reload the profile AND refresh the shared auth
  // user so the header avatar / name update everywhere without a full reload.
  const onSaved = useCallback(() => {
    load();
    refreshUser();
  }, [load, refreshUser]);

  return (
    <>
      <ProfileActionBar
        onBack={() => navigate('/account')}
        isOwner
        editing={editing}
        onEdit={() => setEditing(true)}
        onSave={() => editRef.current?.save()}
        onCancel={() => setEditing(false)}
        canSave={dirty}
        saving={saving}
      />

      <AccountAreaHeader
        Icon={UserRound}
        titleKey="account.menuPersonal"
        descKey="account.secPersonalDesc"
      />

      {loading ? (
        <div className="tt-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div className="space-y-2 flex-1 min-w-0">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-4 w-24" />
            </div>
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
          onDirtyChange={setDirty}
          onSavingChange={setSaving}
        />
      ) : (
        <OwnProfileView data={data} userId={user?.id} onChanged={onSaved} />
      )}
    </>
  );
}