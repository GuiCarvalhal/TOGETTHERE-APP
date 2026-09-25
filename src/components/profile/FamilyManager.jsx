import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Users, Plus, Trash2, Pencil, Check } from 'lucide-react';

// Create / manage global families (households). A family is a named group of
// users used by Expenses split grouping. Members are added from the current
// trip's roster when available; families are global and reusable across trips.
// Never merges user records — each member keeps an independent split.
export default function FamilyManager({ families, gatheringId, userId, onChanged }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editMembers, setEditMembers] = useState([]);

  useEffect(() => {
    if (!gatheringId) { setCandidates([]); return; }
    base44.entities.Member.filter({ gathering_id: gatheringId })
      .then((ms) => setCandidates(ms.filter((m) => m.user_id && m.user_id !== userId && (m.role === 'owner' || m.role === 'member'))))
      .catch(() => {});
  }, [gatheringId, userId]);

  async function createFamily() {
    if (!newName.trim()) return;
    try {
      await base44.entities.Family.create({ name: newName.trim(), owner_user_id: userId, member_user_ids: newMembers });
      setNewName(''); setNewMembers([]); setCreating(false);
      onChanged();
      toast({ title: 'Family created' });
    } catch (e) {
      toast({ title: e.message || 'Could not create', variant: 'destructive' });
    }
  }

  function startEdit(fam) {
    setEditingId(fam.id); setEditName(fam.name); setEditMembers([...(fam.member_user_ids || [])]);
  }

  async function saveEdit(fam) {
    try {
      await base44.entities.Family.update(fam.id, { name: editName.trim() || fam.name, member_user_ids: editMembers });
      setEditingId(null);
      onChanged();
      toast({ title: 'Family updated' });
    } catch (e) {
      toast({ title: e.message || 'Could not update', variant: 'destructive' });
    }
  }

  async function removeFamily(fam) {
    if (!confirm(`Delete the "${fam.name}" family?`)) return;
    try {
      await base44.entities.Family.delete(fam.id);
      onChanged();
    } catch (e) {
      toast({ title: e.message || 'Could not delete', variant: 'destructive' });
    }
  }

  const candById = Object.fromEntries(candidates.map((m) => [m.user_id, m]));
  const memberLabel = (uid) => candById[uid]?.full_name || (uid === userId ? 'You' : 'Member');

  const CandidateChips = ({ selected, onToggle }) => (
    <div className="flex flex-wrap gap-1.5">
      {candidates.map((m) => {
        const sel = selected.includes(m.user_id);
        return (
          <button key={m.user_id} type="button" onClick={() => onToggle(m.user_id)}
            className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs min-h-[36px] ${sel ? 'bg-terra text-cream border-terra' : 'bg-cream text-ink-deep/70 border-ink-charcoal/15'}`}>
            <MemberAvatar member={m} size="xs" /> {m.full_name}
          </button>
        );
      })}
      {candidates.length === 0 && <span className="text-xs text-ink-deep/45">No other trip members to add.</span>}
    </div>
  );

  return (
    <div className="tt-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="tt-label text-ink-deep/40 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Family &amp; household</p>
        {!creating && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus /> Create
          </Button>
        )}
      </div>

      {creating && (
        <div className="space-y-3 rounded-xl bg-cream-pale p-3 border border-ink-charcoal/15">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Family name (e.g. The Okafor Family)" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          {gatheringId ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-deep/60">Add members from this trip</Label>
              <CandidateChips selected={newMembers} onToggle={(uid) => setNewMembers((s) => s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid])} />
            </div>
          ) : (
            <p className="text-xs text-ink-deep/50">Open this from a trip to add members to the family.</p>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={createFamily}>Create family</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setCreating(false); setNewName(''); setNewMembers([]); }}>Cancel</Button>
          </div>
        </div>
      )}

      {families.length === 0 && !creating && (
        <p className="text-xs text-ink-deep/50">Group your crew into a household so expenses can split by family. You can still override any member individually when splitting.</p>
      )}

      <div className="space-y-2">
        {families.map((fam) => {
          const isEdit = editingId === fam.id;
          return (
            <div key={fam.id} className="rounded-xl border border-ink-charcoal/12 p-3 space-y-2">
              {isEdit ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
                  {gatheringId && (
                    <CandidateChips selected={editMembers} onToggle={(uid) => setEditMembers((s) => s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid])} />
                  )}
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" onClick={() => saveEdit(fam)}><Check /> Save</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <p className="font-semibold text-ink-deep text-sm flex-1 truncate">{fam.name}</p>
                    <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(fam)}><Pencil /> Edit</Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => removeFamily(fam)}><Trash2 /> Delete</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-terra/10 text-terra-deep border border-terra/20 text-xs">
                      <MemberAvatar member={{ full_name: memberLabel(fam.owner_user_id) }} size="xs" /> You
                    </span>
                    {(fam.member_user_ids || []).filter((uid) => uid !== fam.owner_user_id).map((uid) => (
                      <span key={uid} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-cream-pale text-ink-deep/70 border border-ink-charcoal/12 text-xs">
                        <MemberAvatar member={{ full_name: memberLabel(uid) }} size="xs" /> {memberLabel(uid)}
                      </span>
                    ))}
                    {(fam.member_user_ids || []).length === 0 && <span className="text-xs text-ink-deep/45 self-center">No members yet.</span>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}