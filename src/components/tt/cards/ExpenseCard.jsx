import React from 'react';
import { Receipt as ReceiptIcon, Check, Pencil } from 'lucide-react';
import { Image } from '@/components/ui/image';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/gatheringHelpers';

const isImg = (u) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u || '');
const CAT_LABEL = { food: 'Food', lodging: 'Lodging', transport: 'Transport', activities: 'Activities', other: 'Other' };
const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));

// Compact expense card. Hierarchy: category chip, title, payer · date, amount
// (with optional converted base amount), split participants, settled toggle.
// Cover: receipt image when the page "images" toggle is on; otherwise a
// category-tinted placeholder banner (never blank space).
export default function ExpenseCard({ exp, payer, splits, members, canEdit, onToggleSettled, onEdit, onDelete, showImages, baseCurrency, baseAmount, rate }) {
  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const catLabel = CAT_LABEL[exp.category] || 'Other';
  const catColor = CAT_COLOR[exp.category] || '#7a8290';
  const receiptImg = showImages && exp.receipt && isImg(exp.receipt);
  const chipMax = showImages ? 4 : 3;
  return (
    <div className={`tt-card overflow-hidden ${exp.settled ? 'opacity-60' : ''}`}>
      {receiptImg ? (
        <div className="aspect-[16/5] w-full bg-cream-pale">
          <Image src={exp.receipt} alt="Receipt" className="w-full h-full object-cover" fittingType="fill" />
        </div>
      ) : showImages ? (
        <div className="aspect-[16/5] w-full flex items-center justify-center" style={{ background: `${catColor}12` }}>
          <ReceiptIcon className="w-8 h-8" style={{ color: catColor, opacity: 0.5 }} strokeWidth={1.5} />
        </div>
      ) : null}
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${catColor}1A`, color: catColor, border: `1px solid ${catColor}33` }}>
            <ReceiptIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-ink-deep leading-tight truncate">{exp.title}</h3>
                <p className="text-xs text-ink-deep/55 mt-0.5 truncate">{payer?.full_name} · {formatDate(exp.date)}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-display text-lg font-bold text-ink-deep whitespace-nowrap">{formatCurrency(exp.amount, exp.currency)}</span>
                {baseCurrency && exp.currency && baseAmount != null && exp.currency.toUpperCase() !== baseCurrency.toUpperCase() && (
                  <p className="text-[0.6875rem] text-ink-deep/45 mt-0.5">≈ {formatCurrency(baseAmount, baseCurrency)}{rate != null ? ` · 1 ${exp.currency} = ${rate.toFixed(4)} ${baseCurrency}` : ''}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold uppercase tracking-wide" style={{ color: catColor, background: `${catColor}14`, border: `1px solid ${catColor}26` }}>{catLabel}</span>
              {exp.settled && <span className="px-1.5 py-0.5 rounded-full bg-terra/15 text-[0.625rem] font-semibold uppercase text-terra-deep">Settled</span>}
              {splits.slice(0, chipMax).map((s) => (
                <span key={s.member_id} className="text-[0.625rem] text-ink-deep/55 px-1.5 py-0.5 rounded-full bg-cream-pale border border-ink-charcoal/10">
                  {memberById[s.member_id]?.full_name?.split(' ')[0] || '?'}: {formatCurrency(s.amount, exp.currency)}
                </span>
              ))}
              {splits.length > chipMax && <span className="text-[0.625rem] text-ink-deep/40">+{splits.length - chipMax}</span>}
            </div>
            {exp.receipt && !receiptImg && <div className="mt-2"><AttachmentChip url={exp.receipt} /></div>}
            {canEdit && (
              <div className="flex items-center gap-0.5 mt-2.5 pt-2 border-t border-ink-charcoal/10">
                <button onClick={onToggleSettled} title={exp.settled ? 'Mark unsettled' : 'Mark settled'} className={`p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg ${exp.settled ? 'text-terra-deep' : 'text-ink-deep/40 hover:text-terra-deep'} hover:bg-cream-pale`}><Check className="w-3.5 h-3.5" /></button>
                <button onClick={onEdit} className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-ink-deep/40 hover:text-terra-deep hover:bg-cream-pale"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={onDelete} className="ml-auto p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-ink-deep/40 hover:text-terra-deep hover:bg-cream-pale">✕</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}