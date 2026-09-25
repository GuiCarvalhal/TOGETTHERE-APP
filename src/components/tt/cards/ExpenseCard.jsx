import React from 'react';
import { Pencil, Trash2, Paperclip, UtensilsCrossed, Hotel, Car, Compass, Receipt } from 'lucide-react';
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/gatheringHelpers';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Button } from '@/components/ui/button';

const CAT_ICON = { food: UtensilsCrossed, lodging: Hotel, transport: Car, activities: Compass, other: Receipt };
const CAT_LABEL = { food: 'Food', lodging: 'Lodging', transport: 'Transport', activities: 'Activities', other: 'Other' };
const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));

// Compact expense card. Hierarchy: category icon (with a small paperclip +
// count badge below when a receipt is attached), title, payer · date, amount
// (with converted base amount), category chip, settled badge, and split
// participants as avatars +N (no names). Edit/delete are the only inline
// actions; the settled checkmark is gone (settling happens in the edit form).
export default function ExpenseCard({ exp, payer, splits, members, canEdit, onEdit, onDelete, baseCurrency, baseAmount }) {
  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const catLabel = CAT_LABEL[exp.category] || 'Other';
  const catColor = CAT_COLOR[exp.category] || '#7a8290';
  const CatIcon = CAT_ICON[exp.category] || Receipt;
  const hasReceipt = !!exp.receipt;

  return (
    <div className={`tt-card p-3 ${exp.settled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Category icon + compact attachment badge */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${catColor}1A`, color: catColor, border: `1px solid ${catColor}33` }}>
            <CatIcon className="w-4 h-4" />
          </div>
          {hasReceipt && (
            <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cream-pale border border-ink-charcoal/15 text-[0.625rem] text-ink-deep/55">
              <Paperclip className="w-2.5 h-2.5" />1
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-ink-deep leading-tight truncate">{exp.title}</h3>
              <p className="text-xs text-ink-deep/55 mt-0.5 truncate">{payer?.full_name || '—'} · {formatDate(exp.date)}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="font-display text-base font-bold text-ink-deep whitespace-nowrap">{formatCurrency(exp.amount, exp.currency)}</span>
              {baseCurrency && exp.currency && baseAmount != null && exp.currency.toUpperCase() !== baseCurrency.toUpperCase() && (
                <p className="text-[0.6875rem] text-ink-deep/45 mt-0.5 whitespace-nowrap">≈ {formatCurrency(baseAmount, baseCurrency)}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold uppercase tracking-wide" style={{ color: catColor, background: `${catColor}14`, border: `1px solid ${catColor}26` }}>{catLabel}</span>
            {exp.settled && <span className="px-1.5 py-0.5 rounded-full bg-terra/15 text-[0.625rem] font-semibold uppercase text-terra-deep">Settled</span>}
            {splits.length > 0 && (
              <div className="flex items-center">
                {splits.slice(0, 4).map((s, i) => (
                  <div key={s.member_id} className="rounded-full ring-2 ring-card" style={{ marginLeft: i === 0 ? 0 : '-0.5rem' }}>
                    <MemberAvatar member={memberById[s.member_id]} size="xs" />
                  </div>
                ))}
                {splits.length > 4 && <span className="text-[0.625rem] text-ink-deep/50 ml-1.5">+{splits.length - 4}</span>}
              </div>
            )}
            {canEdit && (
              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}