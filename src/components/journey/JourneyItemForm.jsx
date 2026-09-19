import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { Loader2, Upload, X, Paperclip } from 'lucide-react';

const TYPE_META = {
  flight: { fromTo: true, place: false },
  car: { fromTo: true, place: false },
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
        await base44.entities.JourneyItem.update(item.id, payload);
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="tt-card rounded-[1.5rem] p-0 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="font-display text-2xl font-bold text-ink-deep">{item ? 'Edit segment' : 'Add segment'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="px-6 pb-6 space-y-4">
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
            <Input value={form.confirmation_number} onChange={(e) => setForm({ ...form, confirmation_number: e.target.value })} placeholder="ABC123" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Attachments</Label>
            <div className="flex flex-wrap gap-2">
              {form.attachments.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-pale border border-ink-charcoal/15 text-xs text-ink-deep hover:bg-cream-warm">
                  <Paperclip className="w-3.5 h-3.5" /> File {i + 1}
                </a>
              ))}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-ink-charcoal/30 text-xs text-ink-deep/70 cursor-pointer hover:bg-cream-pale">
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
      </DialogContent>
    </Dialog>
  );
}