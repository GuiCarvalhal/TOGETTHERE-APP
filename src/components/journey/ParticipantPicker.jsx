import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Check } from 'lucide-react';

// Selects which gathering members are participants in a journey item. The
// selection is written to JourneyItem.attendee_user_ids (the opt-in list),
// never member_user_ids (the ACL list). Only gathering members appear; the
// creator is always included and shown as "(you)" when it's the current user.
export default function ParticipantPicker({ members, selected, onToggle, currentUserId }) {
  if (!members?.length) return null;
  return (
    <div className="space-y-1.5">
      {members.map((m) => {
        const isOn = selected.includes(m.user_id);
        const isMe = m.user_id === currentUserId;
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => onToggle(m.user_id)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors min-h-[44px] text-left ${isOn ? 'border-terra/40 bg-terra/10' : 'border-ink-charcoal/15 bg-cream-pale hover:bg-cream-warm'}`}
          >
            <MemberAvatar member={m} size="xs" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-ink-deep truncate">{m.full_name}{isMe ? ' (you)' : ''}</span>
              <span className="block text-[0.625rem] uppercase tracking-wide text-ink-deep/45 capitalize">{m.role}</span>
            </span>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isOn ? 'bg-terra text-cream' : 'border border-ink-charcoal/25'}`}>
              {isOn && <Check className="w-3 h-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}