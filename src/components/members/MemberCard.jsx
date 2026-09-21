import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import RoleStamp from '@/components/tt/RoleStamp';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MapPin, CalendarDays, Phone, StickyNote, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/gatheringHelpers';

// Compact member card. Avatar size scales with the "images" toggle (lg when on,
// md when compact) for a tighter density when images are off.
export default function MemberCard({
  member, isOwner, canManage, isSelf, myRelationship, visibility, showImages = true,
  onRelationshipChange, onRoleChange, onRemove,
}) {
  const avatarSize = showImages ? 'lg' : 'md';
  return (
    <div className={`tt-card p-3.5 flex flex-col gap-2.5 ${member.role === 'viewer' ? 'border-dashed border-ink-charcoal/25 bg-cream-pale/40' : ''}`}>
      <div className="flex items-center gap-3">
        <MemberAvatar member={member} size={avatarSize} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-display text-base font-bold text-ink-deep leading-tight truncate">{member.full_name || 'Unnamed member'}</h3>
            <RoleStamp role={member.role} size="xs" />
            {isSelf && <span className="tt-label text-ink-deep/40">You</span>}
          </div>
          {member.home_city && (
            <p className="inline-flex items-center gap-1 text-xs text-ink-deep/55 mt-0.5"><MapPin className="w-3 h-3" />{member.home_city}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="tt-label text-ink-deep/40 mb-0.5">Arrival</p>
          <p className="text-ink-deep flex items-center gap-1"><CalendarDays className="w-3 h-3 text-terra-deep" />{member.arrival_date ? formatDate(member.arrival_date, { month: 'short', day: 'numeric' }) : '—'}</p>
        </div>
        <div>
          <p className="tt-label text-ink-deep/40 mb-0.5">Departure</p>
          <p className="text-ink-deep flex items-center gap-1"><CalendarDays className="w-3 h-3 text-terra-deep" />{member.departure_date ? formatDate(member.departure_date, { month: 'short', day: 'numeric' }) : '—'}</p>
        </div>
      </div>

      {visibility === 'full' ? (
        <div className="space-y-1.5 pt-2 border-t border-ink-charcoal/10">
          {member.dietary_preferences?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {member.dietary_preferences.map((d) => (
                <span key={d} className="px-1.5 py-0.5 rounded-full bg-cream-pale text-[0.625rem] text-ink-deep/70 border border-ink-charcoal/10">{d}</span>
              ))}
            </div>
          )}
          {member.interests?.length > 0 && (
            <p className="text-[0.625rem] text-ink-deep/60"><span className="tt-label text-ink-deep/40 mr-1.5">Interests</span>{member.interests.join(' · ')}</p>
          )}
          {member.contact_info && (
            <p className="text-[0.625rem] text-ink-deep/70 flex items-center gap-1"><Phone className="w-3 h-3 text-terra-deep" />{member.contact_info}</p>
          )}
          {member.private_notes && (
            <p className="text-[0.625rem] text-ink-deep/70 flex items-start gap-1"><StickyNote className="w-3 h-3 text-terra-deep mt-0.5" />{member.private_notes}</p>
          )}
        </div>
      ) : (
        <div className="pt-2 border-t border-ink-charcoal/10">
          <p className="text-[0.625rem] text-ink-deep/45 italic">Limited — mark Close to see contact details &amp; notes.</p>
        </div>
      )}

      {!isSelf && (
        <div className="pt-2 border-t border-ink-charcoal/10">
          <div className="inline-flex rounded-full bg-cream-pale p-0.5 border border-ink-charcoal/15">
            {['casual', 'close'].map((rel) => (
              <button key={rel} onClick={() => onRelationshipChange(rel)}
                className={`px-3 py-1.5 min-h-[36px] rounded-full text-[0.6875rem] font-semibold capitalize transition-colors ${myRelationship === rel ? 'bg-terra text-cream' : 'text-ink-deep/60 hover:text-ink-deep'}`}>
                {rel}
              </button>
            ))}
          </div>
        </div>
      )}

      {canManage && !isSelf && !(member.role === 'owner' && !isOwner) && (
        <div className="pt-2 border-t border-ink-charcoal/10 flex items-center gap-2">
          <Select value={member.role} onValueChange={(r) => onRoleChange(r)}>
            <SelectTrigger className="h-9 w-32 bg-cream-pale border-ink-charcoal/20 text-ink-deep text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {isOwner && <SelectItem value="owner">Owner</SelectItem>}
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={onRemove} className="ml-auto inline-flex items-center gap-1 text-xs text-terra-deep hover:text-terra px-2 py-2 min-h-[36px]">
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}