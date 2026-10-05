import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Sparkles, UtensilsCrossed, ChevronRight } from 'lucide-react';

// A profile counts as complete only when the user has selected at least one
// activity/what-to-do preference (interests) AND one food preference
// (dietary_preferences). A display name or avatar alone is not enough — these
// two arrays are what the Agent concierge reads to tailor recommendations.
// Both fields are stored as arrays on the User entity; an actual non-empty
// selection is required (not merely a field that exists).
export function isProfileComplete(user) {
  const interests = Array.isArray(user?.interests) ? user.interests : [];
  const food = Array.isArray(user?.dietary_preferences) ? user.dietary_preferences : [];
  return interests.length > 0 && food.length > 0;
}

// Discreet, non-blocking banner shown to signed-in users whose profile is
// incomplete. It never blocks navigation — it's a quiet card with a direct
// link to the user's own profile. Once both preference sets are selected it
// stops rendering. Shown on the persistent signed-in landing (Home).
export default function ProfileCompleteReminder() {
  const { user } = useAuth();
  if (!user?.id || isProfileComplete(user)) return null;

  const interests = Array.isArray(user.interests) ? user.interests : [];
  const food = Array.isArray(user.dietary_preferences) ? user.dietary_preferences : [];
  const needInterests = interests.length === 0;
  const needFood = food.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2">
      <Link
        to="/account"
        className="tt-card block p-4 sm:p-5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-terra/12 border border-terra/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-terra-deep" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-ink-deep">Finish setting up your profile</p>
            <p className="text-xs text-ink-deep/60 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {needInterests && <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3" />Add your interests</span>}
              {needInterests && needFood && <span className="text-ink-deep/30">·</span>}
              {needFood && <span className="inline-flex items-center gap-1"><UtensilsCrossed className="w-3 h-3" />Add your cuisine preferences</span>}
              <span className="text-ink-deep/45">— it sharpens your Agent picks.</span>
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-ink-deep/35 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </Link>
    </div>
  );
}