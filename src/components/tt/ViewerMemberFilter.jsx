import React from 'react';
import { Check } from 'lucide-react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { useI18n } from '@/lib/i18n';
import { eligibleRosterMembers } from '@/lib/gatheringHelpers';

// Viewer-only member filter: replaces the Mine/Group scope switcher with a
// horizontally scrolling row of member-avatar toggles. Each avatar is an
// on/off button (aria-pressed) with a 44px touch target. ON = ring + check
// badge; OFF = faded opacity (distinguished beyond color). The row is bounded
// (flex-1 min-w-0 overflow-x-auto) so many members scroll horizontally
// without growing the page. State (off-ids) is managed by the parent and is
// in-memory only — no backend writes, no shared pref changes.
export default function ViewerMemberFilter({ members, offIds, onToggle }) {
  const { t } = useI18n();
  const eligible = eligibleRosterMembers(members);

  return (
    <div
      className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto overflow-y-hidden touch-pan-x tt-no-scrollbar"
      role="group"
      aria-label={t('journey.viewerFilterLabel')}
    >
      {eligible.map((m) => {
        const isOff = offIds.has(m.user_id);
        const name = m.full_name || t('memberRow.unnamedMember');
        return (
          <button
            key={m.user_id}
            type="button"
            onClick={() => onToggle(m.user_id)}
            aria-pressed={!isOff}
            aria-label={isOff
              ? t('journey.viewerFilterOff', { name })
              : t('journey.viewerFilterOn', { name })}
            title={name}
            className="shrink-0 relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-opacity"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <MemberAvatar member={m} size="sm" ring={!isOff} className={isOff ? 'opacity-40' : ''} />
            {!isOff && (
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-terra text-cream flex items-center justify-center border-2 border-background">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}