import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Plus, LogOut } from 'lucide-react';

const LABELS = {
  flight: "I'm on this flight",
  car: "I'm in this ride",
  train: "I'm on this train",
  hotel: "I'm staying here",
  activity: "I'm doing this",
  cruise: "I'm on this cruise",
  other: "I'm on this too",
};

// Self-service opt-in/opt-out of a segment. Toggles the current user in
// attendee_user_ids via joinJourneySegment (action 'join' | 'leave'). The
// creator is always a participant and is shown a "hosting" state instead of a
// leave control (they manage others from the edit form).
export default function JoinSegmentButton({ item, currentMember, onJoined, compact }) {
  const [busy, setBusy] = useState(false);
  const attendees = item.attendee_user_ids || [];
  const isCreator = currentMember && item.owner_id === currentMember.user_id;
  const amIn = currentMember && (attendees.includes(currentMember.user_id) || isCreator);
  // Viewers are read-only: never show a self join/leave control. The server
  // (joinJourneySegment) also rejects viewer joins, so this is UX, not security.
  if (currentMember?.role === 'viewer') return null;

  async function toggle() {
    setBusy(true);
    try {
      await base44.functions.invoke('joinJourneySegment', { item_id: item.id, action: amIn ? 'leave' : 'join' });
      onJoined?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  if (amIn && isCreator) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full bg-[#4a8b6f]/12 text-[#3f7a5e] font-semibold border border-[#4a8b6f]/25 ${compact ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5'}`}>
        <Check className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> {compact ? 'Hosting' : "You're hosting this"}
      </div>
    );
  }

  if (amIn) {
    return (
      <Button variant="secondary" size={compact ? 'sm' : 'default'} className={compact ? 'shrink-0' : 'w-full h-11'} onClick={toggle} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <LogOut />} {compact ? 'Leave' : 'Leave this segment'}
      </Button>
    );
  }

  return (
    <Button size={compact ? 'sm' : 'default'} className={compact ? 'shrink-0' : 'w-full h-11'} onClick={toggle} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Plus />} {compact ? 'Join' : (LABELS[item.type] || LABELS.other)}
    </Button>
  );
}