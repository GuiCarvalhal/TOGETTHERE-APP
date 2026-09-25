import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import FamilyManager from '@/components/profile/FamilyManager';
import { MapPin, Globe, Sparkles, UtensilsCrossed, Users } from 'lucide-react';

// Read-only view of your own universal profile. Shown when the owner is not
// editing; the Edit/Save/Cancel actions live in the sticky ProfileActionBar.
// Family management stays available (it is a separate concern from profile
// fields), so FamilyManager is rendered here too — unchanged.
export default function OwnProfileView({ data, gatheringId, userId, onChanged }) {
  const { user, families } = data;
  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="tt-card p-5">
        <div className="flex items-center gap-4">
          <MemberAvatar member={{ photo: user?.photo, full_name: user?.full_name }} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-ink-deep truncate">{user?.full_name || 'You'}</h2>
            {user?.home_city && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-deep/55 mt-1"><MapPin className="w-3 h-3" />{user.home_city}</span>
            )}
          </div>
        </div>
      </div>

      {user?.bio && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-2">About</p>
          <p className="text-sm text-ink-deep/80 leading-relaxed whitespace-pre-wrap">{user.bio}</p>
        </div>
      )}
      {user?.interests?.length > 0 && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Interests &amp; preferences</p>
          <div className="flex flex-wrap gap-1.5">
            {user.interests.map((t) => (
              <span key={t} className="px-2.5 py-1 rounded-full bg-cream-pale text-xs text-ink-deep/75 border border-ink-charcoal/10">{t}</span>
            ))}
          </div>
        </div>
      )}
      {user?.dietary_preferences?.length > 0 && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-2 flex items-center gap-1.5"><UtensilsCrossed className="w-3.5 h-3.5" /> Dietary &amp; restrictions</p>
          <div className="flex flex-wrap gap-1.5">
            {user.dietary_preferences.map((t) => (
              <span key={t} className="px-2.5 py-1 rounded-full bg-cream-pale text-xs text-ink-deep/75 border border-ink-charcoal/10">{t}</span>
            ))}
          </div>
        </div>
      )}
      <div className="tt-card p-5 grid sm:grid-cols-2 gap-4">
        <div>
          <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Home currency</p>
          <p className="text-sm text-ink-deep">{user?.home_currency || '—'}</p>
        </div>
        {families?.length > 0 && (
          <div>
            <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Family</p>
            <p className="text-sm text-ink-deep">{families.map((f) => f.name).join(', ')}</p>
          </div>
        )}
      </div>

      {/* Family management stays available in view mode (unchanged behavior) */}
      <FamilyManager families={families || []} gatheringId={gatheringId} userId={userId} onChanged={onChanged} />
    </div>
  );
}