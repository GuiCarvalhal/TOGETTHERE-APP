import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { accountAreaPath } from '@/components/account/accountAreas';

// One row in the account menu: a compact, vertically stacked list item. The
// list pattern scales — a new area is one more row in its section, never a new
// card competing for space on the hub.
export default function AccountMenuRow({ area, last = false }) {
  const { t } = useI18n();
  const Icon = area.Icon;

  return (
    <Link
      to={accountAreaPath(area.key)}
      className={`flex items-center gap-3 px-4 min-h-[58px] py-3 transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        last ? '' : 'border-b border-ink-charcoal/10'
      }`}
    >
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-terra/10 text-terra-deep shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-deep leading-tight truncate">
          {t(area.titleKey)}
        </span>
        <span className="block text-xs text-ink-deep/50 leading-snug mt-0.5 truncate">
          {t(area.descKey)}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-ink-deep/30" />
    </Link>
  );
}