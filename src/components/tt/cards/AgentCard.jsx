import React from 'react';
import { Bookmark, BookmarkCheck, X, Compass, UtensilsCrossed, Coffee, BedDouble, Sparkles } from 'lucide-react';
import MemberAvatar from '@/components/tt/MemberAvatar';

const CAT_ICON = { restaurant: UtensilsCrossed, activity: Compass, cafe: Coffee, stay: BedDouble, experience: Sparkles };
const CAT_COLOR = { restaurant: '#E05A47', activity: '#F07865', cafe: '#C8493A', stay: '#1E2633', experience: '#E05A47' };

// Compact agent recommendation card. Hierarchy: category header, name,
// location · category · price, why-sentence, description, matched members,
// save / dismiss actions. The header is a category-tinted placeholder "cover"
// shown when the page "images" toggle is on; when off, a tinted icon medallion
// leads the body instead.
export default function AgentCard({ rec, members, isSaved, onSave, onDismiss, showImages }) {
  const Icon = CAT_ICON[rec.category] || Compass;
  const color = CAT_COLOR[rec.category] || '#E05A47';
  return (
    <div className="tt-card overflow-hidden flex flex-col">
      {showImages ? (
        <div className="h-12 w-full flex items-center gap-2.5 px-4" style={{ background: `${color}12` }}>
          <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.5} />
          <span className="tt-label capitalize" style={{ color }}>{rec.category}</span>
        </div>
      ) : null}
      <div className="p-4 flex flex-col gap-2.5">
        <div className="flex items-start gap-2.5">
          {!showImages && (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}40` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-ink-deep leading-tight">{rec.name}</h3>
            <p className="text-[0.625rem] text-ink-deep/50 capitalize mt-0.5 truncate">{rec.location} · {rec.category}{rec.price_level ? ` · ${rec.price_level}` : ''}</p>
          </div>
        </div>
        {rec.why_sentence && <p className="text-xs text-ink-deep/75 italic font-display leading-relaxed border-l-2 border-terra/40 pl-2.5">{rec.why_sentence}</p>}
        {rec.description && <p className="text-xs text-ink-deep/65 line-clamp-2">{rec.description}</p>}
        {rec.matches?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {rec.matches.map((mt, j) => {
              const member = members.find((m) => m.full_name === mt.member_name);
              return (
                <span key={j} className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-cream-pale border border-ink-charcoal/10" title={mt.reason}>
                  {member ? <MemberAvatar member={member} size="xs" /> : <span className="w-5 h-5 rounded-full bg-terra/15 text-terra-deep text-[0.5rem] font-bold flex items-center justify-center">{(mt.member_name || '?')[0]}</span>}
                  <span className="text-[0.625rem] font-medium text-ink-deep">{mt.member_name}</span>
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1.5 border-t border-ink-charcoal/10">
          <button onClick={() => !isSaved && onSave()} className={`inline-flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-full text-xs font-semibold ${isSaved ? 'bg-terra text-cream' : 'bg-cream-pale text-ink-deep hover:bg-cream-warm'}`}>
            {isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <button onClick={onDismiss} className="ml-auto inline-flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-full text-xs text-ink-deep/50 hover:text-terra-deep hover:bg-cream-pale">
            <X className="w-3.5 h-3.5" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}