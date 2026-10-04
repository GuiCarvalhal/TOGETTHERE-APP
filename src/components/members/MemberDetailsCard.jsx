import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import RoleStamp from '@/components/tt/RoleStamp';
import ProfileChips from '@/components/profile/ProfileChips';
import { INTERESTS } from '@/lib/profileOptions';
import { MapPin, Users, Mail } from 'lucide-react';

// Expanded member card for the Members page Details mode. Shows everything
// the Summary row shows (avatar, name, email, role) PLUS actual stored
// Interests and Family info — never made-up data. Only fields that are
// actually populated on the member record are rendered; absent fields are
// omitted (no placeholder text, no fabricated values).
//
// `family` (optional): { name, memberNames: [string] } — the family this
// member belongs to in this gathering, if any. Resolved by the parent page
// from the Family entity via getFamiliesForUsers. Null when the member is
// not in any family.
//
// `onOpen`: opens the MemberDetailSheet (same as Summary mode tap).
export default function MemberDetailsCard({ member, family, isSelf, gatheringId, onOpen }) {
  const interests = member.interests || [];
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`rounded-2xl border border-ink-charcoal/15 bg-card p-3 tt-shadow-float cursor-pointer hover:border-terra/30 transition-colors ${member.role === 'viewer' ? 'border-dashed' : ''}`}
    >
      <div className="flex items-center gap-3">
        <MemberAvatar member={member} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-display text-sm font-bold text-ink-deep leading-tight truncate">{member.full_name || 'Unnamed member'}</h3>
            {isSelf && <span className="tt-label text-ink-deep/40 shrink-0">You</span>}
          </div>
          {member.email && (
            <p className="inline-flex items-center gap-1 text-xs text-ink-deep/55 mt-0.5 truncate">
              <Mail className="w-3 h-3 shrink-0" />{member.email}
            </p>
          )}
        </div>
        <RoleStamp role={member.role} size="xs" className="shrink-0" />
      </div>

      <div className="mt-2.5 space-y-2 pt-2 border-t border-ink-charcoal/10">
        {interests.length > 0 && (
          <div>
            <p className="tt-label text-ink-deep/40 mb-1.5">Interests</p>
            <ProfileChips values={interests} catalog={INTERESTS} />
          </div>
        )}
        {family && (
          <div>
            <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1">
              <Users className="w-3 h-3 text-terra-deep" /> {family.name}
            </p>
            {family.memberNames.length > 0 && (
              <p className="text-xs text-ink-deep/60">{family.memberNames.join(' · ')}</p>
            )}
          </div>
        )}
        {!interests.length && !family && (
          <p className="text-xs text-ink-deep/40 italic">No additional details stored.</p>
        )}
      </div>
    </div>
  );
}