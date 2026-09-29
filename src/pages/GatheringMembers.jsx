import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { canManageMembers, ROLES } from '@/lib/gatheringHelpers';
import MemberRow from '@/components/members/MemberRow';
import MemberDetailSheet from '@/components/members/MemberDetailSheet';
import PageToolbar from '@/components/tt/PageToolbar';
import FilterChips from '@/components/tt/FilterChips';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import { DialogFooter } from '@/components/ui/dialog';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserPlus, Loader2, Users, X } from 'lucide-react';
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

function MemberSection({ title, count, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
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
  const [addOpen, setAddOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [addForm, setAddForm] = useState({ full_name: '', role: 'member', home_city: '' });
  const [adding, setAdding] = useState(false);
  const [activeMember, setActiveMember] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const canManage = canManageMembers(role);
  const isOwner = role === 'owner';

  // Add member lives in the sticky PageToolbar (canonical button), not a FAB —
  // matching Journey/Expenses.
  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  usePolling(silentRefresh, 25000);

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

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.full_name.trim()) return;
    setAdding(true);
    try {
      await base44.functions.invoke('addMember', {
        gathering_id: gatheringId,
        full_name: addForm.full_name.trim(),
        role: addForm.role,
        home_city: addForm.home_city,
      });
      setAddOpen(false);
      setAddForm({ full_name: '', role: 'member', home_city: '' });
      refresh();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not add member');
    } finally {
      setAdding(false);
    }
  }

  const visibleMembers = scope === 'mine' ? members.filter((m) => m.id === currentMember?.id) : members;
  // Role filter composes with scope: narrows the visible members by gathering
  // role (owner/admin/member/viewer) — never inferred from friendship. Feeds
  // the Close/Casual friendship sections below.
  const roleFiltered = roleFilter === 'all' ? visibleMembers : visibleMembers.filter((m) => m.role === roleFilter);
  // Friendship split uses myRelationship (close | casual). The app's
  // documented default is 'casual' (set in getGatheringContext for any member
  // with no explicit Relationship record), so null — only the current user's
  // own row — is treated as casual. No member disappears; no Uncategorized
  // section is needed.
  const closeMembers = roleFiltered.filter((m) => m.myRelationship === 'close');
  const casualMembers = roleFiltered.filter((m) => m.myRelationship !== 'close');
  // Re-derive the open sheet's member from fresh data so role/relationship
  // edits reflect immediately; falls back to the stored object if it's gone.
  const active = activeMember ? (members.find((m) => m.id === activeMember.id) || activeMember) : null;

  return (
    <PageToolbar scope={scope} setScope={setScope} showImagesToggle={false} onAdd={() => setAddOpen(true)} canAdd={canManage} addLabel="member" filterRow={<FilterChips options={ROLE_FILTER_OPTIONS} value={roleFilter} onChange={setRoleFilter} />}>
      {loading ? (
        <MembersSkeleton />
      ) : roleFiltered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={roleFilter !== 'all' ? 'No members with this role' : (scope === 'mine' ? 'Nothing to show' : 'No members yet')}
          body={roleFilter !== 'all' ? 'Switch to All to see everyone, or pick another role.' : (scope === 'mine' ? 'Switch to Group to see everyone in this gathering.' : 'Add your crew to start coordinating — invite members to participate in the trip, or viewers to follow along read-only.')}
          action={canManage && scope !== 'mine' && roleFilter === 'all' ? (
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus /> Add the first member
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-6">
          <MemberSection title="Close" count={closeMembers.length}>
            {closeMembers.map((m) => (
              <MemberRow key={m.id} member={m} gatheringId={gatheringId} isSelf={m.id === currentMember?.id} onOpen={() => { setActiveMember(m); setSheetOpen(true); }} />
            ))}
          </MemberSection>
          <MemberSection title="Casual" count={casualMembers.length}>
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

      <FormSheet open={addOpen} onOpenChange={setAddOpen} title="Add a member" maxWidth="max-w-md">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-ink-deep">Name</Label>
            <Input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} placeholder="Jordan Lee" required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Home city</Label>
            <Input value={addForm.home_city} onChange={(e) => setAddForm({ ...addForm, home_city: e.target.value })} placeholder="Brooklyn, NY" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Role</Label>
            <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — co-organizer, manages members & journey</SelectItem>
                <SelectItem value="member">Member — participates, in expenses</SelectItem>
                <SelectItem value="viewer">Viewer — read only, not in expenses</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-deep/50">They'll be invited to claim their account from the Members page later.</p>
          </div>
          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}><X /> Cancel</Button>
            <Button type="submit" disabled={adding}>
              {adding ? <Loader2 className="animate-spin" /> : <UserPlus />} Add member
            </Button>
          </DialogFooter>
        </form>
      </FormSheet>
    </PageToolbar>
  );
}