import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useGathering } from '@/lib/gatheringContext';
import { canAddJourney, canEditJourneyItem } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
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
  const { t } = useI18n();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Fresh add: default to the current signed-in user (they can uncheck).
  // Edit starts empty and is overwritten by the fetched record's attendees.
  const [attendeeIds, setAttendeeIds] = useState(() =>
    isEdit ? [] : (currentMember?.user_id ? [currentMember.user_id] : [])
  );
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
    setItem(null); setError(null); setAttendeeIds(isEdit ? [] : (currentMember?.user_id ? [currentMember.user_id] : [])); setManual(false); setResolving(false);
    setForm({ type: 'flight', title: '', start_datetime: '', end_datetime: '', location_from: '', location_to: '', from_place: null, to_place: null, confirmation_number: '', booking_reference: '', airline: '', notes: '', attachments: [] });
    if (!isEdit) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await base44.entities.JourneyItem.get(itemId);
        if (!alive) return;
        // Guard: the routed item must belong to THIS gathering and be a flight.
        if (data.gathering_id !== gatheringId) { setError(new Error(t('journeyForm.differentGathering'))); return; }
        if (data.type !== 'flight') { setError(new Error(t('journeyForm.notAFlight'))); return; }
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
        toast({ title: t('journeyForm.pickFlight'), description: t('journeyForm.pickFlightDesc'), variant: 'destructive' });
        return;
      }
      if (manual) {
        const missing = [];
        if (!form.title.trim()) missing.push(t('journeyForm.missingTitle'));
        if (!form.start_datetime) missing.push(t('journeyForm.missingDeparture'));
        if (!form.location_from.trim()) missing.push(t('journeyForm.missingOrigin'));
        if (!form.location_to.trim()) missing.push(t('journeyForm.missingDestination'));
        if (missing.length) {
          toast({ title: t('journeyForm.addMissing'), description: t('journeyForm.pleaseAdd', { items: missing.join(', ') }), variant: 'destructive' });
          return;
        }
      }
    }
    setSaving(true);
    try {
      const payload = buildJourneyPayload({ form, attendeeIds, startTz, endTz, meta: TYPE_META_FLIGHT, currentMember, item, gatheringId });
      await submitJourneyItem({ isEdit, gatheringId, itemId, payload });
      toast({ title: isEdit ? t('journeyForm.flightUpdated') : t('journeyForm.flightAdded') });
      if (isEdit) navigate(`/gathering/${gatheringId}/journey/${itemId}`, { replace: true });
      else navigate(`/gathering/${gatheringId}/journey`, { replace: true });
    } catch (err) {
      toast({ title: t('journeyForm.couldNotSaveFlight'), description: err.message || t('common.error'), variant: 'destructive' });
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
          <p className="font-display text-2xl mb-2 text-ink-deep">{t('journeyForm.couldNotLoadFlight')}</p>
          <p className="text-ink-deep/60 mb-6 text-sm">{error.message || t('common.error')}</p>
          <Button onClick={back}>{t('journeyDetail.backToJourney')}</Button>
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
          <p className="font-display text-2xl mb-2 text-ink-deep">{t('common.notAllowed')}</p>
          <p className="text-ink-deep/60 mb-6 text-sm">{t('journeyForm.notAllowedFlight', { action: isEdit ? t('journeyForm.notAllowedFlightEdit') : t('journeyForm.notAllowedFlightAdd') })}</p>
          <Button onClick={back}>{t('journeyDetail.backToJourney')}</Button>
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
              <X /> {t('common.cancel')}
            </Button>
            <Button type="submit" form="flight-form" size="sm" disabled={saving || resolving || flightNeedsSelection} className="shrink-0">
              {saving ? <Loader2 className="animate-spin" /> : isEdit ? <Check /> : <Plus />}
              {isEdit ? t('common.saveChanges') : t('journeyForm.addFlight')}
            </Button>
          </>
        }
      />
      <div className="mt-5 space-y-4">
        <div className="tt-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Plane className="w-4 h-4 text-terra-deep" />
            <span className="tt-label text-ink-deep/50">{isEdit ? t('journeyForm.editFlight') : t('journeyForm.addFlight')}</span>
          </div>
          <p className="text-xs text-ink-deep/55">{t('journeyForm.flightIntro')}</p>
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
            <p className="text-xs text-terra-deep text-center">{t('journeyForm.searchPickOrManual')}</p>
          )}
        </form>
      </div>
    </div>
  );
}