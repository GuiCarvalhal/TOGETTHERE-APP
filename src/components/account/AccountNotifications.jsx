import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import { useOneSignal } from '@/lib/useOneSignal';
import {
  aggregatePrefs, beginToggle, categoryLocked, isSwitchOn, mergeMemberships, revertToggle,
} from '@/lib/notificationPrefs';
import { DEVICE_STATE } from '@/lib/notificationDeviceState';
import { Switch } from '@/components/ui/switch';
import { Bell, BellOff, BellRing, Plane, Receipt, Users, Clock, Sparkles } from 'lucide-react';

// Notification controls for the Account area.
//  • Device row: whether THIS device can receive push right now, read from the
//    real OneSignal subscription (not the permission alone), so turning it off
//    stays off across a refresh.
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

const STATUS_COPY = {
  [DEVICE_STATE.UNCONFIGURED]: 'account.pushNotConfigured',
  [DEVICE_STATE.UNSUPPORTED]: 'account.browserUnsupported',
  [DEVICE_STATE.NEEDS_INSTALL]: 'account.notifInstallRequired',
  [DEVICE_STATE.BLOCKED]: 'account.notifBlocked',
  [DEVICE_STATE.LOADING]: 'account.notifLoading',
  [DEVICE_STATE.ON]: 'account.notifDeviceOn',
  [DEVICE_STATE.OFF]: 'account.notifDeviceOff',
};

export default function AccountNotifications() {
  const { t } = useI18n();
  const { user } = useAuth();
  const {
    supported, configured, status, deviceOn, canToggle, subscribe, unsubscribe, refresh,
  } = useOneSignal(user?.id);
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [error, setError] = useState('');

  // Every membership of this user, whether it is keyed by user id or only by
  // email (an invite still unclaimed). Reading both is what keeps the aggregate
  // from missing gatherings and reporting a category as on when it is not.
  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [byId, byEmail] = await Promise.all([
        base44.entities.Member.filter({ user_id: user.id }).catch(() => []),
        user.email ? base44.entities.Member.filter({ email: user.email }).catch(() => []) : [],
      ]);
      const rows = mergeMemberships({ byId, byEmail }, user.id, user.email);
      setPrefs(aggregatePrefs(rows));
    } catch {
      setPrefs(aggregatePrefs([]));
    }
  }, [user?.id, user?.email]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key, value) => {
    if (!prefs || saving) return;
    setError('');
    const { next, previous } = beginToggle(prefs, key, value);
    setPrefs(next);
    setSaving(key);
    try {
      await base44.functions.invoke('updateMyNotificationPrefs', { scope: 'all', fields: { [key]: value } });
      // Re-derive from the database: if a membership was not written, the
      // switch goes back to what is actually stored instead of lying.
      await load();
    } catch (e) {
      setPrefs((current) => revertToggle(current, key, previous));
      setError(e?.response?.data?.error || t('account.notifSaveFailed'));
    } finally {
      setSaving('');
    }
  };

  const toggleDevice = async (next) => {
    if (deviceBusy || !canToggle) return;
    setDeviceBusy(true);
    setError('');
    try {
      const ok = next ? await subscribe() : await unsubscribe();
      if (!ok) {
        setError(next ? t('account.notifEnableFailed') : t('account.notifDisableFailed'));
        refresh();
      }
    } finally {
      setDeviceBusy(false);
    }
  };

  const deviceStatus = t(STATUS_COPY[status] || 'account.notifDeviceOff');
  const deviceLocked = !prefs || Boolean(saving);

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
            disabled={deviceBusy || !canToggle}
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
            disabled={deviceLocked}
          />
        </div>

        {CATEGORIES.map(({ key, labelKey, Icon }) => (
          <div key={key} className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-4 h-4 text-ink-deep/45 shrink-0" />
              <span className="text-sm text-ink-deep truncate">{t(labelKey)}</span>
            </div>
            <Switch
              checked={isSwitchOn(prefs, key)}
              onCheckedChange={(v) => toggle(key, v)}
              disabled={deviceLocked || categoryLocked(prefs)}
            />
          </div>
        ))}
      </div>

      {error ? <p className="text-xs text-destructive break-words">{error}</p> : null}
    </div>
  );
}