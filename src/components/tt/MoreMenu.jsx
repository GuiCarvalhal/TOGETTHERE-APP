import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOptionalGathering } from '@/lib/gatheringContext';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/theme';
import { base44 } from '@/api/base44Client';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { timeAgo } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import LanguageSelector from '@/components/tt/LanguageSelector';
import {
  Sun, Moon, Monitor, Bell, BellRing, BellOff, Check, Loader2, Send, Users,
  Settings as SettingsIcon, LogOut, ChevronRight, Receipt, Route, UserPlus,
  UserCheck, Plane, Clock, Sparkles, Globe,
} from 'lucide-react';

const THEME_OPTS = [
  { key: 'light', tk: 'account.light', Icon: Sun },
  { key: 'dark', tk: 'account.dark', Icon: Moon },
  { key: 'system', tk: 'account.system', Icon: Monitor },
];
const PREFS = [
  { key: 'notify_journey', tk: 'account.journeyUpdates', Icon: Plane },
  { key: 'notify_expenses', tk: 'account.expenses', Icon: Receipt, participantsOnly: true },
  { key: 'notify_members', tk: 'account.memberActivity', Icon: Users },
  { key: 'notify_reminders', tk: 'account.reminders', Icon: Clock },
  { key: 'notify_ai', tk: 'account.aiRecommendations', Icon: Sparkles },
];
const ACT_ICON = {
  expense_added: Receipt, journey_added: Route, join_requested: UserPlus,
  join_approved: UserCheck, member_added: UserPlus,
  gathering_updated: SettingsIcon,
};

function Section({ icon: Icon, title, children }) {
  return (
    <div className="px-4 py-3 border-t border-foreground/8">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-terra-deep" />}
        <p className="tt-label text-foreground/50">{title}</p>
      </div>
      {children}
    </div>
  );
}

