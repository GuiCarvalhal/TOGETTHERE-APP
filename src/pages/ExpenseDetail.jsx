import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useExpensesData } from '@/hooks/useExpensesData';
import { EXPENSE_CATEGORIES, canSeeExpenses, isParticipant } from '@/lib/gatheringHelpers';
import DetailActionBar from '@/components/tt/DetailActionBar';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import MemberAvatar from '@/components/tt/MemberAvatar';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { Image } from '@/components/ui/image';
import Skeleton from '@/components/tt/Skeleton';
import { useI18n } from '@/lib/i18n';
import { softDeleteFields, restoreFields } from '@/lib/softDelete';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Receipt, UtensilsCrossed, Hotel, Car, Compass, MapPin } from 'lucide-react';

const CAT_ICON = { food: UtensilsCrossed, lodging: Hotel, transport: Car, activities: Compass, other: Receipt };
const CAT_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.color]));
const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

// Full-page expense detail — the same structural pattern as the Journey item
// detail: sticky action bar (back / open gathering / edit / delete), a hero
// card, then one section per fact. Permissions are unchanged from the list:
// owner + admin can always edit, a member only the expenses they paid.
export default function ExpenseDetail() {
  const { expenseId } = useParams();
  const d = useExpensesData();
  const navigate = useNavigate();
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { gatheringId, members, currentMember, role, memberById, splitsByExpense, displayFor, splitInBase, baseCurrency, setFab } = d;

  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  const back = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(`/gathering/${gatheringId}/expenses`);
  };
  const openExpenses = () => navigate(`/gathering/${gatheringId}/expenses`);

  if (!canSeeExpenses(role)) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} onOpenGathering={openExpenses} />
        <div className="tt-card-hairline p-10 text-center max-w-md mx-auto">
          <Receipt className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">{t('expenses.viewersExcluded')}</p>
          <p className="text-ink-deep/60 text-sm">{t('expenses.viewersExcludedBody')}</p>
        </div>
      </div>
    );
  }

  if (d.loading) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} onOpenGathering={openExpenses} />
        <div className="tt-card-hairline p-4 space-y-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-7 w-2/3" tone="cream" />
          <Skeleton className="h-4 w-1/2" tone="cream" />
        </div>
        <div className="tt-card-hairline p-4 space-y-3">
          <Skeleton className="h-4 w-1/3" tone="cream" />
          <Skeleton className="h-24 w-full rounded-xl" tone="cream" />
        </div>
      </div>
    );
  }

  const exp = d.expenseById[expenseId];
  if (d.error || !exp) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} onOpenGathering={openExpenses} />
        <div className="tt-card-hairline p-10 text-center max-w-md mx-auto">
          <Receipt className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">{t('expenseDetail.notFound')}</p>
          <p className="text-ink-deep/60 text-sm">{t('expenseDetail.notFoundBody')}</p>
        </div>
      </div>
    );
  }

  const canEdit = role === 'owner' || role === 'admin' || (role === 'member' && exp.payer_member_id === currentMember?.id);
  const splits = splitsByExpense[exp.id] || [];
  const payer = memberById[exp.payer_member_id];
  const displayPayer = payer && isParticipant(payer.role) ? payer : null;
  const splitRows = splits
    .map((s) => ({ split: s, member: memberById[s.member_id] }))
    .filter((r) => r.member && isParticipant(r.member.role));
  const disp = displayFor(exp);
  const CatIcon = CAT_ICON[exp.category] || Receipt;
  const catColor = CAT_COLOR[exp.category] || '#7a8290';
  const splitMethod = t('splitMethods.' + exp.split_method) || t('expenseCard.split');

  // Undo outlives this page (we navigate back to the list right after
  // deleting), so it restores by id and never depends on local state.
  async function undoDelete(title) {
    try {
      await base44.entities.Expense.update(expenseId, restoreFields());
      toast({ title: t('recentlyDeleted.restored'), description: t('recentlyDeleted.restoredDesc', { title }) });
    } catch (e) {
      toast({ variant: 'destructive', title: t('recentlyDeleted.restoreFailed'), description: e?.message });
    }
  }

  async function handleDelete() {
    if (!confirm(t('recentlyDeleted.expenseConfirm'))) return;
    setDeleting(true);
    try {
      await base44.entities.Expense.update(exp.id, softDeleteFields(currentMember?.user_id));
      const title = exp.title || t('common.untitled');
      toast({
        title: t('recentlyDeleted.expenseDeleted'),
        description: t('recentlyDeleted.expenseDeletedDesc', { title }),
        duration: 10000,
        action: (
          <ToastAction altText={t('recentlyDeleted.undo')} onClick={() => undoDelete(title)}>
            {t('recentlyDeleted.undo')}
          </ToastAction>
        ),
      });
      navigate(`/gathering/${gatheringId}/expenses`);
    } catch (e) {
      toast({ variant: 'destructive', title: t('expenseDetail.deleteFailed'), description: e?.message || t('common.error') });
      setDeleting(false);
    }
  }

  return (
    <div>
      <DetailActionBar
        onBack={back}
        onOpenGathering={openExpenses}
        canEdit={canEdit}
        canDelete={canEdit}
        onEdit={() => setEditing(true)}
        onDelete={handleDelete}
        deleting={deleting}
      />

      <div className="mt-5 space-y-4">
        {/* Hero */}
        <div className="tt-card-hairline p-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: catColor }}>
              <CatIcon className="w-7 h-7" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <span className="tt-label" style={{ color: catColor }}>{t('expenseCategories.' + exp.category)}</span>
              <h1 className="font-display text-2xl font-bold text-ink-deep leading-tight tt-text-balance">{exp.title}</h1>
            </div>
          </div>
        </div>

        {/* Amount — converted value first, then the original + how it was split */}
        <div className="tt-card-hairline p-4">
          <p className="tt-label text-ink-deep/40 mb-1">{t('expenseDetail.amount')}</p>
          <p className="font-display text-3xl font-bold text-ink-deep leading-none">{fmt.formatCurrency(disp.amount, disp.currency)}</p>
          <div className="mt-3 pt-3 border-t border-ink-charcoal/10 space-y-1 text-xs text-ink-deep/60">
            <p>{t('expenseDetail.original', { amount: fmt.formatCurrency(exp.amount, exp.currency || 'USD') })}</p>
            <p>{t('expenseDetail.splitMethod', { method: splitMethod })}</p>
            {exp.date && <p>{t('expenseDetail.date')}: {fmt.formatDate(exp.date, { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
          </div>
        </div>

        {/* Paid by */}
        <div className="tt-card-hairline p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('expenseDetail.paidBy')}</p>
          {displayPayer ? (
            <div className="flex items-center gap-3">
              <MemberAvatar member={displayPayer} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-deep truncate">{displayPayer.full_name || '—'}</p>
                {d.familyNameFor?.(displayPayer.id) && (
                  <p className="text-xs text-ink-deep/50 truncate">{d.familyNameFor(displayPayer.id)}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-deep/50">—</p>
          )}
        </div>

        {/* Split between */}
        <div className="tt-card-hairline p-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="tt-label text-ink-deep/40">{t('expenseDetail.split')}</p>
            {splitRows.length > 0 && <span className="text-xs text-ink-deep/45">{t('expenseCard.participationPeople', { count: splitRows.length })}</span>}
          </div>
          {splitRows.length > 0 ? (
            <ul className="space-y-2.5">
              {splitRows.map(({ split, member }) => (
                <li key={split.id} className="flex items-center gap-3">
                  <MemberAvatar member={member} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-deep truncate">{member.full_name || '—'}</p>
                    {d.familyNameFor?.(member.id) && <p className="text-[0.6875rem] text-ink-deep/45 truncate">{d.familyNameFor(member.id)}</p>}
                  </div>
                  <span className="text-sm font-semibold text-ink-deep whitespace-nowrap shrink-0">
                    {fmt.formatCurrency(splitInBase(split), baseCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-deep/50">{t('expenseDetail.noSplit')}</p>
          )}
        </div>

        {/* Place */}
        {(exp.place_name || exp.place_photo) && (
          <div className="tt-card-hairline p-4">
            <p className="tt-label text-ink-deep/40 mb-2.5">{t('expenseDetail.place')}</p>
            {exp.place_name && (
              <p className="flex items-center gap-2 text-sm text-ink-deep">
                <MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{exp.place_name}</span>
              </p>
            )}
            {exp.place_photo && (
              <div className="mt-3 aspect-[16/9] rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
                <Image src={exp.place_photo} alt={exp.place_name || ''} className="w-full h-full object-cover" fittingType="fill" />
              </div>
            )}
          </div>
        )}

        {/* Receipt */}
        {exp.receipt && (
          <div className="tt-card-hairline p-4">
            <p className="tt-label text-ink-deep/40 mb-2.5">{t('expenseDetail.receipt')}</p>
            {isImg(exp.receipt) ? (
              <a href={exp.receipt} target="_blank" rel="noopener noreferrer" className="block aspect-[16/9] rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
                <Image src={exp.receipt} alt={t('expenseDetail.receipt')} className="w-full h-full object-cover" fittingType="fill" />
              </a>
            ) : (
              <AttachmentChip url={exp.receipt} />
            )}
          </div>
        )}

        {editing && (
          <ExpenseForm
            gatheringId={gatheringId}
            members={members}
            currentMember={currentMember}
            expense={exp}
            splits={splits}
            baseCurrency={baseCurrency}
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); d.reload(); }}
          />
        )}
      </div>
    </div>
  );
}