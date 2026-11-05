import React from 'react';
import { Compass } from 'lucide-react';
import JourneyExtensionCard from '@/components/journey/JourneyExtensionCard';
import { useI18n } from '@/lib/i18n';

// Desktop right column (2/3) while the map is OFF: the extensions of EVERY
// visible segment at the same time, in the same chronological order as the
// timeline on the left. Selecting one card no longer swaps this panel — the
// left card is the primary source and this is its complement.
export default function JourneyExtensionsPanel({ items = [], gatheringId }) {
  const { t } = useI18n();

  if (items.length === 0) {
    return (
      <div className="tt-card p-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-terra/12 border border-terra/25 flex items-center justify-center mx-auto mb-3">
          <Compass className="w-6 h-6 text-terra-coral" />
        </div>
        <p className="font-display text-xl font-bold text-ink-deep">{t('journey.extEmptyTitle')}</p>
        <p className="text-sm text-ink-deep/60 mt-1.5 max-w-sm mx-auto">{t('journey.extEmptyBody')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-ink-deep/45 px-1">{t('journey.extPanelHint')}</p>
      {items.map((item) => (
        <JourneyExtensionCard key={item.id} item={item} gatheringId={gatheringId} />
      ))}
    </div>
  );
}