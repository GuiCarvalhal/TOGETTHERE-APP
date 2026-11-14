import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock, Plus, Search } from 'lucide-react';
import FormSheet from '@/components/tt/FormSheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { flagEmoji, searchCountries } from '@/lib/passport';
import { useI18n } from '@/lib/i18n';

// Country picker. The mode decides what a tap does (stamp it as visited or add it
// to the bucket list), so one list serves both jobs. Countries stamped by real
// trips are locked: they come from the journey, not from this list.
const MODES = [
  { key: 'visited', labelKey: 'passport.tabVisited' },
  { key: 'bucket', labelKey: 'passport.tabBucket' },
];

export default function CountryPickerSheet({ open, onOpenChange, mode, onModeChange, entries, onAdd, onRemove, busy }) {
  const { t, fmt } = useI18n();
  const [query, setQuery] = useState('');

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const results = useMemo(() => searchCountries(query, fmt.locale), [query, fmt.locale]);

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={t('passport.pickerTitle')}>
      <div className="space-y-3">
        <div className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10">
          {MODES.map(({ key, labelKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => onModeChange(key)}
              aria-pressed={mode === key}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                mode === key ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-deep/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('passport.searchPlaceholder')}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto -mx-2 px-1">
          {results.length === 0 ? (
            <p className="text-xs text-ink-deep/50 px-2 py-4">{t('passport.noResults')}</p>
          ) : results.map(({ code, name }) => {
            const entry = entries[code];
            const locked = entry?.status === 'visited' && entry.source !== 'manual';
            return (
              <button
                key={code}
                type="button"
                disabled={locked || busy === code}
                onClick={() => (entry ? (!locked && onRemove(code)) : onAdd(code, mode))}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-foreground/5 disabled:opacity-60 min-w-0"
              >
                <span className="text-lg leading-none shrink-0">{flagEmoji(code)}</span>
                <span className="min-w-0 flex-1 text-sm text-ink-deep truncate">{name}</span>
                {entry ? (
                  locked ? (
                    <Lock className="w-4 h-4 shrink-0 text-terra-deep" aria-label={t('passport.autoStamped')} />
                  ) : (
                    <Check className="w-4 h-4 shrink-0 text-terra-deep" aria-label={t('passport.added')} />
                  )
                ) : (
                  <Plus className="w-4 h-4 shrink-0 text-ink-deep/30" />
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[0.6875rem] text-ink-deep/45 leading-snug">{t('passport.pickerHint')}</p>
        <Button className="w-full" size="lg" onClick={() => onOpenChange(false)}>{t('passport.done')}</Button>
      </div>
    </FormSheet>
  );
}