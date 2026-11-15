import React from 'react';
import StampArt from '@/components/passport/stamps/StampArt';
import AvatarStack from '@/components/tt/AvatarStack';
import { useStampStyle } from '@/lib/stampStyle';
import { useI18n } from '@/lib/i18n';

// One passport stamp. Visited stamps are inked in terracotta, bucket-list stamps
// are faded, and both use the approved art style (see StampStyleGallery). The tilt
// is derived from the country code, so a stamp never jumps between renders.
const ANGLES = [-4, 2, -2, 3, 0, -3, 4, -1];

function tilt(code) {
  let h = 0;
  for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return ANGLES[h % ANGLES.length];
}

export default function PassportStamp({ code, name, visited, date, trips = 0, companions = [] }) {
  const { t } = useI18n();
  const style = useStampStyle();
  const title = visited && trips ? t('passport.fromTrips', { count: trips }) : (visited ? t('passport.manual') : t('passport.wish'));
  const caption = visited ? (date || t('passport.stamped')) : t('passport.wish');

  return (
    <figure className="min-w-0" title={title}>
      {/* Only the stamp art is tilted — the companion row stays upright. */}
      <div
        className={visited ? 'text-terra-deep' : 'text-ink-deep/40 opacity-70'}
        style={{ transform: `rotate(${tilt(code)}deg)` }}
      >
        <StampArt code={code} name={name} caption={caption} style={style} />
      </div>
      {visited && companions.length > 0 ? (
        <figcaption className="mt-1.5 flex justify-center">
          <AvatarStack people={companions} max={3} size="xs" ringClass="ring-card" />
        </figcaption>
      ) : null}
    </figure>
  );
}