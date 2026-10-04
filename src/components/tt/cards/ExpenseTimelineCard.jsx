import React from 'react';
import { ChevronRight, UtensilsCrossed, Hotel, Car, Compass, Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES, isParticipant } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import { Image } from '@/components/ui/image';
import AvatarStack from '@/components/tt/AvatarStack';

const CAT_ICON = { food: UtensilsCrossed, lodging: Hotel, transport: Car, activities: Compass, other: Receipt };
const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));

// Timeline expense row — structural twin of JourneyCard. The left rail column
// carries ONLY the circular category medallion (the amount no longer fits on
// the rail; it lives inside the card). The elevated card to the right holds
// exactly four lines, reusing the Journey card's type scale (no new scale):
//   1. payer name        — Journey meta line treatment (text-[0.6875rem] /50)
//   2. title + amount    — Journey title treatment (text-[0.95rem] font-bold),
//                          title truncates so the display-currency amount never
//                          wraps or gets pushed off the row
//   3. original amount · split method — Journey timing treatment (text-xs /55)
//   4. AvatarStack of the people in the split (no separator rule above it)
// The whole card opens the editor (chevron signals it); deleting happens on the
// detail/edit view, not inline.
export default function ExpenseTimelineCard({ exp, payer, splits, members, canEdit, onEdit, displayAmount, displayCurrency, showImages = true }) {
  const { t, fmt } = useI18n();
  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const catColor = CAT_COLOR[exp.category] || '#7a8290';
  const CatIcon = CAT_ICON[exp.category] || Receipt;
  // Viewers never appear in an expense list: a legacy viewer split/payer is kept
  // in the balance math (debt not discarded) but filtered from display here.
  const splitMembers = (splits || [])
    .map((s) => memberById[s.member_id])
    .filter((m) => m && isParticipant(m.role));
  const displayPayer = payer && isParticipant(payer.role) ? payer : null;
  const splitLabel = t('splitMethods.' + exp.split_method) || t('expenseCard.split');
  // Card image: prefer a receipt image; fall back to the persisted place photo
  // when there is no receipt or the receipt is a PDF (PDFs can't render as
  // <img>). No render-time API calls — both URLs are stored on the expense at
  // save time.
  const receiptUrl = exp.receipt || '';
  const receiptIsPdf = /\.pdf(\?|$)/i.test(receiptUrl);
  const cardImage = (receiptUrl && !receiptIsPdf) ? receiptUrl : (exp.place_photo || '');
  const showReceiptImage = showImages && !!cardImage;

  return (
    <div className="flex gap-2 items-stretch">
      {/* Left rail column: category medallion only */}
      <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center relative z-10 ring-2 ring-background shadow-sm"
          style={{ backgroundColor: catColor }}
        >
          <CatIcon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
      </div>

      {/* Card */}
      <div
        className={`flex-1 min-w-0 rounded-2xl border border-ink-charcoal/15 bg-card relative ${exp.settled ? 'opacity-60' : ''} ${canEdit ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40' : ''}`}
        style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
        onClick={canEdit ? onEdit : undefined}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } } : undefined}
      >
        {showReceiptImage && (
          <div className="h-24 w-full overflow-hidden rounded-t-2xl">
            <Image src={cardImage} alt={exp.title} className="w-full h-full object-cover" fittingType="fill" />
          </div>
        )}
        <div className="p-3">
        {canEdit && <ChevronRight className="absolute top-3 right-3 w-4 h-4 text-ink-deep/30" />}

        {/* Line 1: payer */}
        <p className="text-[0.6875rem] truncate pr-5 text-ink-deep/50">{displayPayer?.full_name || '—'}</p>

        {/* Line 2: title (left, truncates) + display-currency amount (right, never wraps) */}
        <div className="flex items-baseline gap-2 mt-0.5 pr-5">
          <h3 className="font-display text-[0.95rem] font-bold leading-tight text-ink-deep truncate min-w-0 flex-1">{exp.title}</h3>
          <span className="font-display text-[0.95rem] font-bold leading-tight text-ink-deep whitespace-nowrap shrink-0">{fmt.formatCurrency(displayAmount, displayCurrency)}</span>
        </div>

        {/* Line 3: original amount · split method */}
        <p className="text-xs text-ink-deep/55 mt-1 truncate">{fmt.formatCurrency(exp.amount, exp.currency)} · {t('expenseCard.splitSuffix', { method: splitLabel.toLowerCase() })}</p>

        {/* Line 4: participant avatar stack — sits directly below, no separator rule */}
        <div className="flex items-center gap-2 mt-2 min-h-[2.5rem]">
          {splitMembers.length > 0 ? (
            <AvatarStack people={splitMembers} ringClass="ring-card" />
          ) : (
            <span className="text-xs italic text-ink-deep/55">{t('expenseCard.noOneSplit')}</span>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}