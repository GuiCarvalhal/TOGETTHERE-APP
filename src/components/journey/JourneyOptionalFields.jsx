import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AttachmentChip from '@/components/tt/AttachmentChip';
import ParticipantPicker from '@/components/journey/ParticipantPicker';
import { Loader2, Upload } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

// Shared notes / attachments / participant-picker block used by both the
// journey sheet form and the flight page, so the optional fields and the
// public-file upload path are written once. Attachments are uploaded to public
// storage (UploadPublicFile) and stored as URLs on the item, matching the
// existing journey form behavior.
export default function JourneyOptionalFields({ form, setForm, attendeeIds, toggleAttendee, members, currentMember }) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file) {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, attachments: [...f.attachments, file_url] }));
    } catch (e) {
      toast({ title: t('optionalFields.uploadFailed'), description: e.message || t('optionalFields.uploadFailedDesc'), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="space-y-2">
        <Label className="text-ink-deep">{t('optionalFields.notes')}</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
      </div>
      <div className="space-y-2">
        <Label className="text-ink-deep">{t('optionalFields.attachments')}</Label>
        <div className="flex flex-wrap gap-2">
          {form.attachments.map((url, i) => (
            <AttachmentChip key={url + i} url={url} onRemove={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, idx) => idx !== i) }))} />
          ))}
          <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-dashed border-ink-charcoal/30 text-xs text-ink-deep/70 cursor-pointer hover:bg-cream-pale">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {t('optionalFields.upload')}
            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-ink-deep">{t('optionalFields.whoJoining')}</Label>
        <ParticipantPicker members={members} selected={attendeeIds} onToggle={toggleAttendee} currentUserId={currentMember?.user_id} />
        <p className="text-xs text-ink-deep/50">{t('optionalFields.whoJoiningNote')}</p>
      </div>
    </>
  );
}