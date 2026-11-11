import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
  Inbox as InboxIcon, ChevronRight, UserRound, SlidersHorizontal, Bell, Plug, ShieldCheck, Smartphone,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import AppHeader from '@/components/tt/AppHeader';
import ProfileActionBar from '@/components/tt/ProfileActionBar';
import SettingsSection from '@/components/tt/SettingsSection';
import SettingsRow from '@/components/tt/SettingsRow';
import OwnProfileEdit from '@/components/profile/OwnProfileEdit';
import OwnProfileView from '@/components/profile/OwnProfileView';
import AccountPreferences from '@/components/account/AccountPreferences';
import AccountSecuritySection from '@/components/account/AccountSecuritySection';
import FinancialAccounts from '@/components/account/FinancialAccounts';
import InboxConnectors from '@/components/account/InboxConnectors';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

// Canonical universal Account page — the ONE self-profile + app-settings
// surface, opened from the top-right avatar on every page (Home and inside
// gatherings). Independent of any gathering: profile reads/writes target only
// the authenticated account globally (updateMe), with no Member/ACL/role writes.
//
// Organized as five scannable sections so it stays easy to navigate as settings
// grow — Personal info, Preferences, System & notifications, Connected apps &
// integrations, Security & privacy. Every existing control lives in exactly one
// of them; nothing is removed. Chrome matches the rest of the app: the shared
// TopBar header + the sticky ProfileActionBar (Back / Edit / Save / Cancel) that
// edits the Personal info section.
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
      <div className="tt-page py-5 pb-28">
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

        <div className="mt-7 space-y-9">
          {/* 1 — Personal info */}
          <SettingsSection icon={UserRound} title={t('account.secPersonal')} subtitle={t('account.secPersonalDesc')}>
            {loading ? (
              <div className="tt-card p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <div className="space-y-2 flex-1 min-w-0"><Skeleton className="h-5 w-40 max-w-full" /><Skeleton className="h-4 w-24" /></div>
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
          </SettingsSection>

          {/* 2 — Preferences */}
          <SettingsSection icon={SlidersHorizontal} title={t('account.secPreferences')} subtitle={t('account.secPreferencesDesc')}>
            <AccountPreferences />
          </SettingsSection>

          {/* 3 — System & notifications */}
          <SettingsSection icon={Bell} title={t('account.secSystem')} subtitle={t('account.secSystemDesc')}>
            <div className="tt-card p-1.5 sm:p-2">
              <SettingsRow
                icon={Smartphone}
                label={t('account.installApp')}
                hint={t('home.installBannerBody')}
                to="/add-to-home-screen"
              />
              <div className="border-t border-ink-charcoal/10" />
              <SettingsRow icon={Bell} label={t('account.notifications')} hint={t('account.notificationsDesc')} />
            </div>
          </SettingsSection>

          {/* 4 — Connected apps & integrations */}
          <SettingsSection icon={Plug} title={t('account.secIntegrations')} subtitle={t('account.secIntegrationsDesc')}>
            <div className="tt-card p-4 sm:p-5">
              <InboxConnectors />
            </div>
            <div className="tt-card p-1.5 sm:p-2">
              <SettingsRow
                icon={InboxIcon}
                label={t('inbox.title')}
                hint={t('account.inboxRowDesc')}
                to="/inbox"
              />
            </div>
            {/* Banks & cards — imported transactions stay suggestions until the
                user creates an expense from one through the standard form. */}
            <FinancialAccounts />
          </SettingsSection>

          {/* 5 — Security & privacy */}
          <SettingsSection icon={ShieldCheck} title={t('account.secSecurity')} subtitle={t('account.secSecurityDesc')}>
            <AccountSecuritySection />
          </SettingsSection>
        </div>

        <div className="mt-8 flex justify-center">
          <Link to="/how-it-works" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-deep/50 hover:text-ink-deep transition-colors">
            {t('howItWorks.label')}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}