import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { canManageRoles, visibilityFor } from '@/lib/gatheringHelpers';
import MemberCard from '@/components/members/MemberCard';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserPlus, Loader2, Users } from 'lucide-react';

export default function GatheringMembers() {
  const { gatheringId, members, currentMember, role, setFab, refresh } = useGathering();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', role: 'member', home_city: '' });
  const [adding, setAdding] = useState(false);

  const isOwner = canManageRoles(role);

  useEffect(() => {
    if (isOwner) {
      setFab({ label: 'Add Member', icon: UserPlus, onClick: () => setAddOpen(true) });
    }
    return () => setFab(null);
  }, [setFab, isOwner]);

  function myRelationshipTo(targetUserId) {
    return currentMember?.relationships?.[targetUserId] || 'casual';
  }

  async function handleRelationshipChange(targetUserId, rel) {
    const rels = { ...(currentMember.relationships || {}) };
    rels[targetUserId] = rel;
    await base44.entities.Member.update(currentMember.id, { relationships: rels });
    refresh();
  }

  async function handleRoleChange(member, newRole) {
    await base44.entities.Member.update(member.id, { role: newRole });
    refresh();
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.full_name} from this gathering?`)) return;
    await base44.entities.Member.delete(member.id);
    refresh();
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.full_name.trim()) return;
    setAdding(true);
    try {
      await base44.entities.Member.create({
        gathering_id: gatheringId,
        user_id: `pending-${Date.now()}`,
        role: addForm.role,
        full_name: addForm.full_name.trim(),
        home_city: addForm.home_city,
      });
      setAddOpen(false);
      setAddForm({ full_name: '', role: 'member', home_city: '' });
      refresh();
    } catch (err) {
      alert(err.message || 'Could not add member');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold">Members</h2>
        <p className="text-cream/60 text-sm mt-1">Your crew. Set who you're close with to share more of your profile.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {members.map((m) => {
          const isSelf = m.id === currentMember?.id;
          const vis = isSelf ? 'full' : visibilityFor(role, myRelationshipTo(m.user_id));
          return (
            <MemberCard
              key={m.id}
              member={m}
              isOwner={isOwner}
              isSelf={isSelf}
              myRelationship={isSelf ? null : myRelationshipTo(m.user_id)}
              visibility={vis}
              onRelationshipChange={(rel) => handleRelationshipChange(m.user_id, rel)}
              onRoleChange={(r) => handleRoleChange(m, r)}
              onRemove={() => handleRemove(m)}
            />
          );
        })}
      </div>

      {members.length === 0 && (
        <div className="tt-card p-10 text-center">
          <Users className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">No members yet</p>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="tt-card rounded-[1.5rem] p-0 max-w-md">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="font-display text-2xl font-bold text-ink-deep">Add a member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="px-6 pb-6 space-y-4">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}