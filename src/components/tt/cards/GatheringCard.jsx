import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Image } from '@/components/ui/image';
import AvatarStack from '@/components/tt/AvatarStack';
import { useI18n } from '@/lib/i18n';

// Home gathering card — image with a dark scrim and the info overlaid on top,
// matching the Journey card treatment so the experience is consistent. The
// scrim is always dark (ink-scrim), so white text reads in both light and dark
// themes. `dateLabel` (top-left) is the relative status ("In 3 days"); `role`
// (top-right) is the membership stamp. Both are plain text, unchanged.
//
// Below the gathering name is a SINGLE metadata line (`metaLine`), derived by
// the caller (Home) via formatGatheringCardMeta:
//   - Main Event present: "Oct 12, 11:15 PM · 123 Main St" (start date+time +
//     address; no end date or duration). A Star indicator sits next to the
//     name with an accessible label/title "Main Event".
//   - No Main Event: "Oct 12 – Oct 19 · (8 days)" (derived range + inclusive
//     days; no address/location).
// The line truncates with an ellipsis on overflow; the full text is exposed
// via the title attribute for accessibility. No status pill — the
// relative-time label is plain text.
export default function GatheringCard({ gathering, dateLabel, metaLine, isMainEvent, role, people, to }) {
  const { t } = useI18n();
  const g = gathering;
  const mainEventLabel = t('journeyTypes.main_event');
  return (
    <Link
      to={to}
      className="group relative block rounded-2xl overflow-hidden h-[155px] border border-ink-charcoal/15 hover:-translate-y-1 transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
    >
      {g.cover_image ? (
        <Image src={g.cover_image} alt={g.name} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500" fittingType="fill" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim to-ink-soft flex items-center justify-center">
          <span className="font-display italic text-white/40 text-5xl">{g.name?.[0]}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim/90 via-ink-scrim/55 to-ink-scrim/25" />
      <div className="relative h-full p-4 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          {dateLabel && <span className="text-white/90 text-xs font-semibold">{dateLabel}</span>}
          {role && (
            <span className={`tt-stamp capitalize ${role === 'owner' ? 'bg-terra text-white border-terra' : 'bg-white/15 text-white border-white/25'}`}>
              {t('roles.' + role)}
            </span>
          )}
        </div>
        <div>
          <div className="flex items-start gap-1.5 min-w-0">
            {isMainEvent && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-terra text-white shrink-0 mt-0.5"
                title={mainEventLabel}
                aria-label={mainEventLabel}
                role="img"
              >
                <Star className="w-3 h-3" fill="currentColor" strokeWidth={1.5} />
              </span>
            )}
            <h3 className="font-display text-lg font-bold text-white leading-tight line-clamp-2 min-w-0">{g.name}</h3>
          </div>
          {metaLine && (
            <p className="text-xs text-white/85 mt-1.5 truncate min-w-0" title={metaLine}>{metaLine}</p>
          )}
          <div className="flex items-center mt-2.5">
            <AvatarStack people={people} max={4} size="xs" />
          </div>
        </div>
      </div>
    </Link>
  );
}