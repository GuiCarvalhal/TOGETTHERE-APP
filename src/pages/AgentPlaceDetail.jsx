import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useGathering } from '@/lib/gatheringContext';
import { canAddJourney } from '@/lib/gatheringHelpers';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import StickyBar from '@/components/tt/StickyBar';
import Skeleton from '@/components/tt/Skeleton';
import SegmentMap from '@/components/journey/SegmentMap';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import { useAgentPlacePhoto } from '@/lib/useAgentPlacePhoto';
import { ArrowLeft, Plus, Check, Star, MapPin, Clock, Phone, Globe } from 'lucide-react';

// Google Places price-level enum -> display label.
const PRICE_LABELS = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

// Full detail page for an AI-suggested place, mirroring the journey item detail
// page: same StickyBar action shell (Back + primary action), same tt-card
// section rhythm, same SegmentMap + getMapsConfig map. The place travels via
// router state (agent places are transient — not stored records); richer
// details (coords, hours, phone, website, price level) are fetched through the
// existing Places backend path (getPlaceInfo) in one server-side call. "Add to
// journey" reuses the existing JourneyItemForm + creation path, prefilled with
// the place's name/address/coords, and is idempotent: if the place is already
// in the journey, the action opens that item instead of creating a duplicate.
export default function AgentPlaceDetail() {
  const { id: gatheringId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { role, currentMember, members } = useGathering();
  const place = location.state?.place || null;
  const categoryLabel = location.state?.categoryLabel || '';
  const photo = useAgentPlacePhoto(place);

  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [existing, setExisting] = useState(null);
  const [checking, setChecking] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const canAdd = canAddJourney(role);

  // Fetch richer place details (coords, hours, phone, website, price level) via
  // the existing Places backend path — one server-side call, no client-side
  // provider bursts. Falls back to the state place on failure.
  useEffect(() => {
    if (!place) return;
    let active = true;
    (async () => {
      try {
        const query = place.address ? `${place.name}, ${place.address}` : place.name;
        const res = await base44.functions.invoke('getPlaceInfo', { query });
        if (active) setDetails(res.data || res);
      } catch {
        /* ignore — fall back to state place */
      } finally {
        if (active) setLoadingDetails(false);
      }
    })();
    return () => { active = false; };
  }, [place?.name, place?.address]);

  // "Already in journey" check — match by location_name or title against the
  // place name so Add is idempotent (no duplicate items).
  useEffect(() => {
    if (!place?.name) return;
    let active = true;
    (async () => {
      try {
        const items = await base44.entities.JourneyItem.filter({ gathering_id: gatheringId });
        if (!active) return;
        const target = place.name.trim().toLowerCase();
        const match = items.find((it) =>
          (it.location_name && it.location_name.trim().toLowerCase() === target) ||
          (it.title && it.title.trim().toLowerCase() === target)
        );
        if (active) setExisting(match || null);
      } catch {
        /* ignore — treat as not added */
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, [gatheringId, place?.name]);

  const back = () => navigate(-1);

  if (!place) {
    return (
      <div>
        <StickyBar>
          <Button variant="default" size="icon" onClick={back} aria-label="Back" className="shrink-0"><ArrowLeft /></Button>
        </StickyBar>
        <div className="mt-5 tt-card p-10 text-center max-w-md mx-auto">
          <MapPin className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">Place not found</p>
          <p className="text-ink-deep/60 text-sm">This suggestion may have expired. Go back and regenerate your brief.</p>
        </div>
      </div>
    );
  }

  // Merge state place (always present) with fetched details.
  const lat = details?.lat ?? null;
  const lng = details?.lng ?? null;
  const rating = details?.rating ?? place.rating ?? null;
  const reviews = details?.reviews ?? place.reviews ?? null;
  const address = details?.address || place.address || '';
  const summary = details?.summary || place.summary || '';
  const priceLevel = details?.priceLevel || null;
  const phone = details?.phone || '';
  const website = details?.website || '';
  const openingHours = details?.openingHours || null;
  const hasCoords = lat != null && lng != null;

  const handleAdd = () => {
    if (existing) { navigate(`/gathering/${gatheringId}/journey/${existing.id}`); return; }
    setFormOpen(true);
  };

  const initial = {
    type: 'activity',
    title: place.name,
    location_name: place.name,
    place: hasCoords ? { name: place.name, address, lat, lng } : null,
  };

  return (
    <div>
      {/* Sticky action bar — same StickyBar shell as the journey item detail. */}
      <StickyBar>
        <Button variant="default" size="icon" onClick={back} aria-label="Back to agent" className="shrink-0"><ArrowLeft /></Button>
        {canAdd && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="default" size="sm" onClick={handleAdd} disabled={checking} className="shrink-0">
              {existing ? <><Check /> Added to journey</> : <><Plus /> Add to journey</>}
            </Button>
          </div>
        )}
      </StickyBar>

      <div className="mt-5 space-y-4">
        {/* Hero photo */}
        <div className="tt-card overflow-hidden">
          {photo ? (
            <div className="relative h-52">
              <Image src={photo} alt={place.name} className="w-full h-full" fittingType="fill" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-scrim/80 via-ink-scrim/25 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                {categoryLabel && <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 text-white text-[0.625rem] font-semibold uppercase tracking-wide mb-1.5">{categoryLabel}</span>}
                <h1 className="font-display text-2xl font-bold text-white leading-tight tt-text-balance">{place.name}</h1>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {categoryLabel && <span className="tt-label text-terra-deep block mb-1">{categoryLabel}</span>}
              <h1 className="font-display text-2xl font-bold text-ink-deep leading-tight tt-text-balance">{place.name}</h1>
            </div>
          )}
        </div>

        {/* Quick facts: rating, price level, open-now */}
        {(rating != null || priceLevel || (openingHours && typeof openingHours.openNow === 'boolean')) && (
          <div className="tt-card p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              {rating != null && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-terra/10 border border-terra/25">
                  <Star className="w-3.5 h-3.5 text-terra-deep fill-terra/30" />
                  <span className="text-sm font-bold text-ink-deep">{rating.toFixed(1)}</span>
                  {reviews != null && <span className="text-[0.625rem] text-ink-deep/50">({reviews})</span>}
                </span>
              )}
              {priceLevel && (
                <span className="inline-flex items-center px-2.5 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-sm font-semibold text-ink-deep">{PRICE_LABELS[priceLevel] || priceLevel}</span>
              )}
              {openingHours && typeof openingHours.openNow === 'boolean' && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border ${openingHours.openNow ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-foreground/5 text-ink-deep/55 border-foreground/10'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${openingHours.openNow ? 'bg-emerald-500' : 'bg-ink-deep/30'}`} />
                  {openingHours.openNow ? 'Open now' : 'Closed'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Address */}
        {address && (
          <div className="tt-card p-4">
            <p className="tt-label text-ink-deep/40 mb-2">Address</p>
            <p className="flex items-start gap-2 text-sm text-ink-deep"><MapPin className="w-4 h-4 text-terra-coral shrink-0 mt-0.5" />{address}</p>
          </div>
        )}

        {/* Map — single marker on the place's coords, tappable to open Google Maps */}
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">Location</p>
          {loadingDetails ? (
            <Skeleton className="h-48 w-full rounded-xl" tone="cream" />
          ) : (
            <SegmentMap point={hasCoords ? { lat, lng } : null} query={place.name} />
          )}
        </div>

        {/* Opening hours */}
        {openingHours?.weekdayDescriptions?.length > 0 && (
          <div className="tt-card p-4">
            <p className="tt-label text-ink-deep/40 mb-2 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Opening hours</p>
            <div className="space-y-1 text-sm text-ink-deep/80">
              {openingHours.weekdayDescriptions.map((d, i) => <p key={i}>{d}</p>)}
            </div>
          </div>
        )}

        {/* Contact: phone + website */}
        {(phone || website) && (
          <div className="tt-card p-4">
            <p className="tt-label text-ink-deep/40 mb-2">Contact</p>
            <div className="space-y-2 text-sm">
              {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-ink-deep hover:text-terra-deep"><Phone className="w-4 h-4 text-terra-coral shrink-0" />{phone}</a>}
              {website && <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-ink-deep hover:text-terra-deep truncate"><Globe className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span></a>}
            </div>
          </div>
        )}

        {/* AI reason / editorial summary */}
        {summary && (
          <div className="tt-card p-4">
            <p className="tt-label text-ink-deep/40 mb-2">Why we picked it</p>
            <p className="text-sm text-ink-deep/80 leading-relaxed">{summary}</p>
          </div>
        )}
      </div>

      {formOpen && (
        <JourneyItemForm
          gatheringId={gatheringId}
          currentMember={currentMember}
          members={members}
          initial={initial}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); navigate(`/gathering/${gatheringId}/journey`, { replace: true }); }}
        />
      )}
    </div>
  );
}