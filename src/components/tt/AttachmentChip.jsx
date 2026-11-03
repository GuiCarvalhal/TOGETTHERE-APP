import React, { useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function isRemote(url = '') {
  return /^https?:\/\//i.test(url);
}

function isImage(url = '') {
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url);
}

// One attachment. Public URLs (form uploads) link straight through; PRIVATE files
// (an imported email is stored privately) are opened through a short-lived signed
// URL created on demand, so nothing private is ever exposed by a permanent link.
export default function AttachmentChip({ url, onRemove }) {
  const [opening, setOpening] = useState(false);
  const name = decodeURIComponent((url.split('/').pop() || 'file').split('?')[0]).slice(0, 22);
  const remote = isRemote(url);

  async function openPrivate(e) {
    e.preventDefault();
    if (opening) return;
    setOpening(true);
    try {
      const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: url });
      const signed = (res.data || res)?.signed_url;
      if (signed) window.open(signed, '_blank', 'noopener');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-1.5 rounded-lg bg-cream-pale border border-ink-charcoal/15 text-xs text-ink-deep">
      <a
        href={remote ? url : undefined}
        target="_blank"
        rel="noreferrer"
        onClick={remote ? undefined : openPrivate}
        className="flex items-center gap-1.5 min-w-0"
      >
        {isImage(url) ? (
          <img src={url} alt={name} loading="lazy" className="w-8 h-8 rounded-md object-cover border border-ink-charcoal/10 shrink-0" />
        ) : (
          <span className="w-8 h-8 rounded-md bg-cream-warm border border-ink-charcoal/10 flex items-center justify-center shrink-0">
            {opening ? <Loader2 className="w-4 h-4 animate-spin text-ink-deep/50" /> : <FileText className="w-4 h-4 text-ink-deep/50" />}
          </span>
        )}
        <span className="max-w-[110px] truncate">{name}</span>
      </a>
      {onRemove && (
        <button type="button" onClick={onRemove} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-deep/40 hover:text-terra-deep hover:bg-cream shrink-0" aria-label="Remove attachment">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}