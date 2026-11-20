import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import { DEFAULT_HOME_LAYOUT, moveHomeBox, normalizeHomeLayout, toggleHomeBox } from '@/lib/homeLayout';

// Home layout preference: the boxes Home shows, and in which order.
// Persisted on the User record (home_layout) via updateMe, so it follows the user
// across devices — the same mechanism the distance unit uses. Every change saves
// immediately and re-reads the user, so Home reflects it on the next visit
// without a reload. A user who has never opened this gets DEFAULT_HOME_LAYOUT.
export default function HomeLayoutSettings() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const [layout, setLayout] = useState(() => normalizeHomeLayout(user?.home_layout));

  useEffect(() => {
    setLayout(normalizeHomeLayout(user?.home_layout));
  }, [user?.home_layout]);

  async function persist(next) {
    setLayout(next);
    await base44.auth.updateMe({ home_layout: next });
    if (refreshUser) await refreshUser();
  }

  const BOX_LABELS = {
    next: t('home.boxNext'),
    gatherings: t('home.boxGatherings'),
    profile: t('home.boxProfile'),
    imports: t('home.boxImports'),
  };

  return (
    <div className="tt-card p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2">
        <LayoutGrid className="w-4 h-4 mt-0.5 text-terra-deep shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-deep/60">{t('home.customizeTitle')}</p>
          <p className="text-[0.6875rem] text-ink-deep/45 leading-snug mt-0.5">{t('home.customizeDesc')}</p>
        </div>
      </div>

      <ul className="divide-y divide-ink-charcoal/10">
        {layout.order.map((key, index) => {
          const visible = !layout.hidden.includes(key);
          return (
            <li key={key} className="flex items-center gap-2 py-2 min-w-0">
              <span className={`flex-1 min-w-0 truncate text-sm font-semibold ${visible ? 'text-ink-deep' : 'text-ink-deep/40'}`}>
                {BOX_LABELS[key]}
              </span>
              <button
                type="button"
                onClick={() => persist(moveHomeBox(layout, key, -1))}
                disabled={index === 0}
                aria-label={`${t('home.moveUp')} — ${BOX_LABELS[key]}`}
                className="grid place-items-center w-8 h-8 rounded-full border border-ink-charcoal/15 text-ink-deep/70 hover:bg-foreground/5 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => persist(moveHomeBox(layout, key, 1))}
                disabled={index === layout.order.length - 1}
                aria-label={`${t('home.moveDown')} — ${BOX_LABELS[key]}`}
                className="grid place-items-center w-8 h-8 rounded-full border border-ink-charcoal/15 text-ink-deep/70 hover:bg-foreground/5 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => persist(toggleHomeBox(layout, key))}
                aria-pressed={visible}
                aria-label={`${visible ? t('home.hide') : t('home.show')} — ${BOX_LABELS[key]}`}
                className={`grid place-items-center w-8 h-8 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${visible ? 'border-terra/30 bg-terra/10 text-terra-deep' : 'border-ink-charcoal/15 text-ink-deep/40 hover:bg-foreground/5'}`}
              >
                {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => persist({ ...DEFAULT_HOME_LAYOUT })}
        className="text-xs font-semibold text-terra-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {t('home.resetLayout')}
      </button>
    </div>
  );
}