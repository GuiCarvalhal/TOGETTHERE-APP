import React from 'react';
import { AlertTriangle, FolderPlus, Loader2, Mail, X } from 'lucide-react';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { Button } from '@/components/ui/button';
import { journeyIcon } from '@/lib/journeyIcons';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';

const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.color]));

// One segment waiting in the journey inbox. It renders with the SAME JourneyCard
// used on the timeline, fed by the standard payload stored at import time, so an
// imported item looks exactly like a manually added one. Below the card sit the
// two decisions: file it into a gathering, or dismiss it.
export default function InboxItemCard({ item, onFile, onDismiss, busy }) {
  const { t } = useI18n();
  const missing = Array.isArray(item?.missing) ? item.missing : [];
  const emailAttachment = (item?.attachments || [])[0];

  return (
    <div>
      <JourneyCard
        item={item}
        typeColor={TYPE_COLOR[item.type] || TYPE_COLOR.other}
        icon={journeyIcon(item.type)}
        participants={[]}
        showImages
      />

      <div className="pl-14 mt-2 space-y-2">
        {missing.length > 0 && (
          <p className="text-xs text-terra-deep flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {t('inbox.missingHint', { fields: missing.map((code) => t('home.importBlocked_' + code)).join(', ') })}
          </p>
        )}

        {item.source_subject && (
          <p className="text-xs text-ink-deep/55 inline-flex items-center gap-1.5 min-w-0">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{item.source_subject}</span>
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" disabled={busy} onClick={() => onFile(item)}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
            {t('inbox.addToGathering')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(item)}>
            <X className="w-3.5 h-3.5" />
            {t('inbox.dismiss')}
          </Button>
          {emailAttachment && <AttachmentChip url={emailAttachment} />}
        </div>

        {/* The source email is normally the attachment above; when it could not be
            stored, the message text kept at import time is still readable here. */}
        {!emailAttachment && item?.source_content && (
          <details className="w-full">
            <summary className="text-xs font-semibold text-terra-deep cursor-pointer inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              {t('inbox.viewEmail')}
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-deep/70 bg-cream-pale border border-ink-charcoal/15 rounded-lg p-3">
              {item.source_content}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}