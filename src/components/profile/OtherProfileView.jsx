import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import GroupsInCommon from '@/components/profile/GroupsInCommon';
import ProfileChips from '@/components/profile/ProfileChips';
import { INTERESTS, CUISINE } from '@/lib/profileOptions';
import { MapPin, Globe, Lock, Users, UtensilsCrossed, Sparkles, Mail } from 'lucide-react';

// Read-only view of another user's UNIVERSAL profile. The page looks the same
// no matter which gathering the viewer came from: gathering-scoped facts (role,
// RSVP, per-gathering labels, the close/casual relationship toggle) are not
// shown here — they live on the Members page. The ?g= context is still used by
// getProfile for the existing visibility/masking rules, which are preserved
// exactly (full vs limited). No permission or masking logic is weakened.
//
// Sections are self-contained with headings so new person-level sections can be
// added later without a redesign.
export default function OtherProfileView({ data, gatheringId, userId, onChanged }) {
  const { user, visibility, groupsInCommon, families } = data;
  const full = visibility === 'full';

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="tt-card p-5">
        <div className="flex items-center gap-4">
          <MemberAvatar member={{ photo: user.photo, full_name: user.full_name }} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-ink-deep truncate">{user.full_name || 'Member'}</h2>
            {full && user.home_city && (
              user.home_place?.lat != null ? (
                <a href={`https://www.google.com/maps/search/?api=1&query=${user.home_place.lat},${user.home_place.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-ink-deep/55 mt-1 hover:text-terra transition-colors">
                  <MapPin className="w-3 h-3" />{user.home_city}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-ink-deep/55 mt-1"><MapPin className="w-3 h-3" />{user.home_city}</span>
              )
            )}
          </div>
        </div>
      </div>

      {full ? (
        <>
          {/* About */}
          {user.bio && (
            <div className="tt-card p-5">
              <p className="tt-label text-ink-deep/40 mb-2">About</p>
              <p className="text-sm text-ink-deep/80 leading-relaxed whitespace-pre-wrap">{user.bio}</p>
            </div>
          )}

          {/* Interests */}
          {user.interests?.length > 0 && (
            <div className="tt-card p-5">
              <p className="tt-label text-ink-deep/40 mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Interests</p>
              <ProfileChips values={user.interests} catalog={INTERESTS} />
            </div>
          )}

          {/* Cuisine preferences */}
          {user.dietary_preferences?.length > 0 && (
            <div className="tt-card p-5">
              <p className="tt-label text-ink-deep/40 mb-2 flex items-center gap-1.5"><UtensilsCrossed className="w-3.5 h-3.5" /> Cuisine preferences</p>
              <ProfileChips values={user.dietary_preferences} catalog={CUISINE} />
            </div>
          )}

          {/* Details — person-level facts, growable */}
          <div className="tt-card p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Home currency</p>
              <p className="text-sm text-ink-deep">{user.home_currency || '—'}</p>
            </div>
            {user.email && (
              <div className="min-w-0">
                <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</p>
                <p className="text-sm text-ink-deep truncate">{user.email}</p>
              </div>
            )}
            {families?.length > 0 && (
              <div>
                <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Family</p>
                <p className="text-sm text-ink-deep">{families.map((f) => f.name).join(', ')}</p>
              </div>
            )}
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
            You're seeing a limited profile. Full profiles are shared only between close connections.
          </p>
        </div>
      )}
    </div>
  );
}