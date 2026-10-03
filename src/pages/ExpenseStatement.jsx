import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useExpensesData } from '@/hooks/useExpensesData';
import { formatCurrency, formatDate, isParticipant } from '@/lib/gatheringHelpers';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';
import { ChevronLeft, FileText } from 'lucide-react';

export default function ExpenseStatement() {
  const navigate = useNavigate();
  const { id, memberId } = useParams();
  const d = useExpensesData();
  const [selectedMember, setSelectedMember] = useState(memberId || d.currentMember?.id || d.participantMembers[0]?.id || '');

  if (d.loading) return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Skeleton className="w-11 h-11 rounded-full" />
        <Skeleton className="h-7 w-40" />
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  );
  if (d.error) return (
    <div className="tt-card p-10 text-center max-w-md mx-auto">
      <p className="font-display text-2xl mb-2 text-ink-deep">Couldn't load statement</p>
      <button onClick={d.reload} className="px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">Try again</button>
    </div>
  );

  const { participantMembers, memberById, expenses, splits, balances, baseCurrency, expenseInBase, splitInBase } = d;
  const member = memberById[selectedMember];
  const firstName = member?.full_name?.split(' ')[0] || 'Member';

  const paid = expenses.filter((e) => e.payer_member_id === selectedMember);
  const shareExpIds = new Set(splits.filter((s) => s.member_id === selectedMember).map((s) => s.expense_id));
  const sharedWith = expenses.filter((e) => shareExpIds.has(e.id));
  const net = balances[selectedMember] || 0;
  const totalPaid = paid.reduce((s, e) => s + expenseInBase(e), 0);
  const totalShare = splits.filter((s) => s.member_id === selectedMember).reduce((s, sp) => s + splitInBase(sp), 0);

  const myShareOf = (exp) => {
    const sp = splits.find((s) => s.expense_id === exp.id && s.member_id === selectedMember);
    return sp ? splitInBase(sp) : 0;
  };

  const Row = ({ exp, showShare }) => {
    // Viewers never appear in an expense list: a legacy viewer payer is kept in
    // the balance math but filtered from the displayed payer name.
    const payerMember = memberById[exp.payer_member_id];
    const payerName = payerMember && isParticipant(payerMember.role) ? payerMember.full_name : '—';
    return (
    <div className="tt-card p-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-deep text-sm truncate">{exp.title}</p>
        <p className="text-xs text-ink-deep/50 truncate">{formatDate(exp.date)} · {payerName}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-display font-bold text-ink-deep whitespace-nowrap">{formatCurrency(expenseInBase(exp), baseCurrency)}</p>
        {showShare && <p className="text-xs text-ink-deep/50 whitespace-nowrap">your share {formatCurrency(myShareOf(exp), baseCurrency)}</p>}
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-foreground/5 text-foreground"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="font-display text-xl font-bold text-foreground">Statement</h1>
      </div>

      {/* Member selector + summary */}
      <section className="tt-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} size="md" />
          <Select
            value={selectedMember}
            onValueChange={(v) => { setSelectedMember(v); navigate(`/gathering/${id}/expenses/statement/${v}`, { replace: true }); }}
          >
            <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep flex-1 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {participantMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <p className="tt-label text-ink-deep/40">Paid</p>
            <p className="font-display text-lg font-bold text-ink-deep truncate">{formatCurrency(totalPaid, baseCurrency)}</p>
          </div>
          <div>
            <p className="tt-label text-ink-deep/40">Share</p>
            <p className="font-display text-lg font-bold text-ink-deep truncate">{formatCurrency(totalShare, baseCurrency)}</p>
          </div>
          <div>
            <p className="tt-label text-ink-deep/40">Net</p>
            <p className={`font-display text-lg font-bold truncate ${net > 0.01 ? 'text-terra-deep' : net < -0.01 ? 'text-ink-deep/70' : 'text-ink-deep/40'}`}>
              {net > 0.01 ? '+' : ''}{formatCurrency(net, baseCurrency)}
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-deep/55">
          {net > 0.01 ? `${firstName} is owed ${formatCurrency(net, baseCurrency)}` : net < -0.01 ? `${firstName} owes ${formatCurrency(Math.abs(net), baseCurrency)}` : `${firstName} is settled up.`}
        </p>
      </section>

      <section>
        <h3 className="tt-label text-foreground/50 mb-2.5">Paid by {firstName}</h3>
        {paid.length === 0 ? (
          <EmptyState icon={FileText} title="Nothing paid yet" body={`${firstName} hasn't paid for any expenses.`} />
        ) : (
          <div className="space-y-3">
            {paid.map((exp) => <Row key={exp.id} exp={exp} showShare={exp.payer_member_id !== selectedMember} />)}
          </div>
        )}
      </section>

      <section>
        <h3 className="tt-label text-foreground/50 mb-2.5">Shared with {firstName}</h3>
        {sharedWith.length === 0 ? (
          <EmptyState icon={FileText} title="No shared expenses" body={`${firstName} isn't on any splits.`} />
        ) : (
          <div className="space-y-3">
            {sharedWith.map((exp) => <Row key={exp.id} exp={exp} showShare />)}
          </div>
        )}
      </section>
    </div>
  );
}