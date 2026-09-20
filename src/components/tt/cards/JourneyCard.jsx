import React from 'react';
import { Clock, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Image } from '@/components/ui/image';
import AttachmentChip from '@/components/tt/AttachmentChip';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { formatDate } from '@/lib/gatheringHelpers';

const isImg = (u) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u || '');

// Compact journey segment card. Shows the first image attachment as a cover
// banner only when the page's "images" toggle is on.
export default function JourneyCard({ item, typeLabel, typeStyle, icon: Icon, owner, canEdit, onEdit, onDelete, showImages }) {
  const imageAtt = showImages ? (item.attachments || []).find(isImg) : null;
  const otherAtts = (item.attachments || []).filter((u) => u !== imageAtt);
  return (
    <div className="tt-card overflow-hidden">
      {imageAtt && (
        <div className="aspect-[16/6] w-full bg-cream-pale">
          <Image src={imageAtt} alt="" className="w-full h-full object-cover" fittingType="fill" />
        </div>
      )}
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${typeStyle}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="tt-label text-terra-deep">{typeLabel}</span>
              {item.confirmation_number && <span className="text-[0.625rem] text-ink-deep/40">#{item.confirmation_number}</span>}
            </div>
            <h3 className="font-display text-base font-bold text-ink-deep leading-tight">{item.title}</h3>
            <div className="text-xs text-ink-deep/60 mt-1 space-y-0.5">
              {item.start_datetime && (
                <p className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(item.start_datetime, { hour: 'numeric', minute: '2-digit' })}
                  {item.end_datetime ? ` → ${formatDate(item.end_datetime, { hour: 'numeric', minute: '2-digit' })}` : ''}
                </p>
              )}
              {(item.location_from || item.location_to) && <p className="truncate">{item.location_from} → {item.location_to}</p>}
              {item.location_name && <p className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{item.location_name}</p>}
            </div>
            {item.notes && <p className="text-xs text-ink-deep/55 mt-1.5 line-clamp-2">{item.notes}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-ink-charcoal/10">
          {owner && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MemberAvatar member={owner} size="xs" />
              <span className="text-xs text-ink-deep/50 truncate">{owner.full_name}</span>
            </div>
          )}
          {otherAtts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 ml-1">
              {otherAtts.slice(0, 2).map((url, i) => <AttachmentChip key={url + i} url={url} />)}
            </div>
          )}
          {canEdit && (
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={onEdit} className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={onDelete} className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}