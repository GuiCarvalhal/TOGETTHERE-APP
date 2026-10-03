import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { canManageMembers, ROLES } from '@/lib/gatheringHelpers';
import MemberRow from '@/components/members/MemberRow';
import MemberDetailSheet from '@/components/members/MemberDetailSheet';
import PageToolbar from '@/components/tt/PageToolbar';
import FilterChips from '@/components/tt/FilterChips';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Loader2, Users, X, Handshake, HeartHandshake, User, Link2, Eye, Copy, Check } from 'lucide-react';
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
  const { scope, setScope } = useViewPrefs(gatheringId);
  const [shareOpen, setShareOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [activeMember, setActiveMember] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const canManage = canManageMembers(role);
  const isOwner = role === 'owner';
  const isViewer = role === 'viewer';

  // Add member lives in the sticky PageToolbar (canonical button), not a FAB —
  // matching Journey/Expenses.
  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  usePolling(silentRefresh, 25000);

  const inviteUrl = `${window.location.origin}/join/${gatheringId}`;
  const viewerInviteUrl = `${inviteUrl}?as=viewer`;

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* ignore */ }
  }

  async function handleRelationshipChange(targetUserId, rel) {
    try {
      await base44.functions.invoke('setRelationship', { gathering_id: gatheringId, target_user_id: targetUserId, level: rel });
      refresh();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not update relationship');
    }
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

  // Scope filter. Members: "Mine" = just the signed-in user. For viewers, the
  // control becomes "Close" — the close-friends membership scope (members the
  // viewer marked Close), not the viewer's own participation (viewers don't
  // participate). The signed-in user's own row is always kept so the "You"
  // section still renders under Close.
  const scopedMembers = scope === 'mine'
    ? (isViewer
        ? members.filter((m) => m.id === currentMember?.id || m.myRelationship === 'close')
        : members.filter((m) => m.id === currentMember?.id))
    : members;
  // Role filter composes with scope: narrows the visible members by gathering
  // role (owner/admin/member/viewer) — never inferred from friendship.
  const roleFiltered = roleFilter === 'all' ? scopedMembers : scopedMembers.filter((m) => m.role === roleFilter);
  // Friendship split uses myRelationship (close | casual). The app's
  // documented default is 'casual', so null — only the current user's own row
  // — is treated as casual. No member disappears; no Uncategorized section.
  const others = roleFiltered.filter((m) => m.id !== currentMember?.id);
  const selfMember = roleFiltered.find((m) => m.id === currentMember?.id) || null;
  const closeMembers = others.filter((m) => m.myRelationship === 'close');
  const casualMembers = others.filter((m) => m.myRelationship !== 'close');
  // Re-derive the open sheet's member from fresh data so role/relationship
  // edits reflect immediately; falls back to the stored object if it's gone.
  const active = activeMember ? (members.find((m) => m.id === activeMember.id) || activeMember) : null;

  return (
    <PageToolbar scope={scope} setScope={setScope} showImagesToggle={false} onAdd={() => setShareOpen(true)} canAdd={canManage} addLabel="invite" filterRow={<FilterChips options={ROLE_FILTER_OPTIONS} value={roleFilter} onChange={setRoleFilter} />}>
      {loading ? (
        <MembersSkeleton />
      ) : roleFiltered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={roleFilter !== 'all' ? 'No members with this role' : (scope === 'mine' ? (isViewer ? 'No close friends yet' : 'Nothing to show') : 'No members yet')}
          body={roleFilter !== 'all' ? 'Switch to All to see everyone, or pick another role.' : (scope === 'mine' ? (isViewer ? 'Mark members as Close from their profile to see them here, or switch to Group.' : 'Switch to Group to see everyone in this gathering.') : 'Invite your crew to start coordinating — share a Member link so people can participate, or a Viewer link for read-only access.')}
          action={canManage && scope !== 'mine' && roleFilter === 'all' ? (
            <Button onClick={() => setShareOpen(true)}>
              <UserPlus /> Share invite link
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-6">
          {selfMember && (
            <MemberSection title="You" count={1} icon={<User className="w-3.5 h-3.5 text-terra-deep" />}>
              <MemberRow key={selfMember.id} member={selfMember} gatheringId={gatheringId} isSelf onOpen={() => { setActiveMember(selfMember); setSheetOpen(true); }} />
            </MemberSection>
          )}
          <MemberSection title="Close Friendship" count={closeMembers.length} icon={<HeartHandshake className="w-3.5 h-3.5 text-terra-deep" />}>
            {closeMembers.map((m) => (
              <MemberRow key={m.id} member={m} gatheringId={gatheringId} isSelf={m.id === currentMember?.id} onOpen={() => { setActiveMember(m); setSheetOpen(true); }} />
            ))}
          </MemberSection>
          <MemberSection title="Casual Friendship" count={casualMembers.length} icon={<Handshake className="w-3.5 h-3.5 text-ink-deep/45" />}>
            {casualMembers.map((m) => (
              <MemberRow key={m.id} member={m} gatheringId={gatheringId} isSelf={m.id === currentMember?.id} onOpen={() => { setActiveMember(m); setSheetOpen(true); }} />
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
        myRelationship={active?.myRelationship}
        visibility={active?.visibility}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRelationshipChange={(rel) => active && handleRelationshipChange(active.user_id, rel)}
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