import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { canManageMembers } from '@/lib/gatheringHelpers';
import MemberCard from '@/components/members/MemberCard';
import PageToolbar from '@/components/tt/PageToolbar';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import { DialogFooter } from '@/components/ui/dialog';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserPlus, Loader2, Users } from 'lucide-react';
import usePolling from '@/hooks/usePolling';
import EmptyState from '@/components/tt/EmptyState';

export default function GatheringMembers() {
  const { gatheringId, members, currentMember, role, setFab, refresh, silentRefresh } = useGathering();
  const { scope, setScope, images, setImages } = useViewPrefs(gatheringId);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', role: 'member', home_city: '' });
  const [adding, setAdding] = useState(false);

  const canManage = canManageMembers(role);
  const isOwner = role === 'owner';

  useEffect(() => {
    if (canManage) {
      setFab({ label: 'Add Member', icon: UserPlus, onClick: () => setAddOpen(true) });
    }
    return () => setFab(null);
  }, [setFab, canManage]);

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

  return (
    <div className="space-y-6">
      <PageToolbar scope={scope} setScope={setScope} images={images} setImages={setImages} />

      {visibleMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={scope === 'mine' ? 'Nothing to show' : 'No members yet'}
          body={scope === 'mine' ? 'Switch to Group to see everyone in this gathering.' : 'Add your crew to start coordinating — invite members to participate in the trip, or viewers to follow along read-only.'}
          action={canManage && scope !== 'mine' ? (
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep">
              <UserPlus className="w-4 h-4" /> Add the first member
            </button>
          ) : undefined}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleMembers.map((m) => {
            const isSelf = m.id === currentMember?.id;
            return (
              <MemberCard
                key={m.id}
                member={m}
                gatheringId={gatheringId}
                isOwner={isOwner}
                canManage={canManage}
                isSelf={isSelf}
                myRelationship={m.myRelationship}
                visibility={m.visibility}
                showImages={images}
                onRelationshipChange={(rel) => handleRelationshipChange(m.user_id, rel)}
                onRoleChange={(r) => handleRoleChange(m, r)}
                onRemove={() => handleRemove(m)}
              />
            );
          })}
        </div>
      )}

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
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} className="text-ink-deep/60 hover:text-ink-deep">Cancel</Button>
            <Button type="submit" disabled={adding} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
              {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add member
            </Button>
          </DialogFooter>
        </form>
      </FormSheet>
    </div>
  );
}