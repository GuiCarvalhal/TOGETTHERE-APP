import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Users, Plus, Trash2, Pencil, Check, UserMinus, LogOut, Loader2, AlertTriangle } from 'lucide-react';

// One family per user. A user can belong to exactly one Family (owner or
// member). Create + add-member go through the manageFamily backend function,
// which rejects a second family for any user with a clear error — so the
// invariant holds even if the client is bypassed. Leave is also server-side
// (members can't update a family under RLS). Rename / remove-member / delete
// stay client-side (owner-only via RLS) and don't touch the invariant.
//
// UI: if the user already has a family, only management is offered (rename,
// add/remove members, leave/delete) — never "create". Adding a candidate who
// already belongs to another family is BLOCKED (safest: no silent moves or
// duplicates) and explained inline. Pre-existing duplicate memberships are
// surfaced gracefully, never auto-deleted.
export default function FamilyManager({ families, gatheringId, userId, onChanged }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState([]);
  const [candidateFamilies, setCandidateFamilies] = useState({}); // uid -> family they're in
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [addingUid, setAddingUid] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, desc, label, onConfirm }

  // Primary family for display: prefer the one the user owns, else the first.
  // Duplicates are surfaced, never auto-fixed.
  const primaryFamily = useMemo(() => {
    if (!families?.length) return null;
    return families.find((f) => f.owner_user_id === userId) || families[0];
  }, [families, userId]);
  const hasFamily = !!primaryFamily;
  const multiple = (families?.length || 0) > 1;
  const isOwner = primaryFamily?.owner_user_id === userId;

  // Trip members as add-candidates + their family membership (to block adding
  // someone already in another family).
  useEffect(() => {
    if (!gatheringId) { setCandidates([]); setCandidateFamilies({}); return; }
    let active = true;
    (async () => {
      try {
        const ms = await base44.entities.Member.filter({ gathering_id: gatheringId });
        if (!active) return;
        const cands = ms.filter((m) => m.user_id && m.user_id !== userId && (m.role === 'owner' || m.role === 'member'));
        setCandidates(cands);
        const res = await base44.functions.invoke('getFamiliesForUsers', { user_ids: cands.map((m) => m.user_id) });
        const data = res.data || res;
        const map = {};
        for (const f of data.families || []) {
          for (const uid of [f.owner_user_id, ...(f.member_user_ids || [])]) {
            if (!map[uid]) map[uid] = f;
          }
        }
        setCandidateFamilies(map);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [gatheringId, userId]);

  const candById = Object.fromEntries(candidates.map((m) => [m.user_id, m]));
  const memberLabel = (uid) => candById[uid]?.full_name || (uid === userId ? 'You' : 'Member');

  async function createFamily() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await base44.functions.invoke('manageFamily', { action: 'create', name: newName.trim(), member_user_ids: newMembers });
      setNewName(''); setNewMembers([]); setCreating(false);
      onChanged();
      toast({ title: 'Family created' });
    } catch (e) {
      toast({ title: e.response?.data?.error || e.message || 'Could not create', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function addMember(uid) {
    setAddingUid(uid);
    try {
      await base44.functions.invoke('manageFamily', { action: 'add_member', family_id: primaryFamily.id, user_id: uid });
      onChanged();
      toast({ title: 'Member added' });
    } catch (e) {
      toast({ title: e.response?.data?.error || e.message || 'Could not add', variant: 'destructive' });
    } finally {
      setAddingUid(null);
    }
  }

  async function removeMember(uid) {
    try {
      const members = (primaryFamily.member_user_ids || []).filter((x) => x !== uid);
      await base44.entities.Family.update(primaryFamily.id, { member_user_ids: members });
      onChanged();
      toast({ title: 'Member removed' });
    } catch (e) {
      toast({ title: e.message || 'Could not remove', variant: 'destructive' });
    }
  }

  async function leaveFamily() {
    try {
      await base44.functions.invoke('manageFamily', { action: 'leave', family_id: primaryFamily.id });
      onChanged();
      toast({ title: 'You left the family' });
    } catch (e) {
      toast({ title: e.response?.data?.error || e.message || 'Could not leave', variant: 'destructive' });
    }
  }

  async function deleteFamily() {
    try {
      await base44.entities.Family.delete(primaryFamily.id);
      onChanged();
      toast({ title: 'Family deleted' });
    } catch (e) {
      toast({ title: e.message || 'Could not delete', variant: 'destructive' });
    }
  }

  async function saveRename() {
    try {
      await base44.entities.Family.update(primaryFamily.id, { name: renameVal.trim() || primaryFamily.name });
      setRenaming(false);
      onChanged();
      toast({ title: 'Renamed' });
    } catch (e) {
      toast({ title: e.message || 'Could not rename', variant: 'destructive' });
    }
  }

  const memberIds = primaryFamily
    ? [primaryFamily.owner_user_id, ...(primaryFamily.member_user_ids || []).filter((uid) => uid !== primaryFamily.owner_user_id)]
    : [];

  // Candidates available to add: trip members not already in this family.
  const candidateRows = candidates
    .map((m) => {
      const inThis = primaryFamily && (m.user_id === primaryFamily.owner_user_id || (primaryFamily.member_user_ids || []).includes(m.user_id));
      const theirFam = candidateFamilies[m.user_id];
      return { m, inThis, inAnother: !inThis && !!theirFam, theirFam };
    })
    .filter((r) => !r.inThis);

  return (
    <div className="tt-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="tt-label text-ink-deep/40 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Family &amp; household</p>
        {!hasFamily && !creating && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}><Plus /> Create</Button>
        )}
      </div>

      {/* No family yet — create flow */}
      {!hasFamily && creating && (
        <div className="space-y-3 rounded-xl bg-cream-pale p-3 border border-ink-charcoal/15">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Family name (e.g. The Okafor Family)" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          {gatheringId ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-deep/60">Add members from this trip</Label>
              <div className="flex flex-wrap gap-1.5">
                {candidateRows.map(({ m, inAnother, theirFam }) => {
                  if (inAnother) {
                    return (
                      <span key={m.user_id} title={`Already in ${theirFam.name}`} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-foreground/5 text-foreground/40 border border-foreground/10 text-xs min-h-[36px]">
                        <MemberAvatar member={m} size="xs" /> {m.full_name} · in another family
                      </span>
                    );
                  }
                  const sel = newMembers.includes(m.user_id);
                  return (
                    <button key={m.user_id} type="button" onClick={() => setNewMembers((s) => s.includes(m.user_id) ? s.filter((x) => x !== m.user_id) : [...s, m.user_id])}
                      className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs min-h-[36px] transition-colors ${sel ? 'bg-terra text-cream border-terra' : 'bg-foreground/5 text-foreground/80 border-foreground/12 hover:bg-foreground/10'}`}>
                      <MemberAvatar member={m} size="xs" /> {m.full_name}
                    </button>
                  );
                })}
                {candidateRows.length === 0 && <span className="text-xs text-ink-deep/45">No other trip members to add.</span>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-deep/50">Open this from a trip to add members to the family.</p>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={createFamily} disabled={busy || !newName.trim()}>{busy && <Loader2 className="animate-spin" />} Create family</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setCreating(false); setNewName(''); setNewMembers([]); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {!hasFamily && !creating && (
        <p className="text-xs text-ink-deep/50">Group your crew into a household so expenses can split by family. You can have one family — create it here.</p>
      )}

      {/* Has family — manage flow */}
      {hasFamily && (
        <div className="space-y-3">
          {multiple && (
            <div className="flex items-start gap-2 rounded-xl bg-terra/10 border border-terra/20 p-2.5 text-xs text-ink-deep/70">
              <AlertTriangle className="w-3.5 h-3.5 text-terra-deep shrink-0 mt-0.5" />
              <p>You appear in more than one family. Showing your primary (&ldquo;{primaryFamily.name}&rdquo;). This isn&rsquo;t auto-fixed — contact support to consolidate.</p>
            </div>
          )}

          {renaming ? (
            <div className="flex items-center gap-2">
              <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" autoFocus />
              <Button type="button" size="sm" onClick={saveRename}><Check /> Save</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p className="font-semibold text-ink-deep text-sm flex-1 truncate">{primaryFamily.name}</p>
              {isOwner && <Button type="button" variant="secondary" size="sm" onClick={() => { setRenameVal(primaryFamily.name); setRenaming(true); }}><Pencil /> Rename</Button>}
              {isOwner && <Button type="button" variant="destructive" size="sm" onClick={() => setConfirm({ title: `Delete "${primaryFamily.name}"?`, desc: 'This removes the family for everyone in it. This cannot be undone.', label: 'Delete', onConfirm: deleteFamily })}><Trash2 /> Delete</Button>}
              {!isOwner && <Button type="button" variant="destructive" size="sm" onClick={() => setConfirm({ title: `Leave "${primaryFamily.name}"?`, desc: 'You will no longer be part of this family.', label: 'Leave', onConfirm: leaveFamily })}><LogOut /> Leave</Button>}
            </div>
          )}

          {/* Members — compact rows */}
          <div className="space-y-1.5">
            {memberIds.map((uid) => {
              const isSelf = uid === userId;
              const canRemove = isOwner && !isSelf;
              return (
                <div key={uid} className="flex items-center gap-3 rounded-2xl border border-ink-charcoal/15 bg-card p-2.5">
                  <MemberAvatar member={{ full_name: memberLabel(uid) }} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-bold text-ink-deep leading-tight truncate">{memberLabel(uid)}{isSelf && <span className="tt-label text-ink-deep/40 ml-1.5">You</span>}</p>
                    <p className="text-xs text-ink-deep/45">{uid === primaryFamily.owner_user_id ? 'Owner' : 'Member'}</p>
                  </div>
                  {canRemove && (
                    <Button type="button" variant="destructive" size="sm" onClick={() => setConfirm({ title: `Remove ${memberLabel(uid)}?`, desc: 'They will no longer be part of this family.', label: 'Remove', onConfirm: () => removeMember(uid) })}><UserMinus /> Remove</Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add members (owner only, needs a trip) */}
          {isOwner && gatheringId && (
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-deep/60">Add members from this trip</Label>
              <div className="flex flex-wrap gap-1.5">
                {candidateRows.map(({ m, inAnother, theirFam }) => {
                  if (inAnother) {
                    return (
                      <span key={m.user_id} title={`Already in ${theirFam.name}`} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-foreground/5 text-foreground/40 border border-foreground/10 text-xs min-h-[36px]">
                        <MemberAvatar member={m} size="xs" /> {m.full_name} · in another family
                      </span>
                    );
                  }
                  const adding = addingUid === m.user_id;
                  return (
                    <button key={m.user_id} type="button" disabled={adding} onClick={() => addMember(m.user_id)}
                      className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-foreground/5 text-foreground/80 border border-foreground/12 hover:bg-foreground/10 text-xs min-h-[36px] disabled:opacity-60">
                      <MemberAvatar member={m} size="xs" /> {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {m.full_name}
                    </button>
                  );
                })}
                {candidateRows.length === 0 && <span className="text-xs text-ink-deep/45">Everyone on this trip is already in your family.</span>}
              </div>
            </div>
          )}
          {isOwner && !gatheringId && (
            <p className="text-xs text-ink-deep/50">Open this from a trip to add members.</p>
          )}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { const fn = confirm?.onConfirm; setConfirm(null); fn?.(); }}>{confirm?.label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}