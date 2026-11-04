import React, { useRef, useState } from 'react';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui/use-toast';
import { AlertTriangle, Loader2, Sparkles, Upload, X } from 'lucide-react';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CHARS = 20000;
const TEXT_EXTS = ['txt', 'eml', 'csv', 'ics', 'json', 'xml', 'html', 'htm'];
// PDFs and screenshots are read by the backend (vision/OCR step) instead of
// being parsed in the browser.
const SCAN_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic'];
const ACCEPT = [...TEXT_EXTS, ...SCAN_EXTS].map((e) => '.' + e).join(',');

// The ONE import entry point of the app: a file (PDF, screenshot, email/text
// export) or pasted booking text. Everything lands in the journey inbox as a
// standard segment, so nothing is filed into a gathering by accident.
export default function InboxImportSheet({ open, onOpenChange, onImported }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setText('');
    setFile(null);
    setError('');
  }

  function pickFile(f) {
    setError('');
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!TEXT_EXTS.includes(ext) && !SCAN_EXTS.includes(ext)) {
      setFile(null);
      setError(t('inbox.importUnsupported'));
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setError(t('inbox.importFileTooLarge'));
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      let payload = null;
      if (file) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (TEXT_EXTS.includes(ext)) {
          const raw = (await file.text()).replace(/^\uFEFF/, '');
          if (!raw.trim()) throw new Error(t('inbox.importEmptyFile'));
          payload = { text: raw.slice(0, MAX_CHARS), file_name: file.name };
        } else {
          // Private upload + short-lived signed URL: the file is only readable
          // long enough for the extraction step.
          const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
          const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri });
          payload = { file_url: signed_url, file_name: file.name };
        }
      } else if (text.trim()) {
        payload = { text: text.slice(0, MAX_CHARS) };
      } else {
        throw new Error(t('inbox.importEmpty'));
      }

      const res = await base44.functions.invoke('importReservationContent', payload);
      const data = res.data || res;
      const created = (data?.items || []).length;
      toast({ title: t('inbox.imported'), description: t('inbox.importedCount', { count: created }) });
      reset();
      onOpenChange(false);
      onImported?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || t('inbox.importFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title={t('inbox.importTitle')}
    >
      <div className="space-y-4 pb-2">
        <p className="text-sm text-ink-deep/60">{t('inbox.importIntro')}</p>

        <div className="space-y-1.5">
          <Label className="text-ink-deep">{t('inbox.importFileLabel')}</Label>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {file ? (
            <div className="flex items-center gap-2 rounded-xl bg-cream-pale border border-ink-charcoal/20 px-3 py-2.5">
              <span className="text-sm text-ink-deep truncate flex-1">{file.name}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label={t('common.remove')}>
                <X />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="w-full">
              <Upload /> {t('inbox.importPickFile')}
            </Button>
          )}
          <p className="text-xs text-ink-deep/50">{t('inbox.importFileHint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inbox-import-text" className="text-ink-deep">{t('inbox.importPasteLabel')}</Label>
          <Textarea
            id="inbox-import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('inbox.importPastePlaceholder')}
            rows={6}
            disabled={!!file}
            className="bg-cream-pale border-ink-charcoal/20 text-ink-deep resize-y"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}
          </p>
        )}

        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy ? t('inbox.importing') : t('inbox.importAction')}
        </Button>
      </div>
    </FormSheet>
  );
}