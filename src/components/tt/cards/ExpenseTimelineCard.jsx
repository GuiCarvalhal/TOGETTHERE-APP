import React from 'react';
import { ChevronRight, Trash2, UtensilsCrossed, Hotel, Car, Compass, Receipt } from 'lucide-react';
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/gatheringHelpers';
import AvatarStack from '@/components/tt/AvatarStack';
import { Button } from '@/components/ui/button';

const CAT_ICON = { food: UtensilsCrossed, lodging: Hotel, transport: Car, activities: Compass, other: Receipt };
const CAT_LABEL = { food: 'Food', lodging: 'Lodging', transport: 'Transport', activities: 'Activities', other: 'Other' };
const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));
const SPLIT_LABEL = { equal: 'Equal', custom: 'Custom', by_share: 'By share' };

// Timeline expense row — structural twin of JourneyCard. The left rail column
// carries the category icon medallion and, directly below it, the expense
// amount in the gathering's display currency (both on opaque page-surface
// backgrounds so the rail line never shows through). The elevated card to the
// right holds the richer info — payer · date, title, category, the original
// amount + currency when it differs from the display currency, split method,
// and the participant avatar stack — with a single compact destructive delete
// as the only inline action. The whole card opens the editor (chevron signals
// it), mirroring how Journey cards open their detail page.
export default function ExpenseTimelineCard({ exp, payer, splits, members, canEdit, onEdit, onDelete, displayAmount, displayCurrency }) {
  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const catColor = CAT_COLOR[exp.category] || '#7a8290';
  const CatIcon = CAT_ICON[exp.category] || Receipt;
  const catLabel = CAT_LABEL[exp.category] || 'Other';
  const splitMembers = (splits || []).map((s) => memberById[s.member_id]).filter(Boolean);
  const splitLabel = SPLIT_LABEL[exp.split_method] || 'Split';
  const differs = !!(exp.currency && displayCurrency && exp.currency.toUpperCase() !== displayCurrency.toUpperCase());

  return (
    <div className="flex gap-2 items-stretch">
      {/* Left rail column: category medallion + display-currency amount */}
      <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 bg-background border-2"
          style={{ color: catColor, borderColor: catColor }}
        >
          <CatIcon className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="mt-1.5 text-center leading-tight bg-background px-1.5 rounded">
          <p className="text-[0.6875rem] font-bold text-foreground whitespace-nowrap">{formatCurrency(displayAmount, displayCurrency)}</p>
        </div>
      </div>

      {/* Card */}
      <div
        className={`flex-1 min-w-0 rounded-2xl border border-ink-charcoal/15 bg-card p-3 relative ${exp.settled ? 'opacity-60' : ''} ${canEdit ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40' : ''}`}
        style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
        onClick={canEdit ? onEdit : undefined}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } } : undefined}
      >
        {canEdit && <ChevronRight className="absolute top-3 right-3 w-4 h-4 text-ink-deep/30" />}

        {/* Meta: payer · date */}
        <p className="text-[0.6875rem] truncate pr-5 text-ink-deep/50">{payer?.full_name || '—'} · {formatDate(exp.date)}</p>

        {/* Title */}
        <h3 className="font-display text-[0.95rem] font-bold leading-tight mt-0.5 line-clamp-2 pr-5 text-ink-deep">{exp.title}</h3>

        {/* Category + original amount (when different) + settled + split method */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold uppercase tracking-wide" style={{ color: catColor, background: `${catColor}14`, border: `1px solid ${catColor}26` }}>{catLabel}</span>
          {differs && (
            <span className="text-[0.6875rem] font-semibold text-ink-deep/70 whitespace-nowrap">
              {formatCurrency(exp.amount, exp.currency)} <span className="text-ink-deep/40 font-normal">original</span>
            </span>
          )}
          {exp.settled && <span className="px-1.5 py-0.5 rounded-full bg-terra/15 text-[0.625rem] font-semibold uppercase text-terra-deep">Settled</span>}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-cream-pale text-[0.625rem] font-semibold text-ink-deep/60 border border-ink-charcoal/10">Split {splitLabel.toLowerCase()}</span>
        </div>

        {/* Participant slot — avatar stack + compact delete (the only inline action) */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-ink-charcoal/10 min-h-[2.5rem]">
          {splitMembers.length > 0 ? (
            <AvatarStack people={splitMembers} ringClass="ring-card" />
          ) : (
            <span className="text-xs italic text-ink-deep/55">No one split yet</span>
          )}
          {canEdit && (
            <Button
              variant="destructive"
              size="icon"
              className="h-8 w-8 ml-auto"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete expense"
              aria-label="Delete expense"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}