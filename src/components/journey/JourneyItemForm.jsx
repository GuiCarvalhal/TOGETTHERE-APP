import React, { useState, useEffect } from 'react';
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
import AttachmentChip from '@/components/tt/AttachmentChip';
import { Loader2, Upload, Plane } from 'lucide-react';

const TYPE_META = {
  flight: { fromTo: true, place: false },
  car: { fromTo: true, place: false },
  train: { fromTo: true, place: false },
  cruise: { fromTo: true, place: true },
  hotel: { fromTo: false, place: true },
  activity: { fromTo: false, place: true },
  other: { fromTo: false, place: true },
};

export default function JourneyItemForm({ gatheringId, currentMember, item, onClose, onSaved }) {
  const [form, setForm] = useState({
    type: item?.type || 'activity',
    title: item?.title || '',
    start_datetime: item?.start_datetime ? item.start_datetime.slice(0, 16) : '',
    end_datetime: item?.end_datetime ? item.end_datetime.slice(0, 16) : '',
    location_from: item?.location_from || '',
    location_to: item?.location_to || '',
    location_name: item?.location_name || '',
    confirmation_number: item?.confirmation_number || '',
    notes: item?.notes || '',
    attachments: item?.attachments || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flightLoading, setFlightLoading] = useState(false);

  const meta = TYPE_META[form.type] || TYPE_META.other;

  async function uploadFile(file) {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, attachments: [...f.attachments, file_url] }));
    } catch (e) {
      alert(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function lookupFlight() {
    const fn = (form.confirmation_number || '').trim();
    if (!fn) { alert('Enter a flight number (e.g. AA123) in the Confirmation # field first'); return; }
    setFlightLoading(true);
    try {
      const date = form.start_datetime ? form.start_datetime.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const res = await base44.functions.invoke('searchFlights', { flight_number: fn, date });
      const data = res.data || res;
      const f = data.flight;
      if (!f) { alert(data.error || 'Flight not found'); return; }
      setForm((s) => ({
        ...s,
        title: s.title || `Flight ${f.number}${f.airline ? ' — ' + f.airline : ''}`,
        location_from: s.location_from || f.from,
        location_to: s.location_to || f.to,
      }));
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Flight lookup failed');
    } finally {
      setFlightLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        gathering_id: gatheringId,
        owner_id: item?.owner_id || currentMember?.user_id,
        type: form.type,
        title: form.title.trim(),
        start_datetime: form.start_datetime ? new Date(form.start_datetime).toISOString() : undefined,
        end_datetime: form.end_datetime ? new Date(form.end_datetime).toISOString() : undefined,
        location_from: meta.fromTo ? form.location_from : undefined,
        location_to: meta.fromTo ? form.location_to : undefined,
        location_name: meta.place ? form.location_name : undefined,
        confirmation_number: form.confirmation_number,
        notes: form.notes,
        attachments: form.attachments,
      };
      if (item) {
        await base44.functions.invoke('updateJourneyItem', { gathering_id: gatheringId, item_id: item.id, payload });
      } else {
        await base44.functions.invoke('createJourneyItem', { gathering_id: gatheringId, payload });
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message || 'Could not save segment');
    } finally {
      setSaving(false);
    }
  }

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
          <div className="space-y-2">
            <Label htmlFor="j-title" className="text-ink-deep">Title</Label>
            <Input id="j-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Flight to Naples" required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="j-start" className="text-ink-deep">Start</Label>
              <Input id="j-start" type="datetime-local" value={form.start_datetime} onChange={(e) => setForm({ ...form, start_datetime: e.target.value })} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="j-end" className="text-ink-deep">End</Label>
              <Input id="j-end" type="datetime-local" value={form.end_datetime} onChange={(e) => setForm({ ...form, end_datetime: e.target.value })} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
          </div>
          {meta.fromTo && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-ink-deep">From</Label>
                <Input value={form.location_from} onChange={(e) => setForm({ ...form, location_from: e.target.value })} placeholder="JFK" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
              </div>
              <div className="space-y-2">
                <Label className="text-ink-deep">To</Label>
                <Input value={form.location_to} onChange={(e) => setForm({ ...form, location_to: e.target.value })} placeholder="NAP" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
              </div>
            </div>
          )}
          {meta.place && (
            <div className="space-y-2">
              <Label className="text-ink-deep">Location</Label>
              <Input value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} placeholder="Hotel Santa Caterina, Amalfi" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-ink-deep">Confirmation #</Label>
            <div className="flex gap-2">
              <Input value={form.confirmation_number} onChange={(e) => setForm({ ...form, confirmation_number: e.target.value })} placeholder="ABC123" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
              {form.type === 'flight' && (
                <Button type="button" variant="outline" onClick={lookupFlight} className="shrink-0 border-ink-charcoal/25 text-ink-deep hover:bg-cream-pale">
                  {flightLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />}
                  <span className="hidden sm:inline">Lookup</span>
                </Button>
              )}
            </div>
            {form.type === 'flight' && <p className="text-xs text-ink-deep/50">Enter the flight number (e.g. AA123) and tap Lookup to auto-fill the route.</p>}
          </div>
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
          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-ink-deep/60 hover:text-ink-deep">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {item ? 'Save changes' : 'Add segment'}
            </Button>
          </DialogFooter>
        </form>
    </FormSheet>
  );
}