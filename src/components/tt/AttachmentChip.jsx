import React from 'react';
import { X, FileText } from 'lucide-react';

function isImage(url = '') {
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url);
}

export default function AttachmentChip({ url, onRemove }) {
  const name = decodeURIComponent((url.split('/').pop() || 'file').split('?')[0]).slice(0, 22);
  return (
    <div className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-1.5 rounded-lg bg-cream-pale border border-ink-charcoal/15 text-xs text-ink-deep">
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 min-w-0">
        {isImage(url) ? (
          <img src={url} alt={name} loading="lazy" className="w-8 h-8 rounded-md object-cover border border-ink-charcoal/10 shrink-0" />
        ) : (
          <span className="w-8 h-8 rounded-md bg-cream-warm border border-ink-charcoal/10 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-ink-deep/50" />
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