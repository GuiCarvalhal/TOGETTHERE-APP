import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import RoleStamp from '@/components/tt/RoleStamp';
import { MapPin, ChevronRight } from 'lucide-react';

// Compact member row — the list equivalent of a Journey/Expense card: same
// surface (rounded-2xl, hairline border, card bg, float shadow), one member
// per row, essentials only (avatar, name, role chip, home city). Tapping the
// row opens the member's gathering detail sheet — the way a Journey card
// opens its detail. No inline action buttons; management lives in the sheet.
export default function MemberRow({ member, gatheringId, isSelf, onOpen }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`flex items-center gap-3 rounded-2xl border border-ink-charcoal/15 bg-card p-3 tt-shadow-float cursor-pointer hover:border-terra/30 transition-colors ${member.role === 'viewer' ? 'border-dashed' : ''}`}
    >
      <MemberAvatar member={member} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="font-display text-sm font-bold text-ink-deep leading-tight truncate">{member.full_name || 'Unnamed member'}</h3>
          {isSelf && <span className="tt-label text-ink-deep/40 shrink-0">You</span>}
        </div>
        {member.home_city ? (
          <p className="inline-flex items-center gap-1 text-xs text-ink-deep/55 mt-0.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{member.home_city}</p>
        ) : member.email ? (
          <p className="text-xs text-ink-deep/40 mt-0.5 truncate">{member.email}</p>
        ) : null}
      </div>
      <RoleStamp role={member.role} size="xs" className="shrink-0" />
      <ChevronRight className="w-4 h-4 text-ink-deep/30 shrink-0" />
    </div>
  );
}