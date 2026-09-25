import React, { useState } from 'react';
import { MapPin, X } from 'lucide-react';
import PlaceAutocomplete from '@/components/journey/PlaceAutocomplete';

// Multi-destination picker for gatherings. Reuses the same Google Places
// autocomplete the journey form uses (searchPlaces + resolvePlace), so each
// picked entry is a real place with place_id / lat / lng — not free text.
// `places` is an array of { place_id, name, address, lat, lng } (legacy
// string-only entries are tolerated as { name }).
export default function DestinationPicker({ places, onChange, placeholder }) {
  const [text, setText] = useState('');

  function add(place) {
    if (!place) return;
    onChange([
      ...(places || []),
      { place_id: place.place_id, name: place.name, address: place.address, lat: place.lat, lng: place.lng },
    ]);
    setText('');
  }

  function remove(i) {
    onChange((places || []).filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {(places || []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(places || []).map((p, i) => (
            <span
              key={(p.place_id || p.name) + i}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full bg-terra/10 border border-terra/25 text-ink-deep text-xs font-medium"
            >
              <MapPin className="w-3.5 h-3.5 text-terra-deep" />
              {p.name}
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-0.5 w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-terra/15 text-ink-deep/60 hover:text-ink-deep"
                aria-label={`Remove ${p.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <PlaceAutocomplete
        value={text}
        onText={setText}
        onSelect={add}
        placeholder={placeholder || 'Search a destination on Google Maps'}
        className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
      />
    </div>
  );
}