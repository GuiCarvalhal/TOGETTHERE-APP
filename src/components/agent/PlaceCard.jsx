import React from 'react';
import { Star, MapPin, Plus, ExternalLink } from 'lucide-react';

// Compact place card: name, rating + reviews, short address, a Maps link, and a
// one-tap "Add to Journey" button (caller opens the journey form pre-filled).
export default function PlaceCard({ place, onAdd, addLabel = 'Add to Journey' }) {
  if (!place) return null;
  return (
    <div className="tt-card p-3.5 flex flex-col gap-2.5 min-w-0">
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-bold text-ink-deep leading-tight truncate">{place.name}</h3>
          {place.address && (
            <p className="text-[0.6875rem] text-ink-deep/55 mt-0.5 flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{place.address}</span>
            </p>
          )}
        </div>
        {place.rating != null && (
          <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-terra/10 border border-terra/25">
            <Star className="w-3 h-3 text-terra-deep fill-terra/30" />
            <span className="text-xs font-bold text-ink-deep">{place.rating.toFixed(1)}</span>
            {place.reviews != null && <span className="text-[0.625rem] text-ink-deep/50">({place.reviews})</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onAdd} className="inline-flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-full bg-terra text-cream text-xs font-semibold hover:bg-terra-deep">
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </button>
        {place.mapsUrl && (
          <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-full bg-cream-pale border border-ink-charcoal/15 text-ink-deep text-xs font-semibold hover:bg-cream-warm">
            <ExternalLink className="w-3.5 h-3.5" /> Maps
          </a>
        )}
      </div>
    </div>
  );
}