import React, { useState, useEffect } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Bell, BellRing, BellOff, Check, Loader2, Send, Plane, Receipt, Users, Clock, Sparkles } from 'lucide-react';

const PREFS = [
  { key: 'notify_journey', label: 'Journey updates', Icon: Plane },
  { key: 'notify_expenses', label: 'Expenses', Icon: Receipt, participantsOnly: true },
  { key: 'notify_members', label: 'Member activity', Icon: Users },
  { key: 'notify_reminders', label: 'Reminders', Icon: Clock },
  { key: 'notify_ai', label: 'AI recommendations', Icon: Sparkles },
];

export default function NotificationSettings({ onesignal }) {
  const { gatheringId, currentMember, role, refresh } = useGathering();
  const { supported, configured, permission, ready, requestPermission } = onesignal;
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(null);
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

  async function toggle(key, val) {
    setPrefs((p) => ({ ...p, [key]: val }));
    setSaving(key);
    try {
      await base44.functions.invoke('updateMyNotificationPrefs', { gathering_id: gatheringId, fields: { [key]: val } });
      refresh();
    } catch (e) {
      setPrefs((p) => ({ ...p, [key]: !val }));
      alert(e.response?.data?.error || e.message || 'Could not update preference');
    } finally {
      setSaving(null);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke('sendTestNotification', { gathering_id: gatheringId });
      const data = res.data || res;
      setTestResult(data.sent > 0 ? 'sent' : 'no_device');
    } catch (e) {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  }

  const isViewer = role === 'viewer';
  const visiblePrefs = PREFS.filter((p) => !(p.participantsOnly && isViewer));
  const granted = permission === 'granted';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button aria-label="Notifications" className="relative w-11 h-11 rounded-full flex items-center justify-center text-cream/80 hover:text-cream hover:bg-white/5 transition-colors">
          <Bell className="w-5 h-5" />
          {granted && <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-terra ring-2 ring-ink" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 rounded-[1.25rem] border border-ink-charcoal/15 bg-popover text-popover-foreground tt-shadow-float">
        <div className="px-4 pt-4 pb-2 border-b border-ink-charcoal/10">
          <p className="font-display text-lg font-bold text-ink-deep">Notifications</p>
        </div>
        <div className="p-4 space-y-4">
          {!configured && (
            <p className="text-sm text-ink-deep/60">Push notifications aren't configured for this app yet.</p>
          )}
          {configured && !supported && (
            <div className="flex items-start gap-2 text-sm text-ink-deep/60">
              <BellOff className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Your browser doesn't support web push. Install TOGETTHERE to your home screen for notifications.</p>
            </div>
          )}
          {configured && supported && !granted && (
            <div className="space-y-2">
              <p className="text-sm text-ink-deep/70">Get a heads-up when the journey changes, expenses are added, or someone joins.</p>
              <Button type="button" onClick={requestPermission} disabled={!ready} className="w-full bg-terra hover:bg-terra-deep text-cream rounded-full">
                <BellRing className="w-4 h-4 mr-2" /> Turn on notifications
              </Button>
            </div>
          )}
          {configured && supported && granted && (
            <p className="text-xs text-ink-deep/50 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-terra-deep" /> Notifications are on for this device.</p>
          )}

          {prefs && (
            <div className="space-y-1 pt-2 border-t border-ink-charcoal/10">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-semibold text-ink-deep">All notifications</p>
                  <p className="text-xs text-ink-deep/50">Master switch</p>
                </div>
                <Switch checked={prefs.notify_master} onCheckedChange={(v) => toggle('notify_master', v)} disabled={saving === 'notify_master'} />
              </div>
              {visiblePrefs.map((p) => (
                <div key={p.key} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <p.Icon className="w-4 h-4 text-ink-deep/50" />
                    <span className="text-sm text-ink-deep">{p.label}</span>
                  </div>
                  <Switch checked={prefs.notify_master && prefs[p.key]} onCheckedChange={(v) => toggle(p.key, v)} disabled={!prefs.notify_master || saving === p.key} />
                </div>
              ))}
            </div>
          )}

          {role === 'owner' && configured && supported && (
            <div className="pt-2 border-t border-ink-charcoal/10">
              <Button type="button" variant="outline" onClick={sendTest} disabled={testing} className="w-full rounded-full border-ink-charcoal/25 text-ink-deep hover:bg-cream-pale">
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send test notification
              </Button>
              {testResult === 'sent' && <p className="text-xs text-terra-deep mt-1.5 text-center">Test sent — check your device.</p>}
              {testResult === 'no_device' && <p className="text-xs text-ink-deep/50 mt-1.5 text-center">No subscribed device yet. Turn on notifications first.</p>}
              {testResult === 'error' && <p className="text-xs text-destructive mt-1.5 text-center">Could not send. Try again.</p>}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}