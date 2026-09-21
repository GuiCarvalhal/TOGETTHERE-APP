import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Pencil, Trash2, ChevronRight, Paperclip } from 'lucide-react';
import { Image } from '@/components/ui/image';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { formatDate } from '@/lib/gatheringHelpers';

const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

// Compact journey segment card. Tapping opens the detail route.
// - Cover: first image attachment when the page "images" toggle is on; otherwise
//   a type-tinted placeholder banner (never blank space).
// - Medallion + type label use the type's accent color (theme-aware tints).
// - Footer shows owner, assigned participants, attachment count, and edit/delete.
export default function JourneyCard({ item, typeLabel, typeStyle, typeColor, icon: Icon, owner, participants, canEdit, onEdit, onDelete, showImages, to }) {
  const navigate = useNavigate();
  const imageAtt = showImages ? (item.attachments || []).find(isImg) : null;
  const otherAtts = (item.attachments || []).filter((u) => u !== imageAtt);
  const open = () => { if (to) navigate(to); };
  const stop = (e) => e.stopPropagation();
  const medallion = typeColor
    ? { style: { background: `${typeColor}1A`, color: typeColor, border: `1px solid ${typeColor}33` } }
    : { className: typeStyle };

  return (
    <div
      className="tt-card overflow-hidden"
      role={to ? 'link' : undefined}
      tabIndex={to ? 0 : undefined}
      onClick={to ? open : undefined}
      onKeyDown={to ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}
      style={{ cursor: to ? 'pointer' : 'default' }}
    >
      {imageAtt ? (
        <div className="aspect-[16/6] w-full bg-cream-pale">
          <Image src={imageAtt} alt="" className="w-full h-full object-cover" fittingType="fill" />
        </div>
      ) : showImages && typeColor ? (
        <div className="aspect-[16/6] w-full flex items-center justify-center" style={{ background: `${typeColor}12` }}>
          <Icon className="w-8 h-8" style={{ color: typeColor, opacity: 0.55 }} strokeWidth={1.5} />
        </div>
      ) : null}

      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" {...medallion}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="tt-label" style={typeColor ? { color: typeColor } : undefined}>{typeLabel}</span>
              {item.confirmation_number && <span className="text-[0.625rem] text-ink-deep/40 truncate">#{item.confirmation_number}</span>}
              {to && <ChevronRight className="w-4 h-4 text-ink-deep/30 ml-auto shrink-0" />}
            </div>
            <h3 className="font-display text-base font-bold text-ink-deep leading-tight">{item.title}</h3>
            <div className="text-xs text-ink-deep/60 mt-1 space-y-0.5">
              {item.start_datetime && (
                <p className="flex items-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate">{formatDate(item.start_datetime, { hour: 'numeric', minute: '2-digit' })}{item.end_datetime ? ` → ${formatDate(item.end_datetime, { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
                </p>
              )}
              {(item.location_from || item.location_to) && <p className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{item.location_from} → {item.location_to}</p>}
              {item.location_name && <p className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{item.location_name}</p>}
            </div>
            {item.notes && <p className="text-xs text-ink-deep/55 mt-1.5 line-clamp-2">{item.notes}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-ink-charcoal/10 flex-wrap">
          {owner && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MemberAvatar member={owner} size="xs" />
              <span className="text-xs text-ink-deep/50 truncate">{owner.full_name}</span>
            </div>
          )}
          {participants?.length > 0 && (
            <div className="flex items-center">
              {participants.slice(0, 4).map((m, i) => (
                <div key={m.id} className="rounded-full ring-2 ring-card" style={{ marginLeft: i === 0 ? 0 : '-0.5rem' }}>
                  <MemberAvatar member={m} size="xs" />
                </div>
              ))}
              {participants.length > 4 && <span className="text-[0.625rem] text-ink-deep/50 ml-1">+{participants.length - 4}</span>}
            </div>
          )}
          {otherAtts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[0.625rem] text-ink-deep/50 px-1.5 py-0.5 rounded-full bg-cream-pale border border-ink-charcoal/10">
              <Paperclip className="w-3 h-3" />{otherAtts.length}
            </span>
          )}
          {canEdit && (
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={(e) => { stop(e); onEdit(); }} className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={(e) => { stop(e); onDelete(); }} className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}