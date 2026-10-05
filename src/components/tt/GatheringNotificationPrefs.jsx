import React, { useState, useEffect } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { Bell, BellRing, BellOff, Check, Loader2, Send, Plane, Receipt, Users, Clock, Sparkles } from 'lucide-react';

const PREFS = [
  { key: 'notify_journey', tk: 'account.journeyUpdates', Icon: Plane },
  { key: 'notify_expenses', tk: 'account.expenses', Icon: Receipt, participantsOnly: true },
  { key: 'notify_members', tk: 'account.memberActivity', Icon: Users },
  { key: 'notify_reminders', tk: 'account.reminders', Icon: Clock },
  { key: 'notify_ai', tk: 'account.aiRecommendations', Icon: Sparkles },
];

// Gathering-scoped notification preferences for the current member. Lives on the
// gathering's Settings page so every member (incl. viewers) can tune their own
// per-gathering subscriptions. The device push opt-in + owner test notification
// use the OneSignal handle passed from the gathering shell. Nothing here is
// global — these subscriptions are per-gathering, per-member, and stay that way
// (global app settings live on the universal Account page, not here).
export default function GatheringNotificationPrefs({ onesignal }) {
  const { gatheringId, currentMember, role, refresh } = useGathering();
  const { t } = useI18n();
  const [prefs, setPrefs] = useState(null);
  const [savingPref, setSavingPref] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (currentMember) {
      setPrefs({
        notify_master: currentMember.notify_master !== false,
        notify_journey: currentMember.notify_journey !== false,
        notify_expenses: currentMember.notify_expenses !== false,
        notify_members: currentMember.notify_members !== false,
        notify_reminders: currentMember.notify_reminders !== false,
        notify_ai: currentMember.notify_ai !== false,
      });
    }
  }, [currentMember?.id]);

  async function togglePref(key, val) {
    setPrefs((p) => ({ ...p, [key]: val }));
    setSavingPref(key);
    try {
      await base44.functions.invoke('updateMyNotificationPrefs', { gathering_id: gatheringId, fields: { [key]: val } });
      refresh();
    } catch (e) {
      setPrefs((p) => ({ ...p, [key]: !val }));
    } finally {
      setSavingPref(null);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke('sendTestNotification', { gathering_id: gatheringId });
      const data = res.data || res;
      setTestResult(data.sent > 0 ? 'sent' : 'no_device');
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  }

  const { supported, configured, permission, ready, requestPermission } = onesignal || {};
  const granted = permission === 'granted';
  const isViewer = role === 'viewer';
  const visiblePrefs = PREFS.filter((p) => !(p.participantsOnly && isViewer));

  return (
    <div className="tt-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-terra-deep" />
        <p className="tt-label text-ink-deep/50">{t('settings.myNotifications')}</p>
      </div>

      {/* Device push status / opt-in */}
      {!configured && <p className="text-xs text-ink-deep/55">{t('account.pushNotConfigured')}</p>}
      {configured && !supported && (
        <p className="text-xs text-ink-deep/55 flex items-center gap-1.5">
          <BellOff className="w-3.5 h-3.5" /> {t('account.browserUnsupported')}
        </p>
      )}
      {configured && supported && !granted && (
        <div className="space-y-2">
          <p className="text-xs text-ink-deep/60">{t('account.notificationsDesc')}</p>
          <Button type="button" size="sm" onClick={requestPermission} disabled={!ready}>
            <BellRing /> {t('account.turnOnNotifications')}
          </Button>
        </div>
      )}
      {configured && supported && granted && (
        <p className="text-xs text-ink-deep/55 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-terra-deep" /> {t('account.onForDevice')}
        </p>
      )}

      {/* Per-gathering subscription toggles */}
      {prefs && (
        <div className="space-y-1 pt-2 border-t border-ink-charcoal/10">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-ink-deep">{t('account.allNotifications')}</span>
            <Switch
              checked={prefs.notify_master}
              onCheckedChange={(v) => togglePref('notify_master', v)}
              disabled={savingPref === 'notify_master'}
            />
          </div>
          {visiblePrefs.map((p) => (
            <div key={p.key} className="flex items-center justify-between py-1.5">
              <span className="flex items-center gap-2 text-sm text-ink-deep">
                <p.Icon className="w-3.5 h-3.5 text-ink-deep/45" /> {t(p.tk)}
              </span>
              <Switch
                checked={prefs.notify_master && prefs[p.key]}
                onCheckedChange={(v) => togglePref(p.key, v)}
                disabled={!prefs.notify_master || savingPref === p.key}
              />
            </div>
          ))}
          {role === 'owner' && configured && supported && (
            <Button type="button" variant="outline" size="sm" className="w-full mt-2" onClick={sendTest} disabled={testing}>
              {testing ? <Loader2 className="animate-spin" /> : <Send />} {t('account.sendTest')}
            </Button>
          )}
          {testResult === 'sent' && <p className="text-xs text-terra-deep text-center mt-1">{t('account.testSent')}</p>}
          {testResult === 'no_device' && <p className="text-xs text-ink-deep/50 text-center mt-1">{t('account.noDevice')}</p>}
          {testResult === 'error' && <p className="text-xs text-destructive text-center mt-1">{t('account.couldNotSend')}</p>}
        </div>
      )}
    </div>
  );
}