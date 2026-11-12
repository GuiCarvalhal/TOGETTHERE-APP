import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { accountAreaPath } from '@/components/account/accountAreas';

// One large card on the Account hub — a whole-area tap target (never a menu
// row), so the first step of the account flow reads as four clear choices.
export default function AccountHubCard({ area }) {
  const { t } = useI18n();
  const Icon = area.Icon;

  return (
    <Link
      to={accountAreaPath(area.key)}
      className="tt-card group flex items-center gap-4 p-4 sm:p-5 transition hover:border-terra/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid place-items-center w-12 h-12 rounded-2xl bg-terra/10 text-terra-deep shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-base font-bold text-ink-deep leading-tight">
          {t(area.titleKey)}
        </span>
        <span className="block text-xs text-ink-deep/55 leading-relaxed mt-1">
          {t(area.descKey)}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-ink-deep/35 transition-colors group-hover:text-terra-deep" />
    </Link>
  );
}