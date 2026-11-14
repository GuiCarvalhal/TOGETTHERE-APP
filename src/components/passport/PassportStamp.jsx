import React from 'react';
import { flagEmoji } from '@/lib/passport';
import { useI18n } from '@/lib/i18n';

// One passport stamp. Visited stamps are inked in terracotta with a double ring;
// bucket-list stamps are dashed and faded so the wall reads at a glance. The tilt
// is derived from the country code, so a stamp never jumps between renders.
const ANGLES = [-4, 2, -2, 3, 0, -3, 4, -1];

function tilt(code) {
  let h = 0;
  for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return ANGLES[h % ANGLES.length];
}

export default function PassportStamp({ code, name, visited, date, trips = 0 }) {
  const { t } = useI18n();
  const title = visited && trips ? t('passport.fromTrips', { count: trips }) : (visited ? t('passport.manual') : t('passport.wish'));

  return (
    <figure className="min-w-0" style={{ transform: `rotate(${tilt(code)}deg)` }} title={title}>
      <div
        className={`relative aspect-square w-full rounded-xl grid place-items-center px-1.5 text-center ${
          visited
            ? 'border-2 border-terra/45 bg-terra/[0.07] text-terra-deep'
            : 'border-2 border-dashed border-ink-deep/25 text-ink-deep/45'
        }`}
      >
        {visited ? <span className="absolute inset-1 rounded-lg border border-terra/25" aria-hidden="true" /> : null}
        <div className="relative min-w-0">
          <span className="block text-xl leading-none">{flagEmoji(code)}</span>
          <span className="mt-1.5 block text-[0.625rem] font-bold uppercase tracking-[0.05em] leading-[1.15] break-words">
            {name}
          </span>
          <span className="mt-1 block text-[0.5625rem] font-semibold uppercase tracking-[0.1em] opacity-70">
            {visited ? (date || t('passport.stamped')) : t('passport.wish')}
          </span>
        </div>
      </div>
    </figure>
  );
}