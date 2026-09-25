import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Check, Loader2, Plus } from 'lucide-react';

const LABELS = {
  flight: "I'm on this flight",
  car: "I'm in this ride",
  train: "I'm on this train",
  hotel: "I'm staying here",
  activity: "I'm doing this",
  cruise: "I'm on this cruise",
  other: "I'm on this too",
};

// Self-service opt-in to a segment. Adds the current user to attendee_user_ids.
// Shows an "attending" state once they've joined.
export default function JoinSegmentButton({ item, currentMember, onJoined }) {
  const [joining, setJoining] = useState(false);
  const attendees = item.attendee_user_ids || [];
  const amIn = currentMember && (attendees.includes(currentMember.user_id) || item.owner_id === currentMember.user_id);

  if (amIn) {
    return (
      <div className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#4a8b6f]/12 text-[#3f7a5e] font-semibold text-sm border border-[#4a8b6f]/25">
        <Check className="w-4 h-4" /> You're attending
      </div>
    );
  }

  async function join() {
    setJoining(true);
    try {
      await base44.functions.invoke('joinJourneySegment', { item_id: item.id });
      onJoined?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not join');
    } finally {
      setJoining(false);
    }
  }

  return (
    <button onClick={join} disabled={joining} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep transition-colors min-h-[44px] disabled:opacity-60">
      {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {LABELS[item.type] || LABELS.other}
    </button>
  );
}