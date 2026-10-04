import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { canManageMembers, canInviteMembers, ROLES } from '@/lib/gatheringHelpers';
import MemberRow from '@/components/members/MemberRow';
import MemberDetailsCard from '@/components/members/MemberDetailsCard';
import MemberDetailSheet from '@/components/members/MemberDetailSheet';
import PageToolbar from '@/components/tt/PageToolbar';
import FilterChips from '@/components/tt/FilterChips';
import DetailSwitcher from '@/components/tt/DetailSwitcher';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Loader2, Users, X, User, Link2, Eye, Copy, Check } from 'lucide-react';
import usePolling from '@/hooks/usePolling';
import EmptyState from '@/components/tt/EmptyState';
import Skeleton from '@/components/tt/Skeleton';

// Compact row skeleton — same surface/rhythm as the rendered rows so the
// loading state reads identically to Journey/Expenses.
function MembersSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-ink-charcoal/15 bg-card p-3 tt-shadow-float">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" tone="cream" />
            <Skeleton className="h-3 w-1/4" tone="cream" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" tone="cream" />
        </div>
      ))}
    </div>
  );
}

function MemberSection({ title, count, icon, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="tt-label text-ink-deep/55">{title}</h3>
        <span className="text-xs text-ink-deep/40">· {count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const ROLE_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  ...['owner', 'admin', 'member', 'viewer'].map((r) => ({ key: r, label: ROLES[r] })),
];

export default function GatheringMembers() {
  const { gatheringId, members, currentMember, role, setFab, refresh, silentRefresh, loading } = useGathering();
  const [detailMode, setDetailMode] = useState('summary');
  const [families, setFamilies] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [activeMember, setActiveMember] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const canManage = canManageMembers(role);
  const canInvite = canInviteMembers(role);
  const isOwner = role === 'owner';
  const isViewer = role === 'viewer';

  // Add member lives in the sticky PageToolbar (canonical button), not a FAB —
  // matching Journey/Expenses.
  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  usePolling(silentRefresh, 25000);

  // Load families only when Details mode is active — the Family entity is
  // separate from Member and requires a backend call. Families are matched to
  // members by user_id (owner_user_id or member_user_ids). Each family carries
  // its name and the display names of its members in this gathering.
  useEffect(() => {
    if (detailMode !== 'details') return;
    let active = true;
    (async () => {
      try {
        const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
        if (!userIds.length) return;
        const res = await base44.functions.invoke('getFamiliesForUsers', { user_ids: userIds });
        const data = res.data || res;
        const fams = (data.families || []).map((f) => {
          const famUids = new Set([f.owner_user_id, ...(f.member_user_ids || [])]);
          const famMembers = (members || []).filter((m) => m.user_id && famUids.has(m.user_id));
          return {
            id: f.id,
            name: f.name,
            user_ids: [...famUids],
            memberNames: famMembers.map((m) => m.full_name).filter(Boolean),
          };
        });
        if (active) setFamilies(fams);
      } catch { /* ignore — Details just shows no family info */ }
    })();
    return () => { active = false; };
  }, [detailMode, members]);

  // Map: user_id -> family (the first family that includes this user)
  const familyByUid = {};
  families.forEach((f) => {
    f.user_ids.forEach((uid) => {
      if (!familyByUid[uid]) familyByUid[uid] = f;
    });
  });

  const inviteUrl = `${window.location.origin}/join/${gatheringId}`;
  const viewerInviteUrl = `${inviteUrl}?as=viewer`;

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* ignore */ }
  }

  async function handleRoleChange(member, newRole) {
    try {
      await base44.functions.invoke('updateMemberRole', { gathering_id: gatheringId, member_id: member.id, role: newRole });
      refresh();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not change role');
    }
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.full_name} from this gathering?`)) return;
    setSheetOpen(false);
    try {
      await base44.functions.invoke('removeMember', { gathering_id: gatheringId, member_id: member.id });
      refresh();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not remove member');
    }
  }

  // All members are shown in both Summary and Details mode (the toggle
  // controls detail level, not which members are visible). The role filter
  // narrows by gathering role (owner/admin/member/viewer).
  const roleFiltered = roleFilter === 'all' ? members : members.filter((m) => m.role === roleFilter);
  const others = roleFiltered.filter((m) => m.id !== currentMember?.id);
  const selfMember = roleFiltered.find((m) => m.id === currentMember?.id) || null;
  // Re-derive the open sheet's member from fresh data so role edits reflect
  // immediately; falls back to the stored object if it's gone.
  const active = activeMember ? (members.find((m) => m.id === activeMember.id) || activeMember) : null;

  return (
    <PageToolbar showImagesToggle={false} switcher={<DetailSwitcher mode={detailMode} setMode={setDetailMode} />} action={canInvite ? (
      <Button variant="default" size="sm" onClick={() => setShareOpen(true)} className="shrink-0">
        <UserPlus />
        <span className="hidden sm:inline">Invite</span>
        <span className="sm:hidden">Invite</span>
      </Button>
    ) : undefined} filterRow={<FilterChips options={ROLE_FILTER_OPTIONS} value={roleFilter} onChange={setRoleFilter} />}>
      {loading ? (
        <MembersSkeleton />
      ) : roleFiltered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={roleFilter !== 'all' ? 'No members with this role' : 'No members yet'}
          body={roleFilter !== 'all' ? 'Switch to All to see everyone, or pick another role.' : 'Invite your crew to start coordinating — share a Member link so people can participate, or a Viewer link for read-only access.'}
          action={canInvite && roleFilter === 'all' ? (
            <Button onClick={() => setShareOpen(true)}>
              <UserPlus /> Share invite link
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-6">
          {selfMember && (
            <MemberSection title="You" count={1} icon={<User className="w-3.5 h-3.5 text-terra-deep" />}>
              {detailMode === 'details' ? (
                <MemberDetailsCard key={selfMember.id} member={selfMember} family={familyByUid[selfMember.user_id] || null} isSelf gatheringId={gatheringId} onOpen={() => { setActiveMember(selfMember); setSheetOpen(true); }} />
              ) : (
                <MemberRow key={selfMember.id} member={selfMember} gatheringId={gatheringId} isSelf onOpen={() => { setActiveMember(selfMember); setSheetOpen(true); }} />
              )}
            </MemberSection>
          )}
          <MemberSection title="Everyone" count={others.length} icon={<Users className="w-3.5 h-3.5 text-terra-deep" />}>
            {others.map((m) => (
              detailMode === 'details' ? (
                <MemberDetailsCard key={m.id} member={m} family={familyByUid[m.user_id] || null} isSelf={m.id === currentMember?.id} gatheringId={gatheringId} onOpen={() => { setActiveMember(m); setSheetOpen(true); }} />
              ) : (
                <MemberRow key={m.id} member={m} gatheringId={gatheringId} isSelf={m.id === currentMember?.id} onOpen={() => { setActiveMember(m); setSheetOpen(true); }} />
              )
            ))}
          </MemberSection>
        </div>
      )}

      <MemberDetailSheet
        member={active}
        gatheringId={gatheringId}
        isOwner={isOwner}
        canManage={canManage}
        isSelf={active ? active.id === currentMember?.id : false}
        visibility={active?.visibility}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRoleChange={(r) => active && handleRoleChange(active, r)}
        onRemove={() => active && handleRemove(active)}
      />

      <FormSheet open={shareOpen} onOpenChange={setShareOpen} title="Invite to this gathering" maxWidth="max-w-md">
        <div className="space-y-5">
          <p className="text-sm text-ink-deep/70">Sharing a link is the only way to add people. Anyone who opens a link signs in and joins immediately with the role the link grants — no approval, no form to fill out.</p>
          <div className="space-y-2">
            <Label className="text-ink-deep flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Member link</Label>
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep text-sm min-w-0 truncate" />
              <Button type="button" size="sm" onClick={() => copy(inviteUrl, 'member')} className="shrink-0" aria-label="Copy member link">
                {copied === 'member' ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-xs text-ink-deep/50">Members participate fully — journey, expenses, and the agent.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Viewer link</Label>
            <div className="flex gap-2">
              <Input readOnly value={viewerInviteUrl} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep text-sm min-w-0 truncate" />
              <Button type="button" variant="outline" size="sm" onClick={() => copy(viewerInviteUrl, 'viewer')} className="shrink-0" aria-label="Copy viewer link">
                {copied === 'viewer' ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-xs text-ink-deep/50">Viewers get a read-only look at the journey and members — no expenses or agent.</p>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setShareOpen(false)}><X /> Done</Button>
          </div>
        </div>
      </FormSheet>
    </PageToolbar>
  );
}