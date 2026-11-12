import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import { useOneSignal } from '@/lib/useOneSignal';
import { Switch } from '@/components/ui/switch';
import { Bell, BellOff, BellRing, Plane, Receipt, Users, Clock, Sparkles } from 'lucide-react';

// Notification controls for the Account area.
//  • Device row: whether THIS device can receive push right now, with an
//    explicit on/off control (OneSignal permission + opt-in/out).
//  • Category rows: the same five categories the app already sends, stored on
//    the user's membership in every gathering (updateMyNotificationPrefs with
//    scope "all"), so switching one here matches the per-gathering sheet.
const CATEGORIES = [
  { key: 'notify_journey', labelKey: 'account.journeyUpdates', Icon: Plane },
  { key: 'notify_expenses', labelKey: 'account.expenses', Icon: Receipt },
  { key: 'notify_members', labelKey: 'account.memberActivity', Icon: Users },
  { key: 'notify_reminders', labelKey: 'account.reminders', Icon: Clock },
  { key: 'notify_ai', labelKey: 'account.aiRecommendations', Icon: Sparkles },
];

const DEFAULTS = {
  notify_master: true,
  notify_journey: true,
  notify_expenses: true,
  notify_members: true,
  notify_reminders: true,
  notify_ai: true,
};

export default function AccountNotifications() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { supported, configured, permission, ready, requestPermission, optOut } = useOneSignal(user?.id);
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [error, setError] = useState('');

  // Aggregate every membership: a category counts as on only when it is on in
  // all of them, which is what "applies to every gathering" means.
  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      let rows = await base44.entities.Member.filter({ user_id: user.id });
      if ((!rows || !rows.length) && user.email) {
        rows = await base44.entities.Member.filter({ email: user.email });
      }
      const list = rows || [];
      const next = { ...DEFAULTS };
      for (const key of Object.keys(DEFAULTS)) {
        if (!list.length) break;
        next[key] = list.every((row) => row[key] !== false);
      }
      setPrefs(next);
    } catch {
      setPrefs({ ...DEFAULTS });
    }
  }, [user?.id, user?.email]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key, value) => {
    setError('');
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving(key);
    try {
      await base44.functions.invoke('updateMyNotificationPrefs', { scope: 'all', fields: { [key]: value } });
    } catch (e) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      setError(e?.response?.data?.error || t('account.notifSaveFailed'));
    } finally {
      setSaving('');
    }
  };

  const deviceOn = permission === 'granted' && !optedOut;

  const toggleDevice = async (next) => {
    setDeviceBusy(true);
    setError('');
    try {
      if (next) {
        const granted = await requestPermission();
        setOptedOut(!granted);
      } else {
        await optOut();
        setOptedOut(true);
      }
    } finally {
      setDeviceBusy(false);
    }
  };

  const deviceStatus = !configured
    ? t('account.pushNotConfigured')
    : !supported
      ? t('account.browserUnsupported')
      : permission === 'denied' && !deviceOn
        ? t('account.notifBlocked')
        : deviceOn
          ? t('account.notifDeviceOn')
          : t('account.notifDeviceOff');

  return (
    <div className="tt-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-terra-deep" />
        <p className="tt-label text-ink-deep/50">{t('account.notifications')}</p>
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${deviceOn ? 'bg-terra/10 text-terra-deep' : 'bg-foreground/5 text-ink-deep/40'}`}>
          {deviceOn ? <BellRing className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-deep truncate">{t('account.notifDevice')}</p>
          <p className="text-xs text-ink-deep/55 leading-snug">{deviceStatus}</p>
        </div>
        {configured && supported ? (
          <Switch
            checked={deviceOn}
            onCheckedChange={toggleDevice}
            disabled={deviceBusy || (!ready && !deviceOn)}
            aria-label={t('account.notifDevice')}
          />
        ) : null}
      </div>

      <div className="pt-3 border-t border-ink-charcoal/10 space-y-1">
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-deep">{t('account.allNotifications')}</p>
            <p className="text-xs text-ink-deep/50">{t('account.notifCategoriesHint')}</p>
          </div>
          <Switch
            checked={Boolean(prefs?.notify_master)}
            onCheckedChange={(v) => toggle('notify_master', v)}
            disabled={!prefs || saving === 'notify_master'}
          />
        </div>

        {CATEGORIES.map(({ key, labelKey, Icon }) => (
          <div key={key} className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-4 h-4 text-ink-deep/45 shrink-0" />
              <span className="text-sm text-ink-deep truncate">{t(labelKey)}</span>
            </div>
            <Switch
              checked={Boolean(prefs?.notify_master && prefs?.[key])}
              onCheckedChange={(v) => toggle(key, v)}
              disabled={!prefs || !prefs.notify_master || saving === key}
            />
          </div>
        ))}
      </div>

      {error ? <p className="text-xs text-destructive break-words">{error}</p> : null}
    </div>
  );
}