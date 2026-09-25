import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { currencyLabel } from '@/lib/gatheringHelpers';

// Currency selector showing "USD — US Dollar" style labels. `options` is a list
// of currency codes; the selected currency stays visible in the trigger.
export default function CurrencySelect({ value, onChange, options, triggerClass = '' }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`bg-cream-pale border-ink-charcoal/20 text-ink-deep ${triggerClass}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((c) => (
          <SelectItem key={c} value={c}>{currencyLabel(c)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}