import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { formatCurrency } from '@/lib/gatheringHelpers';

function surname(name) {
  return (String(name || '').trim().split(/\s+/).pop() || '').toLowerCase();
}

// Groups members into families by shared surname (a heuristic — there is no
// explicit family field on the Member entity). Singletons render as plain
// rows; 2+ members with the same surname render under a family header with a
// "select all" toggle. Individuals always keep their own checkbox + input, so
// a family can be selected together and then overridden per person. No records
// are merged — each member still receives an independent split entry.
export function groupFamilies(members) {
  const groups = {};
  members.forEach((m) => {
    const s = surname(m.full_name) || m.id;
    (groups[s] = groups[s] || []).push(m);
  });
  return Object.values(groups).sort((a, b) => (a[0].full_name || '').localeCompare(b[0].full_name || ''));
}

export default function FamilySplitTable({ participants, selected, inputs, splitMethod, splitAmounts, currency, onToggleMember, onSetInput }) {
  const families = groupFamilies(participants);

  const toggleFamily = (fam) => {
    const allIn = fam.every((m) => selected.includes(m.id));
    fam.forEach((m) => onToggleMember(m.id, !allIn));
  };

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg bg-cream-pale p-3 border border-ink-charcoal/15">
      {families.map((fam) => {
        const isFamily = fam.length > 1;
        const allIn = fam.every((m) => selected.includes(m.id));
        const familyName = isFamily ? `${fam[0].full_name?.split(' ').pop()} family` : '';
        return (
          <div key={fam[0].id} className={isFamily ? 'rounded-lg bg-cream/70 p-2 border border-ink-charcoal/10' : ''}>
            {isFamily && (
              <div className="flex items-center gap-3 pb-1.5 mb-1 border-b border-ink-charcoal/10">
                <Checkbox checked={allIn} onCheckedChange={() => toggleFamily(fam)} />
                <span className="flex-1 text-sm font-semibold text-ink-deep">{familyName}</span>
                <span className="text-[0.625rem] text-ink-deep/45">{fam.length} members</span>
              </div>
            )}
            {fam.map((m) => {
              const checked = selected.includes(m.id);
              return (
                <div key={m.id} className={`flex items-center gap-2.5 py-1.5 ${isFamily ? 'pl-2' : ''}`}>
                  <Checkbox checked={checked} onCheckedChange={() => onToggleMember(m.id, !checked)} />
                  <MemberAvatar member={m} size="xs" />
                  <span className="flex-1 text-sm text-ink-deep truncate min-w-0">{m.full_name || 'Member'}</span>
                  {splitMethod === 'by_share' && checked && (
                    <Input type="number" step="1" min="0" value={inputs[m.id] || ''} onChange={(e) => onSetInput(m.id, e.target.value)} placeholder="1" className="w-16 h-9 bg-cream border-ink-charcoal/20 text-ink-deep" />
                  )}
                  {splitMethod === 'custom' && checked && (
                    <Input type="number" step="0.01" min="0" value={inputs[m.id] || ''} onChange={(e) => onSetInput(m.id, e.target.value)} placeholder="0.00" className="w-20 h-9 bg-cream border-ink-charcoal/20 text-ink-deep" />
                  )}
                  {checked && (
                    <span className="text-xs text-ink-deep/55 w-20 text-right whitespace-nowrap">{formatCurrency(splitAmounts[m.id] || 0, currency)}</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}