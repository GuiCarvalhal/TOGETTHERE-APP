import React from 'react';
import PlaceAutocomplete from '@/components/journey/PlaceAutocomplete';
import { MapPin, X } from 'lucide-react';

// Google Places autocomplete for the profile's home address. Reuses the SAME
// searchPlaces + resolvePlace stack the journey form uses (server-side key,
// existing 300ms debounce / request-cancellation), so a selection is a REAL
// resolved place with coordinates — no new provider, key, or client-side
// burst. Free text is still allowed (legacy behavior): typing without picking
// keeps the text and clears the structured place, so saving is never blocked.
// The X clears both the text and the place.
//
// onChange(text, place) — place is { place_id, lat, lng, country } | null.
export default function HomePlaceField({ value, place, onChange, placeholder, className }) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <PlaceAutocomplete
          value={value}
          onText={(t) => onChange(t, null)}
          onSelect={(p) => {
            if (p) onChange(p.address || p.name, { place_id: p.place_id, lat: p.lat, lng: p.lng, country: p.country });
            else onChange(value, null);
          }}
          placeholder={placeholder || 'Search your home city on Google Maps'}
          className={`${className || ''} pr-9`}
        />
        {place && (
          <button
            type="button"
            onClick={() => onChange('', null)}
            aria-label="Clear home address"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-full text-ink-deep/45 hover:text-ink-deep hover:bg-foreground/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {place?.lat != null && (
        <p className="inline-flex items-center gap-1 text-[11px] text-ink-deep/45">
          <MapPin className="w-3 h-3 text-terra-deep" /> Resolved — tap it on your profile to open in Maps
        </p>
      )}
    </div>
  );
}