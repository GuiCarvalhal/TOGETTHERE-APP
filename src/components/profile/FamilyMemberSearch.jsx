import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Search } from 'lucide-react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

const MAX_RESULTS = 8;

// Typeahead over the people from the user's gatherings. Nothing is rendered until
// a name is typed and at most MAX_RESULTS rows show at once, so the family card
// stays compact no matter how many people the user has traveled with.
export default function FamilyMemberSearch({ rows, selectedIds = [], addingUid, onPick }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return [];
    return rows
      .filter(({ m }) => (m.full_name || '').toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [q, rows]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-ink-deep/40 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('family.searchPlaceholder')}
          className="pl-8 bg-cream-pale border-ink-charcoal/20 text-ink-deep"
        />
      </div>

      {!q ? (
        <p className="text-xs text-ink-deep/45">{t('family.searchHint')}</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-ink-deep/45">{t('family.noResults')}</p>
      ) : (
        <div className="space-y-1.5">
          {results.map(({ m, inAnother, theirFam }) => {
            const selected = selectedIds.includes(m.user_id);
            const adding = addingUid === m.user_id;
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={inAnother || adding}
                onClick={() => onPick(m)}
                className="w-full flex items-center gap-2.5 rounded-2xl border border-ink-charcoal/12 bg-card p-2 text-left transition-colors hover:bg-foreground/5 disabled:opacity-60"
              >
                <MemberAvatar member={m} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-deep truncate">{m.full_name}</span>
                  {inAnother && (
                    <span className="block text-[11px] text-ink-deep/45">
                      {t('family.inAnotherFamily', { name: theirFam?.name || '' })}
                    </span>
                  )}
                </span>
                {inAnother ? null : adding ? (
                  <Loader2 className="w-4 h-4 animate-spin text-ink-deep/50 shrink-0" />
                ) : selected ? (
                  <Check className="w-4 h-4 text-terra shrink-0" />
                ) : (
                  <Plus className="w-4 h-4 text-ink-deep/40 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}