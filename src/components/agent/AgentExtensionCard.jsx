import React from 'react';
import { MapPin, Plus, Star, UtensilsCrossed, Compass, Sparkles } from 'lucide-react';
import SegmentMap from '@/components/journey/SegmentMap';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

const CAT_META = {
  Today: { icon: Sparkles, color: '#E05A47' },
  Eat: { icon: UtensilsCrossed, color: '#F59E0B' },
  Do: { icon: Compass, color: '#10B981' },
};
const DEFAULT_META = { icon: MapPin, color: '#64748B' };

// Desktop companion to an agent place card (map OFF). It sits in the SAME grid
// row as its card, so it fills the shared row height (h-full) and its top and
// bottom edges line up 1:1 with the card — the exact model used by the Journey
// page's extension card: mini map on the left, then the context the compact
// card has no room for (rating, address, editorial summary) with the
// add-to-journey action kept compact in the top-right corner.
export default function AgentExtensionCard({ place, categoryLabel, onAdd }) {
  const { t } = useI18n();
  const { icon: Icon, color } = CAT_META[categoryLabel] || DEFAULT_META;
  const query = place.address || place.name || '';

  return (
    <div className="tt-card p-2.5 h-full min-h-[10.5rem] flex gap-3 overflow-hidden">
      <div className="w-[34%] max-w-[220px] shrink-0 rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
        {query ? (
          <SegmentMap key={place.id || place.name} query={query} heightClass="h-full" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-2">
            <MapPin className="w-4 h-4 text-terra/40 mb-1" />
            <p className="text-[11px] text-ink-deep/45 leading-tight">{place.name}</p>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 flex items-start gap-2">
          <p className="flex-1 min-w-0 font-display text-sm font-bold text-ink-deep leading-tight truncate">{place.name}</p>
          <Button size="sm" className="h-7 px-2 text-[11px] shrink-0" onClick={() => onAdd && onAdd()}>
            <Plus className="w-3 h-3" />
            {t('agentPlaceCard.addToJourney')}
          </Button>
        </div>

        <div className="mt-1 min-h-0 flex-1 overflow-hidden space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold uppercase tracking-wide" style={{ background: `${color}15`, color }}>
              <Icon className="w-2.5 h-2.5" />
              {categoryLabel}
            </span>
            {place.price_level && <span className="text-[11px] font-semibold text-ink-deep/60">{place.price_level}</span>}
            {place.rating != null && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-deep/70">
                <Star className="w-3 h-3 fill-current text-terra" />
                {place.rating.toFixed(1)}
                {place.reviews != null && <span className="font-normal text-ink-deep/45">({place.reviews})</span>}
              </span>
            )}
          </div>

          {place.address && (
            <p className="inline-flex items-center gap-1 text-[11px] text-ink-deep/60 min-w-0 max-w-full">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{place.address}</span>
            </p>
          )}

          {place.summary && (
            <p className="text-[11px] text-ink-deep/70 leading-relaxed line-clamp-3 overflow-hidden">{place.summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}