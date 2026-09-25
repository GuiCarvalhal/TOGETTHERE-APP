import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import MemberAvatar from '@/components/tt/MemberAvatar';
import RoleStamp from '@/components/tt/RoleStamp';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, CalendarDays, Phone, StickyNote, Trash2, User } from 'lucide-react';
import { formatDate } from '@/lib/gatheringHelpers';

// Member detail + actions sheet, opened by tapping a member row. It carries
// the full gathering-scoped content the old oversized card showed inline
// (arrival/departure, dietary, interests, contact, notes — visibility-gated)
// plus the management actions (relationship, role, remove) that used to sit
// as a wall of buttons on the card, now grouped here so the row stays
// compact. A "View full profile" button opens the universal profile page.
export default function MemberDetailSheet({ member, gatheringId, isOwner, canManage, isSelf, myRelationship, visibility, open, onOpenChange, onRelationshipChange, onRoleChange, onRemove }) {
  const navigate = useNavigate();
  if (!member) return null;
  const profileUrl = member.user_id ? `/profile/${member.user_id}?g=${gatheringId}` : null;
  const canChangeRole = canManage && !isSelf && !(member.role === 'owner' && !isOwner);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh] bg-background">
        <DrawerTitle className="sr-only">{member.full_name || 'Member'}</DrawerTitle>
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Header */}
          <div className="px-4 pt-3 pb-4 flex items-center gap-3">
            <MemberAvatar member={member} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-display text-lg font-bold text-foreground truncate">{member.full_name || 'Unnamed member'}</p>
                <RoleStamp role={member.role} size="xs" />
                {isSelf && <span className="tt-label text-foreground/40">You</span>}
              </div>
              {member.home_city && (
                <p className="inline-flex items-center gap-1 text-xs text-foreground/55 mt-0.5"><MapPin className="w-3 h-3" />{member.home_city}</p>
              )}
            </div>
          </div>

          {/* Gathering-scoped details (visibility-gated) */}
          <div className="px-4 pb-3 space-y-2 border-t border-foreground/8 pt-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="tt-label text-foreground/40 mb-0.5">Arrival</p>
                <p className="text-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3 text-terra-deep" />{member.arrival_date ? formatDate(member.arrival_date, { month: 'short', day: 'numeric' }) : '—'}</p>
              </div>
              <div>
                <p className="tt-label text-foreground/40 mb-0.5">Departure</p>
                <p className="text-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3 text-terra-deep" />{member.departure_date ? formatDate(member.departure_date, { month: 'short', day: 'numeric' }) : '—'}</p>
              </div>
            </div>
            {visibility === 'full' ? (
              <>
                {member.dietary_preferences?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {member.dietary_preferences.map((d) => (
                      <span key={d} className="px-1.5 py-0.5 rounded-full bg-foreground/5 text-[0.625rem] text-foreground/70 border border-foreground/10">{d}</span>
                    ))}
                  </div>
                )}
                {member.interests?.length > 0 && (
                  <p className="text-[0.625rem] text-foreground/60"><span className="tt-label text-foreground/40 mr-1.5">Interests</span>{member.interests.join(' · ')}</p>
                )}
                {member.contact_info && (
                  <p className="text-[0.625rem] text-foreground/70 flex items-center gap-1"><Phone className="w-3 h-3 text-terra-deep" />{member.contact_info}</p>
                )}
                {member.private_notes && (
                  <p className="text-[0.625rem] text-foreground/70 flex items-start gap-1"><StickyNote className="w-3 h-3 text-terra-deep mt-0.5" />{member.private_notes}</p>
                )}
              </>
            ) : (
              <p className="text-[0.625rem] text-foreground/45 italic">Limited — mark Close to see contact details &amp; notes.</p>
            )}
          </div>

          {/* Relationship (non-self) */}
          {!isSelf && (
            <div className="px-4 py-3 border-t border-foreground/8">
              <p className="tt-label text-foreground/50 mb-2">Your sharing level</p>
              <div className="inline-flex rounded-full bg-foreground/5 p-0.5 border border-foreground/10">
                {['casual', 'close'].map((rel) => (
                  <button key={rel} onClick={() => onRelationshipChange(rel)}
                    className={`px-4 py-1.5 min-h-[36px] rounded-full text-xs font-semibold capitalize transition-colors ${myRelationship === rel ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}>
                    {rel}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Role (managers) */}
          {canChangeRole && (
            <div className="px-4 py-3 border-t border-foreground/8">
              <p className="tt-label text-foreground/50 mb-2">Role</p>
              <Select value={member.role} onValueChange={(r) => onRoleChange(r)}>
                <SelectTrigger className="h-10 bg-foreground/5 border-foreground/15 text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* View profile + Remove */}
          <div className="px-4 py-3 border-t border-foreground/8 space-y-2">
            {profileUrl && (
              <Button variant="secondary" className="w-full" onClick={() => { onOpenChange(false); navigate(profileUrl); }}>
                <User /> View full profile
              </Button>
            )}
            {canChangeRole && (
              <Button variant="destructive" className="w-full" onClick={() => { onOpenChange(false); onRemove(); }}>
                <Trash2 /> Remove from gathering
              </Button>
            )}
          </div>
          <div className="h-3 tt-safe-bottom" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}