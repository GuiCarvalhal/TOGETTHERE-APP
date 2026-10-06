import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { canAddJourney } from '@/lib/gatheringHelpers';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Mail, AlertTriangle, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui/use-toast';
import DetailActionBar from '@/components/tt/DetailActionBar';

// Import a journey segment from a forwarded booking email — without connecting
// any inbox. The user pastes the email content; we extract a draft with the
// built-in LLM (extractJourneyFromEmail) and show it as a prefilled, editable
// JourneyItemForm for review. Nothing is created, sent, or persisted until the
// user confirms the draft. A duplicate check (by confirmation number) warns
// before saving so a segment is never silently duplicated.
export default function ImportEmail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { gatheringId, gathering, members, currentMember, role } = useGathering();
  const [text, setText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [extractError, setExtractError] = useState('');
  const [duplicate, setDuplicate] = useState(null);

  const canAdd = canAddJourney(role);

  function back() {
    navigate(`/gathering/${gatheringId}/journey`);
  }

  async function handleExtract() {
    if (!text.trim()) {
      setExtractError(t('importEmail.noText'));
      return;
    }
    setExtracting(true);
    setExtractError('');
    setDraft(null);
    setDuplicate(null);
    try {
      const res = await base44.functions.invoke('extractJourneyFromEmail', { text });
      const d = (res.data || res).draft;
      if (!d) throw new Error('No draft');
      setDraft(d);
    } catch (e) {
      setExtractError(e.message || t('importEmail.extractFailed'));
    } finally {
      setExtracting(false);
    }
  }

  // Duplicate review: when the draft has a confirmation number, look for an
  // existing segment with the same number in this gathering. Read-only — it
  // never creates or changes anything. Warns the user; they decide whether to
  // keep saving. (Non-flight segments without a confirmation number are not
  // checked — the user reviews the draft manually.)
  useEffect(() => {
    let active = true;
    const code = draft?.confirmation_number?.trim();
    if (!draft || !code) { setDuplicate(null); return; }
    (async () => {
      try {
        const data = await base44.entities.JourneyItem.filter({
          gathering_id: gatheringId, confirmation_number: code,
        });
        if (active) setDuplicate(data && data.length > 0 ? code : null);
      } catch {
        if (active) setDuplicate(null);
      }
    })();
    return () => { active = false; };
  }, [draft, gatheringId]);

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

  if (draft) {
    const isFlight = draft.type === 'flight';
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={() => { setDraft(null); setDuplicate(null); }} />
        <div className="mt-5">
          <h1 className="font-display text-2xl font-bold text-ink-deep mb-1">{t('importEmail.reviewTitle')}</h1>
          <p className="text-sm text-ink-deep/55 mb-4">{t('importEmail.reviewBody')}</p>
          {duplicate && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl border border-terra/25 bg-terra/8">
              <AlertTriangle className="w-4 h-4 text-terra-deep mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-deep">{t('importEmail.duplicateWarning', { code: duplicate })}</p>
                <p className="text-xs text-ink-deep/60 mt-0.5">{t('importEmail.duplicateHint')}</p>
              </div>
            </div>
          )}
          {isFlight && (
            <p className="mb-3 text-xs text-ink-deep/55 italic">{t('importEmail.flightManualHint')}</p>
          )}
          <JourneyItemForm
            gatheringId={gatheringId}
            gatheringStartDate={gathering?.start_date}
            currentMember={currentMember}
            members={members}
            item={null}
            initial={draft}
            initialManual={isFlight}
            inline
            onClose={() => { setDraft(null); setDuplicate(null); }}
            onSaved={() => {
              toast({ title: t('importEmail.saved') });
              navigate(`/gathering/${gatheringId}/journey`, { replace: true });
            }}
          />
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