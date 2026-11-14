import React from 'react';
import { useI18n } from '@/lib/i18n';

// The passport cover: the user's name, who issued it, and the three counters that
// summarise the book (countries stamped, bucket list, trips that earned a stamp).
export default function PassportCover({ name, stats }) {
  const { t } = useI18n();
  const items = [
    { key: 'countries', label: t('passport.statCountries'), value: stats.countries },
    { key: 'bucket', label: t('passport.statBucket'), value: stats.bucket },
    { key: 'trips', label: t('passport.statTrips'), value: stats.trips },
  ];

  return (
    <div className="tt-card overflow-hidden">
      <div className="flex">
        <div className="w-1.5 sm:w-2 bg-terra shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0 p-4 sm:p-5">
          <p className="tt-label text-ink-deep/40">{t('passport.label')}</p>
          <p className="font-display text-xl font-bold text-ink-deep mt-1 truncate">{name}</p>
          <p className="text-[0.625rem] uppercase tracking-[0.18em] text-ink-deep/35 mt-1">
            {t('passport.issuedBy')}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-ink-charcoal/15">
            {items.map((item) => (
              <div key={item.key} className="min-w-0">
                <p className="font-display text-2xl font-bold text-ink-deep leading-none">{item.value}</p>
                <p className="tt-label text-ink-deep/45 mt-1.5 truncate">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}