import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { DialogFooter } from '@/components/ui/dialog';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { isoToWallInput, isoToLocalInput, wallTimeToUtcIso, startLocation, endLocation, arrowFirst } from '@/lib/formatPlaceTime';
import { usePlaceTimezone } from '@/lib/usePlaceTimezone';
import PlaceAutocomplete from '@/components/journey/PlaceAutocomplete';
import AttachmentChip from '@/components/tt/AttachmentChip';
import ParticipantPicker from '@/components/journey/ParticipantPicker';
import FlightEditor from '@/components/journey/FlightEditor';
import { Loader2, Upload } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const TYPE_META = {
  flight: { fromTo: true, place: false },
  car: { fromTo: true, place: false },
  train: { fromTo: true, place: false },
  cruise: { fromTo: true, place: true },
  hotel: { fromTo: false, place: true },
  activity: { fromTo: false, place: true },
  other: { fromTo: false, place: true },
};

export default function JourneyItemForm({ gatheringId, gatheringStartDate, currentMember, members, item, initial, onClose, onSaved }) {
  // Participant selection (attendee_user_ids). For a new item the creator is
  // included by default; for an edit we preselect the existing list, or the
  // creator for legacy items with an empty attendee list.
  const [attendeeIds, setAttendeeIds] = useState(() => {
    const existing = item?.attendee_user_ids;
    if (existing && existing.length) return existing;
    const creator = item?.owner_id || currentMember?.user_id;
    return creator ? [creator] : [];
  });
  const [form, setForm] = useState({
    type: item?.type || initial?.type || 'activity',
    title: item?.title || initial?.title || '',
    start_datetime: item?.start_datetime ? isoToLocalInput(item.start_datetime) : (initial?.start_datetime || ''),
    end_datetime: item?.end_datetime ? isoToLocalInput(item.end_datetime) : (initial?.end_datetime || ''),
    location_from: item?.location_from || initial?.location_from || '',
    location_to: item?.location_to || initial?.location_to || '',
    location_name: item?.location_name || initial?.location_name || '',
    place: item?.place || null,
    from_place: item?.from_place || null,
    to_place: item?.to_place || null,
    confirmation_number: item?.confirmation_number || initial?.confirmation_number || '',
    booking_reference: item?.booking_reference || '',
    notes: item?.notes || initial?.notes || '',
    attachments: item?.attachments || initial?.attachments || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  async function uploadFile(file) {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, attachments: [...f.attachments, file_url] }));
    } catch (e) {
      toast({ title: 'Upload failed', description: e.message || 'Could not upload the file.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

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
    } else if (!form.title.trim()) {
      toast({ title: 'Add a title', description: 'Give the segment a title to save.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        gathering_id: gatheringId,
        owner_id: item?.owner_id || currentMember?.user_id,
        type: form.type,
        title: form.title.trim(),
        start_datetime: form.start_datetime ? wallTimeToUtcIso(form.start_datetime, startTz) : undefined,
        end_datetime: form.end_datetime ? wallTimeToUtcIso(form.end_datetime, endTz) : undefined,
        location_from: meta.fromTo ? form.location_from : undefined,
        location_to: meta.fromTo ? form.location_to : undefined,
        location_name: meta.place ? form.location_name : undefined,
        ...(meta.fromTo ? { from_place: form.from_place || null, to_place: form.to_place || null } : {}),
        ...(meta.place ? { place: form.place || null } : {}),
        confirmation_number: form.confirmation_number,
        booking_reference: form.booking_reference,
        notes: form.notes,
        attachments: form.attachments,
        attendee_user_ids: attendeeIds,
      };
      if (item) {
        await base44.functions.invoke('updateJourneyItem', { gathering_id: gatheringId, item_id: item.id, payload });
      } else {
        await base44.functions.invoke('createJourneyItem', { gathering_id: gatheringId, payload });
      }
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Could not save segment', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const optionalFields = (
    <>
      <div className="space-y-2">
        <Label className="text-ink-deep">Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
      </div>
      <div className="space-y-2">
        <Label className="text-ink-deep">Attachments</Label>
        <div className="flex flex-wrap gap-2">
          {form.attachments.map((url, i) => (
            <AttachmentChip key={url + i} url={url} onRemove={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, idx) => idx !== i) }))} />
          ))}
          <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-dashed border-ink-charcoal/30 text-xs text-ink-deep/70 cursor-pointer hover:bg-cream-pale">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload
            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-ink-deep">Who's joining</Label>
        <ParticipantPicker members={members} selected={attendeeIds} onToggle={toggleAttendee} currentUserId={currentMember?.user_id} />
        <p className="text-xs text-ink-deep/50">Only gathering members can be added. You're included by default.</p>
      </div>
    </>
  );

  return (
    <FormSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={item ? 'Edit segment' : 'Add segment'}>
      <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-ink-deep">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
              <SelectContent>
                {JOURNEY_TYPES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                <Label htmlFor="j-title" className="text-ink-deep">Title</Label>
                <Input id="j-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Flight to Naples" required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="j-start" className="text-ink-deep">Start</Label>
                  <Input id="j-start" type="datetime-local" value={form.start_datetime} onChange={(e) => { setStartTouched(true); setForm({ ...form, start_datetime: e.target.value }); }} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="j-end" className="text-ink-deep">End</Label>
                  <Input id="j-end" type="datetime-local" value={form.end_datetime} onChange={(e) => { setEndTouched(true); setForm({ ...form, end_datetime: e.target.value }); }} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
                </div>
              </div>
              {meta.fromTo && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-ink-deep">From</Label>
                    <PlaceAutocomplete
                      value={form.location_from}
                      onText={(v) => setForm((f) => ({ ...f, location_from: v, from_place: null }))}
                      onSelect={(p) => setForm((f) => ({ ...f, from_place: p }))}
                      placeholder="Pickup point"
                      className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-ink-deep">To</Label>
                    <PlaceAutocomplete
                      value={form.location_to}
                      onText={(v) => setForm((f) => ({ ...f, location_to: v, to_place: null }))}
                      onSelect={(p) => setForm((f) => ({ ...f, to_place: p }))}
                      placeholder="Destination"
                      className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                    />
                  </div>
                </div>
              )}
              {meta.place && (
                <div className="space-y-2">
                  <Label className="text-ink-deep">Location</Label>
                  <PlaceAutocomplete
                    value={form.location_name}
                    onText={(v) => setForm((f) => ({ ...f, location_name: v, place: null }))}
                    onSelect={(p) => setForm((f) => ({ ...f, place: p }))}
                    placeholder="Hotel Santa Caterina, Amalfi"
                    className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-ink-deep">Confirmation #</Label>
                <Input value={form.confirmation_number} onChange={(e) => setForm({ ...form, confirmation_number: e.target.value })} placeholder="ABC123" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
              </div>
              {optionalFields}
            </>
          )}

          {flightNeedsSelection && (
            <p className="text-xs text-terra-deep text-center">Search and pick a flight, or tap "Enter manually instead".</p>
          )}
          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-ink-deep/60 hover:text-ink-deep">Cancel</Button>
            <Button type="submit" disabled={saving || flightNeedsSelection} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {item ? 'Save changes' : 'Add segment'}
            </Button>
          </DialogFooter>
        </form>
    </FormSheet>
  );
}