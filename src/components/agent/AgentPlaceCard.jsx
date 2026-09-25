import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ChevronRight, Plus, MapPin } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { useAgentPlacePhoto } from '@/lib/useAgentPlacePhoto';

// AI place-suggestion card — visual twin of the Journey card body: same
// surface (rounded-2xl, hairline border, card bg, float shadow), typography
// scale, spacing rhythm, and cover-photo treatment (Image + ink scrim + white
// text when a place photo resolves via the existing Google Places pipeline;
// clean card otherwise). The chevron signals "tap to open detail". One compact
// "Add to journey" action preserves the existing add behavior; the whole card
// opens the detail route.
export default function AgentPlaceCard({ place, categoryLabel, gatheringId, onAdd, to }) {
  const navigate = useNavigate();
  const photo = useAgentPlacePhoto(place);
  const onCover = !!photo;

  const mainText = onCover ? 'text-white' : 'text-ink-deep';
  const subText = onCover ? 'text-white/85' : 'text-ink-deep/55';
  const metaText = onCover ? 'text-white/80' : 'text-ink-deep/50';
  const dividerClass = onCover ? 'border-white/20' : 'border-ink-charcoal/10';
  const chipBase = onCover ? 'bg-white/20 text-white' : 'bg-terra/12 text-terra-deep';

  const open = () => { if (to) navigate(to, { state: { place, categoryLabel } }); };

  return (
    <div
      className="cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
    >
      <div className={`rounded-2xl overflow-hidden relative border ${onCover ? 'border-transparent' : 'border-ink-charcoal/15 bg-card'}`} style={!onCover ? { boxShadow: '0 10px 30px rgba(0,0,0,0.12)' } : undefined}>
        {onCover && (
          <>
            <Image src={photo} alt="" className="absolute inset-0 w-full h-full" fittingType="fill" />
            <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim/90 via-ink-scrim/60 to-ink-scrim/35" />
          </>
        )}
        <div className="relative p-3 flex flex-col">
          <ChevronRight className="absolute top-3 right-3 w-4 h-4 shrink-0" style={{ color: onCover ? 'rgba(255,255,255,0.75)' : undefined }} />

          {/* Meta: category chip + rating + price level (when available) */}
          <div className={`flex items-center gap-2 pr-5 ${metaText}`}>
            {categoryLabel && <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold uppercase tracking-wide ${chipBase}`}>{categoryLabel}</span>}
            {place.rating != null && (
              <span className={`inline-flex items-center gap-1 text-[0.6875rem] font-semibold ${onCover ? 'text-white' : 'text-ink-deep'}`}>
                <Star className="w-3 h-3 fill-current" />{place.rating.toFixed(1)}
                {place.reviews != null && <span className={`font-normal ${metaText}`}>({place.reviews})</span>}
              </span>
            )}
            {place.price_level && <span className="text-[0.6875rem] font-semibold">{place.price_level}</span>}
          </div>

          {/* Title */}
          <h3 className={`font-display text-[0.95rem] font-bold leading-tight mt-0.5 line-clamp-2 pr-5 ${mainText}`}>{place.name}</h3>

          {/* Neighborhood / distance hint */}
          {place.address && (
            <p className={`inline-flex items-center gap-1 text-xs mt-1 truncate ${subText}`}>
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{place.address}</span>
            </p>
          )}

          {/* One-line reason / editorial summary */}
          {place.summary && (
            <p className={`text-xs mt-1 italic line-clamp-2 ${subText}`}>{place.summary}</p>
          )}

          {/* Single Add-to-journey action (preserves existing behavior) */}
          <div className={`flex items-center gap-2 mt-2 pt-2 border-t min-h-[2.5rem] ${dividerClass}`} onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={() => onAdd && onAdd()} className="shrink-0">
              <Plus /> Add to journey
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}