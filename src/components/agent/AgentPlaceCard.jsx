import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ChevronRight, Plus, MapPin, UtensilsCrossed, Compass, Sparkles } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { useAgentPlacePhoto } from '@/lib/useAgentPlacePhoto';
import { useI18n } from '@/lib/i18n';

// Per-category medallion (icon + color), matching the Journey card's
// type-medallion treatment. The medallion lives in the left rail column.
const CAT_META = {
  Today: { icon: Sparkles, color: '#E05A47' },
  Eat: { icon: UtensilsCrossed, color: '#F59E0B' },
  Do: { icon: Compass, color: '#10B981' },
};
const DEFAULT_META = { icon: MapPin, color: '#64748B' };

// AI place-suggestion card — visual twin of the Journey card: the SAME left
// rail column (type medallion + rating block + route-number marker), same width,
// spacing, alignment and tokens as JourneyCard so the two pages read as one
// product. The route-number marker appears only when the map is ON (passed by
// the page) and matches that suggestion's pin on the map — both derive from the
// shared suggestionRouteNumbers source, so they can never drift. The marker
// carries a fully opaque page-surface background (bg-background) so a timeline
// rail line never shows through it, in both light and dark themes.
//
// The rest of the card — name, photo, summary, category chip, detail link, and
// the Add-to-journey action — is unchanged; this is about adding the rail, not
// redesigning the card. The rating moved from the card body into the rail
// (two compact lines), so it no longer duplicates in the meta line.
export default function AgentPlaceCard({ place, categoryLabel, gatheringId, onAdd, to, showImages = true, routeNumber }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const photo = useAgentPlacePhoto(place);
  const onCover = showImages ? !!photo : false;
  const { icon: Icon, color } = CAT_META[categoryLabel] || DEFAULT_META;

  const mainText = onCover ? 'text-white' : 'text-ink-deep';
  const subText = onCover ? 'text-white/85' : 'text-ink-deep/55';
  const metaText = onCover ? 'text-white/80' : 'text-ink-deep/50';
  const dividerClass = onCover ? 'border-white/20' : 'border-ink-charcoal/10';
  const chipBase = onCover ? 'bg-white/20 text-white' : 'bg-terra/12 text-terra-deep';

  const open = () => { if (to) navigate(to, { state: { place, categoryLabel } }); };

  return (
    <div
      className="flex gap-2 items-stretch cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
    >
      {/* Left rail column — identical pattern to JourneyCard: w-12, medallion
          + a two-line rating block + the route-number marker. Opaque
          page-surface backgrounds (bg-background) so nothing shows through. */}
      <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center relative z-10 ring-2 ring-background shadow-sm"
          style={{ backgroundColor: color }}
        >
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        {place.rating != null && (
          <div className="mt-1.5 text-center leading-tight bg-background px-1.5 rounded relative z-10">
            <p className="text-xs font-bold text-foreground whitespace-nowrap inline-flex items-center gap-0.5 justify-center">
              <Star className="w-2.5 h-2.5 fill-current" />{place.rating.toFixed(1)}
            </p>
            {place.reviews != null && (
              <p className="text-[0.625rem] text-foreground/45 mt-0.5">{place.reviews}</p>
            )}
          </div>
        )}
        {routeNumber != null && (
          <span className="mt-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full border border-terra/35 bg-background text-terra-deep text-[0.625rem] font-bold relative z-10">
            {routeNumber}
          </span>
        )}
      </div>

      {/* Card body — unchanged surface/typography/content. Rating now lives
          in the rail, so the meta line keeps only the category chip + price. */}
      <div className={`flex-1 min-w-0 rounded-2xl overflow-hidden relative border ${onCover ? 'border-transparent' : 'border-ink-charcoal/15 bg-card'}`} style={!onCover ? { boxShadow: '0 10px 30px rgba(0,0,0,0.12)' } : undefined}>
        {onCover && (
          <>
            <Image src={photo} alt="" className="absolute inset-0 w-full h-full" fittingType="fill" />
            <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim/90 via-ink-scrim/60 to-ink-scrim/35" />
          </>
        )}
        <div className="relative p-3 flex flex-col">
          <ChevronRight className="absolute top-3 right-3 w-4 h-4 shrink-0" style={{ color: onCover ? 'rgba(255,255,255,0.75)' : undefined }} />

          {/* Meta: category chip + price level (rating lives in the rail now) */}
          <div className={`flex items-center gap-2 pr-5 ${metaText}`}>
            {categoryLabel && <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold uppercase tracking-wide ${chipBase}`}>{categoryLabel}</span>}
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
              <Plus /> {t('agentPlaceCard.addToJourney')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}