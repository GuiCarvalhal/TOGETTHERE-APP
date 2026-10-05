import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import AvatarStack from '@/components/tt/AvatarStack';
import GatheringMetaLine from '@/components/tt/GatheringMetaLine';
import { useI18n } from '@/lib/i18n';

// Home gathering card — image with a dark scrim and the info overlaid on top,
// matching the Journey card treatment so the experience is consistent. The
// scrim is always dark (ink-scrim), so white text reads in both light and dark
// themes. `dateLabel` (top-left) is the relative status ("In 3 days"); `role`
// (top-right) is the membership stamp. Both are plain text, unchanged.
//
// Below the gathering name is a SINGLE metadata line rendered by the shared
// GatheringMetaLine component — the SAME component used by the internal
// gathering header on Agent/Journey/Expenses/Members — so Home and the
// in-gathering header always show identical metadata:
//   - Main Event present: Star + "start date+time · full address" (no end/duration)
//   - No Main Event: "start – end · (N days)" with bold duration
// The Star lives in the metadata row, NOT next to the gathering name.
// See GatheringMetaLine for the full structure and truncation rules.
export default function GatheringCard({ gathering, dateLabel, meta, role, people, to }) {
  const { t } = useI18n();
  const g = gathering;
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
          <h3 className="font-display text-lg font-bold text-white leading-tight line-clamp-2 min-w-0">{g.name}</h3>
          <div className="text-xs text-white/85 mt-1.5">
            <GatheringMetaLine meta={meta} />
          </div>
          <div className="flex items-center mt-2.5">
            <AvatarStack people={people} max={4} size="xs" />
          </div>
        </div>
      </div>
    </Link>
  );
}