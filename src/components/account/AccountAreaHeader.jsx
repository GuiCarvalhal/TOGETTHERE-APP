import React from 'react';
import { useI18n } from '@/lib/i18n';

// Title block shared by every account area page, rendered under the action bar
// so the bar always sits between the app header and this content.
export default function AccountAreaHeader({ Icon, titleKey, descKey }) {
  const { t } = useI18n();

  return (
    <div className="mt-4 mb-4 min-w-0">
      <h1 className="font-display text-2xl font-bold text-ink-deep flex items-center gap-2 min-w-0">
        <span className="grid place-items-center w-8 h-8 rounded-full bg-terra/10 text-terra-deep shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="truncate">{t(titleKey)}</span>
      </h1>
      <p className="text-sm text-ink-deep/55 mt-1.5">{t(descKey)}</p>
    </div>
  );
}