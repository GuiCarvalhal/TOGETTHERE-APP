import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Star, MapPin, ExternalLink, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { useAgentPlacePhoto } from '@/lib/useAgentPlacePhoto';

// Placeholder detail page for an AI-suggested place. The place travels via
// router state (agent places are transient results — not stored records), so
// a direct URL with no state shows a graceful fallback. The full detail
// experience (add-to-journey, route, embedded map) is the next task; this
// shows the resolved place photo + core info and an Open-in-Google-Maps link.
export default function AgentPlaceDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const place = location.state?.place || null;
  const categoryLabel = location.state?.categoryLabel || '';
  const photo = useAgentPlacePhoto(place);

  if (!place) {
    return (
      <div className="tt-card p-10 text-center max-w-md mx-auto">
        <p className="font-display text-xl text-ink-deep mb-4">Place not found</p>
        <Button variant="secondary" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>
      </div>
      <div className="tt-card overflow-hidden">
        {photo && (
          <div className="relative h-44">
            <Image src={photo} alt="" className="w-full h-full" fittingType="fill" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-scrim/70 via-ink-scrim/20 to-transparent" />
          </div>
        )}
        <div className="p-4">
          {categoryLabel && <span className="tt-label text-terra-deep">{categoryLabel}</span>}
          <h1 className="font-display text-2xl font-bold text-ink-deep mt-1">{place.name}</h1>
          {place.rating != null && (
            <p className="flex items-center gap-1.5 text-sm text-ink-deep/70 mt-1.5">
              <Star className="w-4 h-4 fill-terra text-terra-deep" />
              <span className="font-semibold text-ink-deep">{place.rating.toFixed(1)}</span>
              {place.reviews != null && <span className="text-ink-deep/50">({place.reviews} reviews)</span>}
            </p>
          )}
          {place.address && (
            <p className="flex items-center gap-1.5 text-sm text-ink-deep/60 mt-1.5"><MapPin className="w-4 h-4 shrink-0" />{place.address}</p>
          )}
          {place.summary && <p className="text-sm text-ink-deep/75 mt-3 leading-relaxed">{place.summary}</p>}
          {place.mapsUrl && (
            <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-4">
              <Button variant="secondary"><ExternalLink /> Open in Google Maps</Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}