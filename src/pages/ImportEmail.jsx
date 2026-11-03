import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { canAddJourney } from '@/lib/gatheringHelpers';
import InboxItemCard from '@/components/inbox/InboxItemCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, AlertTriangle, Sparkles, Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui/use-toast';
import DetailActionBar from '@/components/tt/DetailActionBar';

// Import booking content (uploaded file or pasted text) into this gathering.
//
// The content is split into EVERY booking it describes — a round trip is two
// flights, a package is a flight plus a hotel — and each segment is shown as a
// standard journey card with the FULL email attached. Adding a segment files it
// into this gathering; anything left unadded stays in the journey inbox, so it is
// never lost.
export default function ImportEmail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { gatheringId, role } = useGathering();
  const [text, setText] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [items, setItems] = useState([]);
  const [extractError, setExtractError] = useState('');
  const [busyId, setBusyId] = useState('');

  const canAdd = canAddJourney(role);
  const MAX_TEXT_CHARS = 20000;
  const MAX_UPLOAD_BYTES = 1024 * 1024;
  const SUPPORTED_EXTENSIONS = ['txt', 'eml', 'csv', 'ics', 'json', 'xml', 'html', 'htm'];

  function back() {
    navigate(`/gathering/${gatheringId}/journey`);
  }

  function resetResult() {
    setItems([]);
    setExtractError('');
  }

  async function handleFileSelect(file) {
    if (!file) return;
    resetResult();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setSourceFileName('');
      setText('');
      setExtractError(t('importEmail.unsupportedFile'));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setSourceFileName('');
      setText('');
      setExtractError(t('importEmail.fileTooLarge'));
      return;
    }
    try {
      const raw = await file.text();
      const normalized = raw.replace(/^\uFEFF/, '');
      if (!normalized.trim()) {
        setSourceFileName('');
        setText('');
        setExtractError(t('importEmail.fileEmpty'));
        return;
      }
      const cropped = normalized.slice(0, MAX_TEXT_CHARS);
      setSourceFileName(file.name);
      setText(cropped);
      if (normalized.length > MAX_TEXT_CHARS) {
        toast({ title: t('importEmail.fileTrimmed') });
      } else {
        toast({ title: t('importEmail.fileLoaded', { name: file.name }) });
      }
    } catch (e) {
      setSourceFileName('');
      setText('');
      setExtractError(e.message || t('importEmail.fileLoadFailed'));
    }
  }

  async function handleExtract() {
    if (!text.trim()) {
      setExtractError(t('importEmail.noText'));
      return;
    }
    setExtracting(true);
    resetResult();
    try {
      const res = await base44.functions.invoke('importReservationContent', {
        text,
        file_name: sourceFileName || '',
      });
      const data = res.data || res;
      if (!data?.items?.length) throw new Error(t('importEmail.extractFailed'));
      setItems(data.items);
    } catch (e) {
      setExtractError(e.message || t('importEmail.extractFailed'));
    } finally {
      setExtracting(false);
    }
  }

  async function addToGathering(item) {
    setBusyId(item.id);
    try {
      const res = await base44.functions.invoke('fileJourneyInboxItem', {
        item_id: item.id,
        gathering_id: gatheringId,
        action: 'file',
      });
      const data = res.data || res;
      setItems((cur) => cur.filter((it) => it.id !== item.id));
      toast({ title: data?.duplicate ? t('inbox.alreadyFiled') : t('importEmail.saved') });
    } catch (e) {
      toast({ title: t('inbox.fileFailed'), description: e.message, variant: 'destructive' });
    } finally {
      setBusyId('');
    }
  }

  async function dismiss(item) {
    setBusyId(item.id);
    try {
      await base44.functions.invoke('fileJourneyInboxItem', { item_id: item.id, action: 'dismiss' });
      setItems((cur) => cur.filter((it) => it.id !== item.id));
    } catch (e) {
      toast({ title: t('inbox.fileFailed'), description: e.message, variant: 'destructive' });
    } finally {
      setBusyId('');
    }
  }

  if (!canAdd) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="tt-card p-10 text-center max-w-md mx-auto">
          <p className="font-display text-2xl mb-2 text-ink-deep">{t('common.notAllowed')}</p>
          <p className="text-ink-deep/60 text-sm">{t('common.notAllowedBody')}</p>
        </div>
      </div>
    );
  }

  if (items.length > 0) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="mt-5 max-w-2xl">
          <h1 className="font-display text-2xl font-bold text-ink-deep mb-1">
            {t('importEmail.foundTitle', { count: items.length })}
          </h1>
          <p className="text-sm text-ink-deep/55 mb-5">{t('importEmail.foundBody')}</p>

          <div className="space-y-5">
            {items.map((item) => (
              <InboxItemCard
                key={item.id}
                item={{ ...item, missing: item.missing || [] }}
                busy={busyId === item.id}
                onFile={addToGathering}
                onDismiss={dismiss}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={back}>{t('importEmail.backToJourney')}</Button>
            <Link to="/inbox" className="text-sm font-semibold text-terra-deep underline-offset-4 hover:underline">
              {t('inbox.open')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DetailActionBar onBack={back} />
      <div className="mt-5 max-w-2xl">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-6 h-6 text-terra-deep" />
          <h1 className="font-display text-2xl font-bold text-ink-deep">{t('importEmail.title')}</h1>
        </div>
        <p className="text-sm text-ink-deep/60 mb-5">{t('importEmail.intro')}</p>

        <div className="tt-card p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-ink-deep">{t('importEmail.uploadLabel')}</Label>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-dashed border-ink-charcoal/30 text-xs text-ink-deep/70 cursor-pointer hover:bg-cream-pale">
              <Upload className="w-3.5 h-3.5" />
              {t('importEmail.upload')}
              <input
                type="file"
                className="hidden"
                accept=".txt,.eml,.csv,.ics,.json,.xml,.html,.htm,text/plain,text/csv,text/calendar,text/html,application/json,application/xml,text/xml,message/rfc822"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
            </label>
            <p className="text-xs text-ink-deep/55">{t('importEmail.uploadHint')}</p>
            {sourceFileName && (
              <p className="text-xs text-ink-deep/70">{t('importEmail.sourceFile', { name: sourceFileName })}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-email-text" className="text-ink-deep">{t('importEmail.pasteLabel')}</Label>
            <Textarea
              id="import-email-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('importEmail.pastePlaceholder')}
              rows={10}
              className="bg-cream-pale border-ink-charcoal/20 text-ink-deep resize-y"
            />
          </div>
          {extractError && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />{extractError}
            </p>
          )}
          <Button onClick={handleExtract} disabled={extracting} className="w-full sm:w-auto">
            {extracting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {extracting ? t('importEmail.extracting') : t('importEmail.extract')}
          </Button>
        </div>

        <div className="mt-4 tt-ink-panel p-3.5 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-ink-deep/40 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-deep">{t('importEmail.limitationTitle')}</p>
            <p className="text-xs text-ink-deep/60 mt-0.5 leading-relaxed">{t('importEmail.limitationBody')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}