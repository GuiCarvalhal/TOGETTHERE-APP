import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useGathering } from '@/lib/gatheringContext';
import { canAddJourney, canEditJourneyItem } from '@/lib/gatheringHelpers';
import { isoToWallInput, arrowFirst } from '@/lib/formatPlaceTime';
import { usePlaceTimezone } from '@/lib/usePlaceTimezone';
import FlightEditor from '@/components/journey/FlightEditor';
import JourneyOptionalFields from '@/components/journey/JourneyOptionalFields';
import DetailActionBar from '@/components/tt/DetailActionBar';
import { Button } from '@/components/ui/button';
import Skeleton from '@/components/tt/Skeleton';
import { buildJourneyPayload, submitJourneyItem } from '@/lib/journeyItemSave';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plane, Compass, Check, Plus, X } from 'lucide-react';

// Full-page shared flight add/edit surface, mounted at
//   /gathering/:id/journey/new        (add)
//   /gathering/:id/journey/:itemId/edit  (edit)
// inside the gathering shell. Reuses FlightEditor (search/summary/manual) and
// the shared JourneyOptionalFields + journeyItemSave helpers, so persistence is
// written once and identical to the sheet form. Because this is a real route
// (not an overlay), outside clicks never unmount the draft, and Back/Cancel are
// explicit. Add defaults to search; edit shows the existing flight with a
// "Search another flight" action exposing the same search modes + editable
// departure date, and preserves the original until a replacement is selected
// and explicitly saved. Save always updates the SAME item id on edit (never
// creates a duplicate) and preserves attendees / ACL / owner / attachments /
// PNR / notes unless explicitly edited.
const TYPE_META_FLIGHT = { fromTo: true, place: false };

