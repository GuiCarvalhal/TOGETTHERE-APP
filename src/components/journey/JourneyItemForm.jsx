import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DialogFooter } from '@/components/ui/dialog';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import { isoToWallInput, isoToLocalInput, startLocation, endLocation, arrowFirst } from '@/lib/formatPlaceTime';
import { usePlaceTimezone } from '@/lib/usePlaceTimezone';
import PlaceAutocomplete from '@/components/journey/PlaceAutocomplete';
import JourneyOptionalFields from '@/components/journey/JourneyOptionalFields';
import FlightEditor from '@/components/journey/FlightEditor';
import { buildJourneyPayload, submitJourneyItem } from '@/lib/journeyItemSave';
import DetailActionBar from '@/components/tt/DetailActionBar';
import { Loader2, X, Plus, Check } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const TYPE_META = {
  flight: { fromTo: true, place: false },
  car: { fromTo: true, place: false },
  train: { fromTo: true, place: false },
  cruise: { fromTo: true, place: true },
  hotel: { fromTo: false, place: true },
  activity: { fromTo: false, place: true },
  main_event: { fromTo: false, place: true },
  other: { fromTo: false, place: true },
};

export default function JourneyItemForm({ gatheringId, gatheringStartDate, currentMember, members, item, initial, inline, onClose, onSaved }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  // Participant selection (attendee_user_ids). Fresh add: default to the
  // current signed-in user (they can uncheck themselves). Edit: preserve the
  // existing explicit attendee list — even an empty legacy list stays empty
  // (no self-defaulting on edit). owner_id / owner_user_id / ACL / role are
  // never changed by attendee toggling.
  const [attendeeIds, setAttendeeIds] = useState(() => {
    if (item) {
      return Array.isArray(item.attendee_user_ids) ? item.attendee_user_ids : [];
    }
    return currentMember?.user_id ? [currentMember.user_id] : [];
  });
  const [form, setForm] = useState({
    type: item?.type || initial?.type || 'activity',
    title: item?.title || initial?.title || '',
    start_datetime: item?.start_datetime ? isoToLocalInput(item.start_datetime) : (initial?.start_datetime || ''),
    end_datetime: item?.end_datetime ? isoToLocalInput(item.end_datetime) : (initial?.end_datetime || ''),
    location_from: item?.location_from || initial?.location_from || '',
    location_to: item?.location_to || initial?.location_to || '',
    location_name: item?.location_name || initial?.location_name || '',
    place: item?.place || initial?.place || null,
    from_place: item?.from_place || null,
    to_place: item?.to_place || null,
    confirmation_number: item?.confirmation_number || initial?.confirmation_number || '',
    booking_reference: item?.booking_reference || '',
    airline: item?.airline || '',
    notes: item?.notes || initial?.notes || '',
    attachments: item?.attachments || initial?.attachments || [],
  });
  const [saving, setSaving] = useState(false);
  // Flight editor mode is lifted to the parent so the submit handler can
  // validate it. A new flight starts in search; an existing flight opens on
  // its stored values — summary when it has full provider data, manual/
  // editable when it was entered manually (missing provider fields), so Edit
  // never forces a fresh lookup.
  const initialHasFlight = !!(item?.confirmation_number && item?.from_place && item?.to_place && item?.start_datetime);
  const [manual, setManual] = useState(item?.type === 'flight' ? !initialHasFlight : false);
  const isFlight = form.type === 'flight';
  const flightReady = !!(form.confirmation_number && form.from_place && form.to_place && form.start_datetime);
  const flightNeedsSelection = isFlight && !manual && !flightReady;

  // Place-timezone awareness: the datetime inputs show the destination-local
  // clock time and save back to UTC interpreted in that timezone — so a 4:45 PM
  // entered for a JFK departure is stored as the correct UTC instant, and a
  // saved time displayed back stays in the place's own wall clock.
  const origStart = useRef(item?.start_datetime || null);
  const origEnd = useRef(item?.end_datetime || null);
  const [startTouched, setStartTouched] = useState(false);
  const [endTouched, setEndTouched] = useState(false);
  const [debStartLoc, setDebStartLoc] = useState('');
  const [debEndLoc, setDebEndLoc] = useState('');
  // Prefer the place tz resolved at entry time (autocomplete / flight lookup);
  // only fall back to render-time geocoding for free text, geocoding the first
  // segment before an arrow so legacy "A → B" routes still resolve.
  const isRoute = ['flight', 'car', 'train', 'cruise'].includes(form.type);
  const storedStartTz = isRoute ? form.from_place?.tz : form.place?.tz;
  const storedEndTz = isRoute ? form.to_place?.tz : form.place?.tz;
  const startFallback = usePlaceTimezone(storedStartTz ? '' : arrowFirst(debStartLoc));
  const endFallback = usePlaceTimezone(storedEndTz ? '' : arrowFirst(debEndLoc));
  const startTz = storedStartTz || startFallback || null;
  const endTz = storedEndTz || endFallback || null;

  useEffect(() => {
    const id = setTimeout(() => setDebStartLoc(startLocation(form)), 400);
    return () => clearTimeout(id);
  }, [form.type, form.location_from, form.location_to, form.location_name]);
  useEffect(() => {
    const id = setTimeout(() => setDebEndLoc(endLocation(form)), 400);
    return () => clearTimeout(id);
  }, [form.type, form.location_from, form.location_to, form.location_name]);

  // Once the place tz resolves, re-derive the input from the original stored
  // instant in that tz — unless the user has already edited the field.
  useEffect(() => {
    if (!startTouched && origStart.current && startTz) {
      setForm((f) => ({ ...f, start_datetime: isoToWallInput(origStart.current, startTz) }));
    }
  }, [startTz, startTouched]);
  useEffect(() => {
    if (!endTouched && origEnd.current && endTz) {
      setForm((f) => ({ ...f, end_datetime: isoToWallInput(origEnd.current, endTz) }));
    }
  }, [endTz, endTouched]);

  const meta = TYPE_META[form.type] || TYPE_META.other;

  function toggleAttendee(uid) {
    setAttendeeIds((ids) => (ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid]));
  }

  // Flights live on the full-page flight surface, not this sheet. Selecting
  // "Flight" here redirects there (add vs edit) and closes the sheet; other
  // types stay in the sheet unchanged.
  function onTypeChange(v) {
    if (v === 'flight') {
      onClose();
      navigate(item ? `/gathering/${gatheringId}/journey/${item.id}/edit` : `/gathering/${gatheringId}/journey/new/flight`);
      return;
    }
    setForm({ ...form, type: v });
  }

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
    } else if (!form.title.trim()) {
      toast({ title: t('journeyForm.addTitle'), description: t('journeyForm.addTitleDesc'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = buildJourneyPayload({ form, attendeeIds, startTz, endTz, meta, currentMember, item, gatheringId });
      await submitJourneyItem({ isEdit: !!item, gatheringId, itemId: item?.id, payload });
      // Inform the user when a Main Event is created that the gathering now
      // works as an event group (not a trip). Only on create, not on edit of
      // an existing Main Event.
      if (form.type === 'main_event' && !item) {
        toast({ title: t('journeyForm.mainEventCreated'), description: t('journeyForm.mainEventInfo') });
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || t('common.error');
      toast({ title: t('journeyForm.couldNotSave'), description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const optionalFields = (
    <JourneyOptionalFields form={form} setForm={setForm} attendeeIds={attendeeIds} toggleAttendee={toggleAttendee} members={members} currentMember={currentMember} />
  );

  const formFields = (
    <>
      {!inline && (
        <div className="space-y-2">
          <Label className="text-ink-deep">{t('journeyForm.type')}</Label>
          <Select value={form.type} onValueChange={onTypeChange}>
            <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
            <SelectContent>
              {JOURNEY_TYPES.map((jt) => (
                <SelectItem key={jt.key} value={jt.key}>{t('journeyTypes.' + jt.key)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {form.type === 'flight' ? (
        <FlightEditor
          form={form}
          setForm={setForm}
          setStartTouched={setStartTouched}
          setEndTouched={setEndTouched}
          gatheringStartDate={gatheringStartDate}
          optionalFields={optionalFields}
          manual={manual}
          setManual={setManual}
        />
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="j-title" className="text-ink-deep">{t('journeyForm.title')}</Label>
            <Input id="j-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('journeyForm.titlePlaceholder')} required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="j-start" className="text-ink-deep">{t('journeyForm.start')}</Label>
              <Input id="j-start" type="datetime-local" value={form.start_datetime} onChange={(e) => { setStartTouched(true); setForm({ ...form, start_datetime: e.target.value }); }} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="j-end" className="text-ink-deep">{t('journeyForm.end')}</Label>
              <Input id="j-end" type="datetime-local" value={form.end_datetime} onChange={(e) => { setEndTouched(true); setForm({ ...form, end_datetime: e.target.value }); }} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
          </div>
          {meta.fromTo && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-ink-deep">{t('journeyForm.from')}</Label>
                <PlaceAutocomplete
                  value={form.location_from}
                  onText={(v) => setForm((f) => ({ ...f, location_from: v, from_place: null }))}
                  onSelect={(p) => setForm((f) => ({ ...f, from_place: p }))}
                  placeholder={t('journeyForm.fromPlaceholder')}
                  className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-ink-deep">{t('journeyForm.to')}</Label>
                <PlaceAutocomplete
                  value={form.location_to}
                  onText={(v) => setForm((f) => ({ ...f, location_to: v, to_place: null }))}
                  onSelect={(p) => setForm((f) => ({ ...f, to_place: p }))}
                  placeholder={t('journeyForm.toPlaceholder')}
                  className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                />
              </div>
            </div>
          )}
          {meta.place && (
            <div className="space-y-2">
              <Label className="text-ink-deep">{t('journeyForm.location')}</Label>
              <PlaceAutocomplete
                value={form.location_name}
                onText={(v) => setForm((f) => ({ ...f, location_name: v, place: null }))}
                onSelect={(p) => setForm((f) => ({ ...f, place: p }))}
                placeholder={t('journeyForm.locationPlaceholder')}
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-ink-deep">{t('journeyForm.confirmation')}</Label>
            <Input value={form.confirmation_number} onChange={(e) => setForm({ ...form, confirmation_number: e.target.value })} placeholder={t('journeyForm.confirmationPlaceholder')} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          {optionalFields}
        </>
      )}
      {flightNeedsSelection && (
        <p className="text-xs text-terra-deep text-center">{t('journeyForm.searchPickOrManual')}</p>
      )}
    </>
  );

  const submitLabel = item ? t('common.saveChanges') : t('journeyForm.addSegment');

  if (inline) {
    return (
      <div className="space-y-4">
        <DetailActionBar
          onBack={onClose}
          actions={
            <>
              <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving} className="shrink-0">
                <X /> {t('common.cancel')}
              </Button>
              <Button type="submit" form="journey-item-form" size="sm" disabled={saving || flightNeedsSelection} className="shrink-0">
                {saving ? <Loader2 className="animate-spin" /> : item ? <Check /> : <Plus />}
                {submitLabel}
              </Button>
            </>
          }
        />
        <div className="mt-5 space-y-4">
          <form id="journey-item-form" onSubmit={handleSave} className="space-y-4">
            {formFields}
          </form>
        </div>
      </div>
    );
  }

  return (
    <FormSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={item ? t('journeyForm.editSegment') : t('journeyForm.addSegment')}>
      <form onSubmit={handleSave} className="space-y-4">
        {formFields}
        <DialogFooter className="pt-2 gap-2">
          <Button type="button" variant="outline" onClick={onClose}><X /> {t('common.cancel')}</Button>
          <Button type="submit" disabled={saving || flightNeedsSelection}>
            {saving ? <Loader2 className="animate-spin" /> : item ? <Check /> : <Plus />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </FormSheet>
  );
}