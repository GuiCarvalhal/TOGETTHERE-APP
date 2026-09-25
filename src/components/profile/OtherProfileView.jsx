import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import MemberAvatar from '@/components/tt/MemberAvatar';
import RoleStamp from '@/components/tt/RoleStamp';
import RelationshipToggle from '@/components/profile/RelationshipToggle';
import GroupsInCommon from '@/components/profile/GroupsInCommon';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Globe, CalendarDays, ShieldCheck, ShieldHalf, ShieldOff, Lock } from 'lucide-react';

const TRUST_META = {
  deep: { label: 'Deep trust', Icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  asymmetric: { label: 'Asymmetric', Icon: ShieldHalf, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
  none: { label: 'No close link', Icon: ShieldOff, tone: 'text-ink-deep/55 bg-cream-pale border-ink-charcoal/15' },
};

// Read-only view of another member's profile. Visibility is gated by the
// reciprocal trust model (deep / owner -> full; otherwise limited).
export default function OtherProfileView({ data, gatheringId, userId, onChanged }) {
  const { user, member, relationship, visibility, groupsInCommon } = data;
  const { toast } = useToast();
  const [setting, setSetting] = useState(false);
  const meta = TRUST_META[relationship.trust];
  const firstName = (user.full_name || 'them').split(' ')[0];

  async function onLevelChange(level) {
    setSetting(true);
    try {
      await base44.functions.invoke('setRelationship', { gathering_id: gatheringId, target_user_id: userId, level });
      onChanged();
    } catch (e) {
      toast({ title: e.response?.data?.error || e.message || 'Could not update', variant: 'destructive' });
    } finally {
      setSetting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="tt-card p-5">
        <div className="flex items-center gap-4">
          <MemberAvatar member={{ photo: user.photo, full_name: user.full_name }} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-ink-deep truncate">{user.full_name || 'Member'}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {member?.role && <RoleStamp role={member.role} size="xs" />}
              {visibility === 'full' && user.home_city && (
                <span className="inline-flex items-center gap-1 text-xs text-ink-deep/55"><MapPin className="w-3 h-3" />{user.home_city}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="tt-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="tt-label text-ink-deep/40">Sharing level</p>
          <span className={`tt-stamp border ${meta.tone}`}>
            <meta.Icon className="w-3 h-3" /> {meta.label}
          </span>
        </div>
        <p className="text-xs text-ink-deep/60 leading-relaxed">
          You marked them <strong className="capitalize">{relationship.myLevel}</strong> · They marked you <strong className="capitalize">{relationship.theirLevel}</strong>.
          {relationship.trust === 'deep' && ' You both see each other’s full profile.'}
          {relationship.trust === 'asymmetric' && ' One-sided — full profiles need both sides close.'}
          {relationship.trust === 'none' && ' Mark each other close to share full profiles.'}
        </p>
        <RelationshipToggle value={relationship.myLevel} onChange={onLevelChange} disabled={setting} />
      </div>

      {visibility === 'full' ? (
        <>
          {user.bio && (
            <div className="tt-card p-5">
              <p className="tt-label text-ink-deep/40 mb-2">About</p>
              <p className="text-sm text-ink-deep/80 leading-relaxed whitespace-pre-wrap">{user.bio}</p>
            </div>
          )}
          {user.interests?.length > 0 && (
            <div className="tt-card p-5">
              <p className="tt-label text-ink-deep/40 mb-2">Interests &amp; preferences</p>
              <div className="flex flex-wrap gap-1.5">
                {user.interests.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-full bg-cream-pale text-xs text-ink-deep/75 border border-ink-charcoal/10">{t}</span>
                ))}
              </div>
            </div>
          )}
          <div className="tt-card p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Home currency</p>
              <p className="text-sm text-ink-deep">{user.home_currency || '—'}</p>
            </div>
            <div>
              <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> In this trip</p>
              <p className="text-sm text-ink-deep">
                {member?.arrival_date || member?.departure_date
                  ? `${member.arrival_date || '—'} → ${member.departure_date || '—'}`
                  : 'Dates not set'}
              </p>
            </div>
          </div>
          <GroupsInCommon groups={groupsInCommon} />
        </>
      ) : (
        <div className="tt-card p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-cream-pale border border-ink-charcoal/15 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-ink-deep/40" />
          </div>
          <p className="font-display text-lg text-ink-deep mb-1">Limited profile</p>
          <p className="text-sm text-ink-deep/60 max-w-sm mx-auto">
            {relationship.myLevel === 'close'
              ? `You've marked ${firstName} close, but they haven't marked you close yet. Full profiles are shared only when both sides do.`
              : `Mark ${firstName} close — if they do too, you'll both see full profiles.`}
          </p>
        </div>
      )}
    </div>
  );
}