export default function FlightPage() {
  const { itemId } = useParams();
  const isEdit = !!itemId;
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [attendeeIds, setAttendeeIds] = useState([]);
  const [form, setForm] = useState({
    type: 'flight',
    title: '',
    start_datetime: '',
    end_datetime: '',
    location_from: '',
    location_to: '',
    from_place: null,
    to_place: null,
    confirmation_number: '',
    booking_reference: '',
    airline: '',
    notes: '',
    attachments: [],
  });
  const [manual, setManual] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [startTouched, setStartTouched] = useState(false);
  const [endTouched, setEndTouched] = useState(false);

  // Direct route load for edit. The datetime inputs are seeded in the
  // departure's LOCAL timezone (from_place.tz) — not the viewer's — so the
  // search date derived from them is the origin-local date, and a saved time
  // round-trips in the place's own wall clock.
  useEffect(() => {
    // Reset all form/search state on every route param change so switching
    // between add/edit or different items never leaks the previous flight.
    setItem(null); setError(null); setAttendeeIds([]); setManual(false); setResolving(false);
    setForm({ type: 'flight', title: '', start_datetime: '', end_datetime: '', location_from: '', location_to: '', from_place: null, to_place: null, confirmation_number: '', booking_reference: '', airline: '', notes: '', attachments: [] });
    if (!isEdit) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await base44.entities.JourneyItem.get(itemId);
        if (!alive) return;
        // Guard: the routed item must belong to THIS gathering and be a flight.
        if (data.gathering_id !== gatheringId) { setError(new Error('This flight belongs to a different gathering.')); return; }
        if (data.type !== 'flight') { setError(new Error('This journey item is not a flight.')); return; }
        setItem(data);
        const sTz = data.from_place?.tz || null;
        const eTz = data.to_place?.tz || null;
        setForm({
          type: 'flight',
          title: data.title || '',
          start_datetime: data.start_datetime ? isoToWallInput(data.start_datetime, sTz) : '',
          end_datetime: data.end_datetime ? isoToWallInput(data.end_datetime, eTz) : '',
          location_from: data.location_from || '',
          location_to: data.location_to || '',
          from_place: data.from_place || null,
          to_place: data.to_place || null,
          confirmation_number: data.confirmation_number || '',
          booking_reference: data.booking_reference || '',
          airline: data.airline || '',
          notes: data.notes || '',
          attachments: data.attachments || [],
        });
        setAttendeeIds(Array.isArray(data.attendee_user_ids) ? data.attendee_user_ids : []);
        const hasFlight = !!(data.confirmation_number && data.from_place && data.to_place && data.start_datetime);
        setManual(!hasFlight);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [itemId, isEdit, gatheringId]);

  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  // Place timezones for save. Prefer the stored place tz (instant); only fall
  // back to render-time geocoding for legacy free-text origins. The hooks run
  // unconditionally (empty input short-circuits the fetch) so hook order is
  // stable across renders.
  const startFallback = usePlaceTimezone(form.location_from ? arrowFirst(form.location_from) : '');
  const endFallback = usePlaceTimezone(form.location_to ? arrowFirst(form.location_to) : '');
  const startTz = form.from_place?.tz || startFallback || null;
  const endTz = form.to_place?.tz || endFallback || null;

  const isFlight = form.type === 'flight';
  const flightReady = !!(form.confirmation_number && form.from_place && form.to_place && form.start_datetime);
  const flightNeedsSelection = isFlight && !manual && !flightReady;

  function toggleAttendee(uid) {
    setAttendeeIds((ids) => (ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid]));
  }

  const back = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(isEdit ? `/gathering/${gatheringId}/journey/${itemId}` : `/gathering/${gatheringId}/journey`);
  };

  async function handleSave(e) {
    e.preventDefault();
    if (isFlight) {
      if (!manual && !flightReady) {
        toast({ title: 'Pick a flight', description: 'Search and choose a flight, or tap "Enter manually instead".', variant: 'destructive' });
        return;
      }
      if (manual) {
        const missing = [];
        if (!form.title.trim()) missing.push('a title');
        if (!form.start_datetime) missing.push('a departure time');
        if (!form.location_from.trim()) missing.push('an origin');
        if (!form.location_to.trim()) missing.push('a destination');
        if (missing.length) {
          toast({ title: 'Add the missing details', description: `Please add ${missing.join(', ')}.`, variant: 'destructive' });
          return;
        }
      }
    }
    setSaving(true);
    try {
      const payload = buildJourneyPayload({ form, attendeeIds, startTz, endTz, meta: TYPE_META_FLIGHT, currentMember, item, gatheringId });
      await submitJourneyItem({ isEdit, gatheringId, itemId, payload });
      toast({ title: isEdit ? 'Flight updated' : 'Flight added' });
      if (isEdit) navigate(`/gathering/${gatheringId}/journey/${itemId}`, { replace: true });
      else navigate(`/gathering/${gatheringId}/journey`, { replace: true });
    } catch (err) {
      toast({ title: 'Could not save flight', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="tt-card p-4 space-y-3">
          <Skeleton className="h-5 w-40" tone="cream" />
          <Skeleton className="h-10 w-full" tone="cream" />
          <Skeleton className="h-10 w-full" tone="cream" />
          <Skeleton className="h-10 w-full" tone="cream" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="tt-card p-10 text-center max-w-md mx-auto">
          <Compass className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">Couldn't load this flight</p>
          <p className="text-ink-deep/60 mb-6 text-sm">{error.message || 'Something went wrong.'}</p>
          <Button onClick={back}>Back to journey</Button>
        </div>
      </div>
    );
  }

  const canAccess = isEdit ? canEditJourneyItem(role, item, currentMember) : canAddJourney(role);
  if (!canAccess) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="tt-card p-10 text-center max-w-md mx-auto">
          <p className="font-display text-2xl mb-2 text-ink-deep">Not allowed</p>
          <p className="text-ink-deep/60 mb-6 text-sm">You don't have permission to {isEdit ? 'edit' : 'add'} a flight here.</p>
          <Button onClick={back}>Back to journey</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DetailActionBar
        onBack={back}
        backDisabled={saving}
        actions={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={back} disabled={saving} className="shrink-0">
              <X /> Cancel
            </Button>
            <Button type="submit" form="flight-form" size="sm" disabled={saving || resolving || flightNeedsSelection} className="shrink-0">
              {saving ? <Loader2 className="animate-spin" /> : isEdit ? <Check /> : <Plus />}
              {isEdit ? 'Save changes' : 'Add flight'}
            </Button>
          </>
        }
      />
      <div className="mt-5 space-y-4">
        <div className="tt-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Plane className="w-4 h-4 text-terra-deep" />
            <span className="tt-label text-ink-deep/50">{isEdit ? 'Edit flight' : 'Add a flight'}</span>
          </div>
          <p className="text-xs text-ink-deep/55">Search by flight number or route, pick a result to fill the details, or enter them manually. Your draft stays put until you save.</p>
        </div>
        <form id="flight-form" onSubmit={handleSave} className="tt-card p-4 space-y-4">
          <FlightEditor
            form={form}
            setForm={setForm}
            setStartTouched={setStartTouched}
            setEndTouched={setEndTouched}
            gatheringStartDate={undefined}
            optionalFields={<JourneyOptionalFields form={form} setForm={setForm} attendeeIds={attendeeIds} toggleAttendee={toggleAttendee} members={members} currentMember={currentMember} />}
            manual={manual}
            setManual={setManual}
            onResolvingChange={setResolving}
          />
          {flightNeedsSelection && (
            <p className="text-xs text-terra-deep text-center">Search and pick a flight, or tap “Enter manually instead”.</p>
          )}
        </form>
      </div>
    </div>
  );
}