// Expandable account-level menu, opened from the header avatar (every page)
// and the gathering bottom-bar "More" tab. Universal sections (profile,
// appearance/theme, sign out) always render; gathering-scoped sections
// (notifications, sharing depth, recent activity, gathering settings) only
// render inside a gathering (useOptionalGathering returns the context). On
// top-level pages (Home/Profile/How-it-works) the menu still gives a home for
// Profile + theme + sign out.
export default function MoreMenu({ open, onOpenChange, onesignal }) {
  const gctx = useOptionalGathering() || {};
  const { gatheringId, members, currentMember, role, refresh } = gctx;
  const { user, logout } = useAuth();
  const { t, fmt } = useI18n();
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(null);
  const [savingPref, setSavingPref] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [activities, setActivities] = useState([]);

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

  const loadActivity = useCallback(async () => {
    if (!gatheringId) return;
    try {
      const res = await base44.functions.invoke('getActivity', { gathering_id: gatheringId });
      const data = res.data || res;
      setActivities((data.activities || []).slice(0, 5));
    } catch { /* ignore */ }
  }, [gatheringId]);
  useEffect(() => { if (open) loadActivity(); }, [open, loadActivity]);

  async function togglePref(key, val) {
    setPrefs((p) => ({ ...p, [key]: val }));
    setSavingPref(key);
    try {
      await base44.functions.invoke('updateMyNotificationPrefs', { gathering_id: gatheringId, fields: { [key]: val } });
      refresh();
    } catch (e) {
      setPrefs((p) => ({ ...p, [key]: !val }));
    } finally { setSavingPref(null); }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke('sendTestNotification', { gathering_id: gatheringId });
      const data = res.data || res;
      setTestResult(data.sent > 0 ? 'sent' : 'no_device');
    } catch { setTestResult('error'); }
    finally { setTesting(false); }
  }

  const { supported, configured, permission, ready, requestPermission } = onesignal || {};
  const granted = permission === 'granted';
  const isViewer = role === 'viewer';
  const visiblePrefs = PREFS.filter((p) => !(p.participantsOnly && isViewer));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh] bg-background">
        <DrawerTitle className="sr-only">{t('account.settingsAccount')}</DrawerTitle>
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Profile header — links to the full Profile page */}
          <button onClick={() => { onOpenChange(false); navigate(`/profile/${user?.id}${gatheringId ? `?g=${gatheringId}` : ''}`); }} className="w-full px-4 pt-3 pb-4 flex items-center gap-3 hover:bg-foreground/5 transition-colors text-left">
            <MemberAvatar member={currentMember || user} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold text-foreground truncate">{currentMember?.full_name || user?.full_name || t('account.member')}</p>
              <p className="text-xs text-foreground/50 truncate">{user?.email}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-foreground/40 shrink-0" />
          </button>

          {/* Appearance */}
          <Section icon={Sun} title={t('account.appearance')}>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTS.map((o) => (
                <button key={o.key} onClick={() => setMode(o.key)} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${mode === o.key ? 'bg-terra/10 border-terra/30 text-terra-deep' : 'border-foreground/12 text-foreground/55 hover:bg-foreground/5'}`}>
                  <o.Icon className="w-4 h-4" /> {t(o.tk)}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <LanguageSelector />
            </div>
          </Section>

          {/* Notifications — gathering-scoped */}
          {gctx && (
          <Section icon={Bell} title={t('account.notifications')}>
            {!configured && <p className="text-xs text-foreground/55">{t('account.pushNotConfigured')}</p>}
            {configured && !supported && <p className="text-xs text-foreground/55 flex items-center gap-1.5"><BellOff className="w-3.5 h-3.5" /> {t('account.browserUnsupported')}</p>}
            {configured && supported && !granted && (
              <div className="space-y-2">
                <p className="text-xs text-foreground/60">{t('account.notificationsDesc')}</p>
                <Button type="button" className="w-full" size="sm" onClick={requestPermission} disabled={!ready}>
                  <BellRing /> {t('account.turnOnNotifications')}
                </Button>
              </div>
            )}
            {configured && supported && granted && <p className="text-xs text-foreground/55 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-terra-deep" /> {t('account.onForDevice')}</p>}
            {prefs && (
              <div className="space-y-0.5 pt-2">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-foreground">{t('account.allNotifications')}</span>
                  <Switch checked={prefs.notify_master} onCheckedChange={(v) => togglePref('notify_master', v)} disabled={savingPref === 'notify_master'} />
                </div>
                {visiblePrefs.map((p) => (
                  <div key={p.key} className="flex items-center justify-between py-1.5">
                    <span className="flex items-center gap-2 text-sm text-foreground"><p.Icon className="w-3.5 h-3.5 text-foreground/45" /> {p.label}</span>
                    <Switch checked={prefs.notify_master && prefs[p.key]} onCheckedChange={(v) => togglePref(p.key, v)} disabled={!prefs.notify_master || savingPref === p.key} />
                  </div>
                ))}
                {role === 'owner' && configured && supported && (
                  <Button type="button" variant="outline" size="sm" className="w-full mt-2" onClick={sendTest} disabled={testing}>
                    {testing ? <Loader2 className="animate-spin" /> : <Send />} {t('account.sendTest')}
                  </Button>
                )}
                {testResult === 'sent' && <p className="text-xs text-terra-deep text-center mt-1">{t('account.testSent')}</p>}
                {testResult === 'no_device' && <p className="text-xs text-foreground/50 text-center mt-1">{t('account.noDevice')}</p>}
                {testResult === 'error' && <p className="text-xs text-destructive text-center mt-1">{t('account.couldNotSend')}</p>}
              </div>
            )}
          </Section>
          )}

          {/* Recent activity — gathering-scoped */}
          {gctx && activities.length > 0 && (
            <Section icon={Bell} title={t('account.recentActivity')}>
              <div className="space-y-2">
                {activities.map((a) => {
                  const Icon = ACT_ICON[a.type] || Bell;
                  return (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-foreground/5 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-foreground/55" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground leading-snug">{a.summary}</p>
                        <p className="text-[0.625rem] text-foreground/40">{fmt.timeAgo(a.created_date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Sign out — universal */}
          <button onClick={() => logout()} className="w-full px-4 py-3.5 border-t border-foreground/8 flex items-center gap-2 text-sm font-medium text-destructive hover:bg-destructive/5">
            <LogOut className="w-4 h-4" /> {t('account.signOut')}
          </button>
          <div className="h-3 tt-safe-bottom" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}