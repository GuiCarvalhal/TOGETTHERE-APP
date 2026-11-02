import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FormSheet from '@/components/tt/FormSheet';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import { useI18n } from '@/lib/i18n';
import { X, Loader2 } from 'lucide-react';

// Turns an imported transaction into a real expense through the STANDARD expense
// form (same fields, splits and validation as anywhere else in the app). The
// gathering is preselected when the import already matched one, and the
// transaction is linked to the expense only after it is saved.
export default function TransactionExpenseSheet({ transaction, gatherings, onClose, onLinked }) {
  const { t } = useI18n();
  const [gatheringId, setGatheringId] = useState(transaction.gathering_suggestion_id || '');
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!gatheringId) return;
    let active = true;
    setContext(null);
    setError('');
    base44.functions.invoke('getGatheringContext', { gathering_id: gatheringId })
      .then((res) => { if (active) setContext(res.data || res); })
      .catch((err) => { if (active) setError(err.response?.data?.error || err.message || t('finance.contextFailed')); });
    return () => { active = false; };
  }, [gatheringId, t]);

  async function handleSaved(savedExpense) {
    if (savedExpense?.id) {
      try {
        await base44.functions.invoke('updateFinancialTransaction', {
          id: transaction.id,
          action: 'link',
          expense_id: savedExpense.id,
          gathering_id: gatheringId,
        });
      } catch {
        // The expense exists; a failed link must not look like a failed save.
      }
    }
    onLinked();
  }

  if (gatheringId && context?.members && context?.currentMember) {
    return (
      <ExpenseForm
        gatheringId={gatheringId}
        members={context.members}
        currentMember={context.currentMember}
        expense={null}
        splits={[]}
        baseCurrency={transaction.currency}
        initial={{
          title: transaction.merchant || transaction.description || '',
          amount: transaction.amount,
          currency: transaction.currency,
          category: transaction.category_suggestion || 'other',
          date: transaction.date,
        }}
        onClose={onClose}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <FormSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={t('finance.chooseGathering')}>
      <div className="space-y-4">
        <p className="text-xs text-ink-deep/60">{t('finance.chooseGatheringHint')}</p>
        <div className="tt-card-flat p-3">
          <p className="text-sm font-semibold text-ink-deep">{transaction.merchant || transaction.description}</p>
          <p className="text-[11px] text-ink-deep/55">{transaction.date} ···· {transaction.account_mask}</p>
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">{t('finance.gathering')}</Label>
          <Select value={gatheringId} onValueChange={setGatheringId}>
            <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep h-10"><SelectValue placeholder={t('finance.selectGathering')} /></SelectTrigger>
            <SelectContent>
              {(gatherings || []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {gatheringId && !error && (
          <p className="text-xs text-ink-deep/50 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {t('common.loading')}</p>
        )}
        {error && <p className="text-xs text-terra-deep">{error}</p>}
        <Button type="button" variant="outline" onClick={onClose} className="w-full"><X /> {t('common.cancel')}</Button>
      </div>
    </FormSheet>
  );
}