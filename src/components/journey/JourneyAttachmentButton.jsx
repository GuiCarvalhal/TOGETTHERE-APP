import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';

// Attachment action for the desktop extra card, kept in the card's action row
// instead of a footer. One file opens straight away (public URLs directly,
// private files through a short-lived signed URL); several files open the
// segment's detail page, which lists them all.
export default function JourneyAttachmentButton({ urls = [], detailPath }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const count = urls.length;
  if (!count) return null;

  async function open(e) {
    e.preventDefault();
    if (count > 1) {
      navigate(detailPath);
      return;
    }
    const url = urls[0];
    if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (opening) return;
    setOpening(true);
    try {
      const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: url });
      const signed = (res.data || res)?.signed_url;
      if (!signed) throw new Error('signed_url_unavailable');
      window.open(signed, '_blank', 'noopener');
    } catch {
      toast({ title: t('common.fileOpenFailed'), variant: 'destructive' });
    } finally {
      setOpening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      title={t('journeyDetail.attachments')}
      aria-label={t('journeyDetail.attachments')}
      className="inline-flex items-center gap-0.5 h-7 px-2 rounded-full border border-ink-charcoal/15 bg-foreground/5 text-[11px] font-semibold text-ink-deep hover:bg-foreground/10"
    >
      {opening ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
      {count}
    </button>
  );
}