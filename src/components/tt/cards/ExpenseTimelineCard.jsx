import React from 'react';
import { ChevronRight, UtensilsCrossed, Hotel, Car, Compass, Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES, isParticipant } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import { Image } from '@/components/ui/image';
import MemberAvatar from '@/components/tt/MemberAvatar';

const CAT_ICON = { food: UtensilsCrossed, lodging: Hotel, transport: Car, activities: Compass, other: Receipt };
const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));

// Timeline expense row — structural twin of JourneyCard. The left rail column
// carries ONLY the category medallion (the type is shown OUTSIDE the card, on
// the rail). The card itself is dense and holds exactly TWO lines plus the
// payer avatar on the left, spanning them:
//   1. title + converted value in the current display currency
//   2. who shares it — people / families count — and the original amount in its
//      original currency, on the same line
// No date (the list is already grouped by day) and no icon inside the card.
// A receipt/place photo is the card's BACKGROUND (same treatment as Journey
// cards: cover image + ink scrim), never a block stacked above the content.
export default function ExpenseTimelineCard({
  exp, payer, splits, members, onOpen, displayAmount, displayCurrency, showImages = true, participation,
}) {
  const { t, fmt } = useI18n();
  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const catColor = CAT_COLOR[exp.category] || '#7a8290';
  const CatIcon = CAT_ICON[exp.category] || Receipt;
  // Viewers never appear in an expense list: a legacy viewer split is kept in
  // the balance math but filtered from display here.
  const splitMembers = (splits || [])
    .map((s) => memberById[s.member_id])
    .filter((m) => m && isParticipant(m.role));
  const displayPayer = payer && isParticipant(payer.role) ? payer : null;
  // Card image: prefer a receipt image; fall back to the persisted place photo
  // when there is no receipt or the receipt is a PDF (PDFs can't render as
  // <img>). Both URLs are stored on the expense at save time — no render calls.
  const receiptUrl = exp.receipt || '';
  const receiptIsPdf = /\.pdf(\?|$)/i.test(receiptUrl);
  const cardImage = (receiptUrl && !receiptIsPdf) ? receiptUrl : (exp.place_photo || '');
  const cover = showImages && cardImage ? cardImage : null;
  const onCover = !!cover;

  const people = participation?.people ?? splitMembers.length;
  const families = participation?.families ?? 0;
  let participationLabel = t('expenseCard.noOneSplit');
  if (people > 0) {
    participationLabel = t('expenseCard.participationPeople', { count: people });
    if (families > 0) participationLabel += ` · ${t('expenseCard.participationFamilies', { count: families })}`;
  }

  const mainText = onCover ? 'text-white' : 'text-ink-deep';
  const subText = onCover ? 'text-white/80' : 'text-ink-deep/55';
  const metaText = onCover ? 'text-white/85' : 'text-ink-deep/50';

  return (
    <div className="flex gap-2 items-stretch">
      {/* Left rail column: category medallion only (type lives outside the card) */}
      <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center relative z-10 ring-2 ring-background"
          style={{ backgroundColor: catColor }}
        >
          <CatIcon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
      </div>

      {/* Card — photo cards carry their own scrim, so they need no border. */}
      <div
        className={`flex-1 min-w-0 rounded-2xl overflow-hidden relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40 border ${onCover ? 'border-transparent' : 'border-ink-charcoal/15 bg-card'} ${exp.settled ? 'opacity-60' : ''}`}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      >
        {onCover && (
          <>
            <Image src={cover} alt="" className="absolute inset-0 w-full h-full" fittingType="fill" />
            <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim/90 via-ink-scrim/60 to-ink-scrim/35" />
          </>
        )}
        <div className="relative p-2.5 flex items-center gap-2.5">
          {displayPayer && (
            <div className={`rounded-full ring-2 shrink-0 ${onCover ? 'ring-white/80' : 'ring-card'}`}>
              <MemberAvatar member={displayPayer} size="sm" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* 1 — title + converted value */}
            <div className="flex items-baseline gap-2">
              <h3 className={`font-display text-[0.9rem] font-bold leading-tight truncate min-w-0 flex-1 ${mainText}`}>{exp.title}</h3>
              <span className={`font-display text-[0.9rem] font-bold leading-tight whitespace-nowrap shrink-0 ${mainText}`}>
                {fmt.formatCurrency(displayAmount, displayCurrency)}
              </span>
            </div>
            {/* 2 — participation summary + the original amount, always ONE line:
                the summary truncates, the amount never wraps. */}
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-[0.6875rem] truncate min-w-0 flex-1 ${metaText}`}>{participationLabel}</span>
              <span className={`text-[0.6875rem] whitespace-nowrap shrink-0 ${subText}`}>{fmt.formatCurrency(exp.amount, exp.currency || 'USD')}</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: onCover ? 'rgba(255,255,255,0.75)' : undefined }} />
        </div>
      </div>
    </div>
  );
}