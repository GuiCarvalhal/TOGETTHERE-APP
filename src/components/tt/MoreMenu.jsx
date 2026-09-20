import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGathering } from '@/lib/gatheringContext';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/theme';
import { base44 } from '@/api/base44Client';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { timeAgo, canManageGathering } from '@/lib/gatheringHelpers';
import {
  Sun, Moon, Monitor, Bell, BellRing, BellOff, Check, Loader2, Send, Users, Heart,
  Settings as SettingsIcon, LogOut, Pencil, ChevronRight, Receipt, Route, UserPlus,
  UserCheck, Plane, Clock, Sparkles,
} from 'lucide-react';

const THEME_OPTS = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'system', label: 'System', Icon: Monitor },
];
const PREFS = [
  { key: 'notify_journey', label: 'Journey updates', Icon: Plane },
  { key: 'notify_expenses', label: 'Expenses', Icon: Receipt, participantsOnly: true },
  { key: 'notify_members', label: 'Member activity', Icon: Users },
  { key: 'notify_reminders', label: 'Reminders', Icon: Clock },
  { key: 'notify_ai', label: 'AI recommendations', Icon: Sparkles },
];
const ACT_ICON = {
  expense_added: Receipt, journey_added: Route, join_requested: UserPlus,
  join_approved: UserCheck, relationship_close: Heart, member_added: UserPlus,
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

// Expandable account-level menu, opened from the bottom tab bar's "More" tab.
// Designed as a stack of sections so more settings can be appended later.
export default function MoreMenu({ open, onOpenChange, onesignal }) {
  const { gatheringId, members, currentMember, role, refresh } = useGathering();
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({ full_name: '', home_city: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [savingPref, setSavingPref] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    if (currentMember) {
      setProfile({ full_name: currentMember.full_name || '', home_city: currentMember.home_city || '' });
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
    try {
      const res = await base44.functions.invoke('getActivity', { gathering_id: gatheringId });
      const data = res.data || res;
      setActivities((data.activities || []).slice(0, 5));
    } catch { /* ignore */ }
  }, [gatheringId]);
  useEffect(() => { if (open) loadActivity(); }, [open, loadActivity]);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await base44.functions.invoke('updateMyProfile', {
        gathering_id: gatheringId,
        fields: { full_name: profile.full_name.trim(), home_city: profile.home_city },
      });
      setEditing(false);
      refresh();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not save');
    } finally { setSavingProfile(false); }
  }

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

  async function setRelationship(targetUserId, rel) {
    const rels = { ...(currentMember?.relationships || {}) };
    rels[targetUserId] = rel;
    try {
      await base44.functions.invoke('updateMyProfile', { gathering_id: gatheringId, fields: { relationships: rels } });
      refresh();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not update relationship');
    }
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
  const others = members.filter((m) => m.id !== currentMember?.id);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh] bg-background">
        <DrawerTitle className="sr-only">Settings &amp; account</DrawerTitle>
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Profile header */}
          <div className="px-4 pt-3 pb-4 flex items-center gap-3">
            <MemberAvatar member={currentMember || user} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold text-foreground truncate">{currentMember?.full_name || user?.full_name || 'Member'}</p>
              <p className="text-xs text-foreground/50 truncate">{user?.email}</p>
            </div>
            <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-terra-deep px-3 py-2 rounded-full hover:bg-terra/10">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
          {editing && (
            <div className="px-4 pb-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground/60">Name</Label>
                <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="bg-card border-foreground/15" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground/60">Home city</Label>
                <Input value={profile.home_city} onChange={(e) => setProfile({ ...profile, home_city: e.target.value })} className="bg-card border-foreground/15" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="rounded-full">Cancel</Button>
                <Button size="sm" onClick={saveProfile} disabled={savingProfile} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
                  {savingProfile && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Save
                </Button>
              </div>
            </div>
          )}

          {/* Appearance */}
          <Section icon={Sun} title="Appearance">
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTS.map((o) => (
                <button key={o.key} onClick={() => setMode(o.key)} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${mode === o.key ? 'bg-terra/10 border-terra/30 text-terra-deep' : 'border-foreground/12 text-foreground/55 hover:bg-foreground/5'}`}>
                  <o.Icon className="w-4 h-4" /> {o.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Notifications */}
          <Section icon={Bell} title="Notifications">
            {!configured && <p className="text-xs text-foreground/55">Push notifications aren't configured for this app yet.</p>}
            {configured && !supported && <p className="text-xs text-foreground/55 flex items-center gap-1.5"><BellOff className="w-3.5 h-3.5" /> Your browser doesn't support web push.</p>}
            {configured && supported && !granted && (
              <div className="space-y-2">
                <p className="text-xs text-foreground/60">Get a heads-up when the journey changes, expenses are added, or someone joins.</p>
                <Button type="button" onClick={requestPermission} disabled={!ready} className="w-full bg-terra hover:bg-terra-deep text-cream rounded-full h-9">
                  <BellRing className="w-4 h-4 mr-2" /> Turn on notifications
                </Button>
              </div>
            )}
            {configured && supported && granted && <p className="text-xs text-foreground/55 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-terra-deep" /> On for this device.</p>}
            {prefs && (
              <div className="space-y-0.5 pt-2">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-foreground">All notifications</span>
                  <Switch checked={prefs.notify_master} onCheckedChange={(v) => togglePref('notify_master', v)} disabled={savingPref === 'notify_master'} />
                </div>
                {visiblePrefs.map((p) => (
                  <div key={p.key} className="flex items-center justify-between py-1.5">
                    <span className="flex items-center gap-2 text-sm text-foreground"><p.Icon className="w-3.5 h-3.5 text-foreground/45" /> {p.label}</span>
                    <Switch checked={prefs.notify_master && prefs[p.key]} onCheckedChange={(v) => togglePref(p.key, v)} disabled={!prefs.notify_master || savingPref === p.key} />
                  </div>
                ))}
                {role === 'owner' && configured && supported && (
                  <Button type="button" variant="outline" onClick={sendTest} disabled={testing} className="w-full mt-2 rounded-full h-9 text-xs">
                    {testing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} Send test
                  </Button>
                )}
                {testResult === 'sent' && <p className="text-xs text-terra-deep text-center mt-1">Test sent — check your device.</p>}
                {testResult === 'no_device' && <p className="text-xs text-foreground/50 text-center mt-1">No subscribed device yet.</p>}
                {testResult === 'error' && <p className="text-xs text-destructive text-center mt-1">Could not send.</p>}
              </div>
            )}
          </Section>

          {/* Sharing depth */}
          <Section icon={Heart} title="Sharing depth">
            <p className="text-xs text-foreground/55 mb-2">Mark members as Close to share your contact info, precise times and private notes with them. Casual connections see a limited profile.</p>
            {others.length === 0 ? (
              <p className="text-xs text-foreground/45">No other members yet.</p>
            ) : (
              <div className="space-y-2">
                {others.map((m) => {
                  const rel = (currentMember?.relationships || {})[m.user_id] || 'casual';
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <MemberAvatar member={m} size="sm" />
                      <span className="text-sm text-foreground min-w-0 truncate flex-1">{m.full_name}</span>
                      <div className="inline-flex rounded-full bg-foreground/5 p-0.5 border border-foreground/10 shrink-0">
                        {['casual', 'close'].map((r) => (
                          <button key={r} onClick={() => setRelationship(m.user_id, r)} className={`px-3 py-1.5 rounded-full text-[0.6875rem] font-semibold capitalize transition-colors ${rel === r ? (r === 'close' ? 'bg-terra text-cream' : 'bg-foreground/15 text-foreground') : 'text-foreground/50'}`}>{r}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Recent activity */}
          {activities.length > 0 && (
            <Section icon={Bell} title="Recent activity">
              <div className="space-y-2">
                {activities.map((a) => {
                  const Icon = ACT_ICON[a.type] || Bell;
                  return (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-foreground/5 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-foreground/55" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground leading-snug">{a.summary}</p>
                        <p className="text-[0.625rem] text-foreground/40">{timeAgo(a.created_date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Gathering settings (owner) */}
          {canManageGathering(role) && (
            <button onClick={() => { onOpenChange(false); navigate(`/gathering/${gatheringId}/settings`); }} className="w-full px-4 py-3.5 border-t border-foreground/8 flex items-center gap-2 text-sm font-medium text-foreground hover:bg-foreground/5">
              <SettingsIcon className="w-4 h-4 text-terra-deep" /> Gathering settings <ChevronRight className="w-4 h-4 ml-auto text-foreground/40" />
            </button>
          )}

          {/* Sign out */}
          <button onClick={() => logout()} className="w-full px-4 py-3.5 border-t border-foreground/8 flex items-center gap-2 text-sm font-medium text-destructive hover:bg-destructive/5">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
          <div className="h-3 tt-safe-bottom" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}