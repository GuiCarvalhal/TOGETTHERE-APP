import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import MemberAvatar from '@/components/tt/MemberAvatar';
import AvatarStack from '@/components/tt/AvatarStack';
import { formatCurrency } from '@/lib/gatheringHelpers';

// Back-compat export kept for any external importer; no longer used here.
export function groupFamilies(members, familyMap = {}) {
  const groups = {};
  members.forEach((m) => {
    const key = familyMap[m.user_id] || m.id;
    (groups[key] = groups[key] || []).push(m);
  });
  return Object.values(groups).sort((a, b) => (a[0].full_name || '').localeCompare(b[0].full_name || ''));
}

// Renders split UNITS (individuals + family groups) as normal page-flow rows.
// A family is ONE selectable split unit (one checkbox, one share), shown with
// an avatar stack +N. No nested scroll box — the page itself scrolls, so every
// person stays visible.
export default function FamilySplitTable({
  units,
  selected,
  inputs,
  splitMethod,
  unitAmounts,
  currency,
  onToggleUnit,
  onSetUnitInput,
}) {
  return (
    <div className="space-y-1.5">
      {units.map((u) => {
        const checked = selected.includes(u.key);
        const isFamily = u.type === 'family';
        const amount = unitAmounts[u.key] || 0;
        return (
          <div
            key={u.key}
            className={`flex items-center gap-2.5 py-1.5 min-w-0 ${isFamily ? 'rounded-xl bg-cream-pale/60 px-2.5 border border-ink-charcoal/10' : ''}`}
          >
            <Checkbox checked={checked} onCheckedChange={() => onToggleUnit(u.key, !checked)} />
            {isFamily ? (
              <AvatarStack people={u.members} max={4} size="xs" />
            ) : (
              <MemberAvatar member={u.members[0]} size="xs" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-deep truncate min-w-0">
                {isFamily ? (u.name || 'Family') : (u.members[0].full_name || 'Member')}
              </p>
              {isFamily && (
                <p className="text-[0.625rem] text-ink-deep/45 truncate min-w-0">
                  {u.members.map((m) => m.full_name || 'Member').join(', ')}
                </p>
              )}
            </div>
            {splitMethod === 'by_share' && checked && (
              <Input
                type="number" step="1" min="0"
                value={inputs[u.key] ?? ''}
                onChange={(e) => onSetUnitInput(u.key, e.target.value)}
                placeholder="1"
                className="w-16 h-9 bg-cream-pale border-ink-charcoal/20 text-ink-deep shrink-0"
              />
            )}
            {splitMethod === 'custom' && checked && (
              <Input
                type="number" step="0.01" min="0"
                value={inputs[u.key] ?? ''}
                onChange={(e) => onSetUnitInput(u.key, e.target.value)}
                placeholder="0.00"
                className="w-16 h-9 bg-cream-pale border-ink-charcoal/20 text-ink-deep shrink-0"
              />
            )}
            {checked && (
              <span className="text-xs text-ink-deep/55 w-16 text-right whitespace-nowrap shrink-0">
                {formatCurrency(amount, currency)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}