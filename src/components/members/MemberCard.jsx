import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import RoleStamp from '@/components/tt/RoleStamp';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MapPin, CalendarDays, Phone, StickyNote, Trash2, UserPlus, Eye } from 'lucide-react';
import { formatDate, relationshipLabel } from '@/lib/gatheringHelpers';

export default function MemberCard({
  member, isOwner, canManage, isSelf, myRelationship, visibility, onRelationshipChange, onRoleChange, onRemove,
}) {
  return (
    <div className={`tt-card p-5 flex flex-col gap-4 ${member.role === 'viewer' ? 'border-dashed border-ink-charcoal/25 bg-cream-pale/40' : ''}`}>
      <div className="flex items-start gap-4">
        <MemberAvatar member={member} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-xl font-bold text-ink-deep leading-tight truncate">{member.full_name || 'Unnamed member'}</h3>
            <RoleStamp role={member.role} />
            {member.role === 'viewer' && <span className="inline-flex items-center gap-1 text-[0.625rem] text-ink-deep/45"><Eye className="w-3 h-3" /> Read-only</span>}
            {isSelf && <span className="tt-label text-ink-deep/40">You</span>}
          </div>
          {member.home_city && (
            <p className="inline-flex items-center gap-1.5 text-sm text-ink-deep/60 mt-1"><MapPin className="w-3.5 h-3.5" />{member.home_city}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="tt-label text-ink-deep/40 mb-1">Arrival</p>
          <p className="text-ink-deep flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-terra-deep" />{member.arrival_date ? formatDate(member.arrival_date, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
        </div>
        <div>
          <p className="tt-label text-ink-deep/40 mb-1">Departure</p>
          <p className="text-ink-deep flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-terra-deep" />{member.departure_date ? formatDate(member.departure_date, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
        </div>
      </div>

      {visibility === 'full' ? (
        <div className="space-y-2 pt-2 border-t border-ink-charcoal/10">
          {member.dietary_preferences?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {member.dietary_preferences.map((d) => (
                <span key={d} className="px-2 py-0.5 rounded-full bg-cream-pale text-xs text-ink-deep/70 border border-ink-charcoal/10">{d}</span>
              ))}
            </div>
          )}
          {member.interests?.length > 0 && (
            <p className="text-xs text-ink-deep/60"><span className="tt-label text-ink-deep/40 mr-1.5">Interests</span>{member.interests.join(' · ')}</p>
          )}
          {member.contact_info && (
            <p className="text-xs text-ink-deep/70 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-terra-deep" />{member.contact_info}</p>
          )}
          {member.private_notes && (
            <p className="text-xs text-ink-deep/70 flex items-start gap-1.5"><StickyNote className="w-3.5 h-3.5 text-terra-deep mt-0.5" />{member.private_notes}</p>
          )}
        </div>
      ) : (
        <div className="pt-2 border-t border-ink-charcoal/10">
          <p className="text-xs text-ink-deep/45 italic">Limited profile — mark this member as Close to see contact details and private notes.</p>
        </div>
      )}

      {!isSelf && (
        <div className="pt-2 border-t border-ink-charcoal/10">
          <p className="tt-label text-ink-deep/40 mb-2">Your relationship</p>
          <div className="inline-flex rounded-full bg-cream-pale p-1 border border-ink-charcoal/15">
            {['casual', 'close'].map((rel) => (
              <button key={rel} onClick={() => onRelationshipChange(rel)}
                className={`px-4 py-2.5 min-h-[44px] rounded-full text-xs font-semibold capitalize transition-colors ${myRelationship === rel ? 'bg-terra text-cream' : 'text-ink-deep/60 hover:text-ink-deep'}`}>
                {rel}
              </button>
            ))}
          </div>
        </div>
      )}

      {canManage && !isSelf && !(member.role === 'owner' && !isOwner) && (
        <div className="pt-2 border-t border-ink-charcoal/10 flex items-center gap-2">
          <Select value={member.role} onValueChange={(r) => onRoleChange(r)}>
            <SelectTrigger className="h-11 w-36 bg-cream-pale border-ink-charcoal/20 text-ink-deep text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {isOwner && <SelectItem value="owner">Owner</SelectItem>}
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={onRemove} className="ml-auto inline-flex items-center gap-1 text-xs text-terra-deep hover:text-terra px-3 py-2.5 min-h-[44px]">
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}