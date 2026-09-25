import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
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
export default function JoinSegmentButton({ item, currentMember, onJoined }) {
  const [busy, setBusy] = useState(false);
  const attendees = item.attendee_user_ids || [];
  const isCreator = currentMember && item.owner_id === currentMember.user_id;
  const amIn = currentMember && (attendees.includes(currentMember.user_id) || isCreator);

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
      <div className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#4a8b6f]/12 text-[#3f7a5e] font-semibold text-sm border border-[#4a8b6f]/25">
        <Check className="w-4 h-4" /> You're hosting this
      </div>
    );
  }

  if (amIn) {
    return (
      <button onClick={toggle} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full border border-ink-charcoal/20 text-ink-deep/70 font-semibold hover:bg-foreground/5 transition-colors min-h-[44px] disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Leave this segment
      </button>
    );
  }

  return (
    <button onClick={toggle} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep transition-colors min-h-[44px] disabled:opacity-60">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {LABELS[item.type] || LABELS.other}
    </button>
  );
}