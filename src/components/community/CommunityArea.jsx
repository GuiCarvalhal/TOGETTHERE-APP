import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import { Button } from '@/components/ui/button';
import BadgeCard from '@/components/community/BadgeCard';
import { buildBadgeState } from '@/lib/achievements/badges';
import { useI18n } from '@/lib/i18n';
import { Award, Lock, Sparkles } from 'lucide-react';

// Community & Awards: the motivational half of the account flow. One server call
// returns the user's stats; the catalog turns them into badges, so nothing here
// recomputes progress on scroll and adding a badge never touches this file.
export default function CommunityArea() {
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('getAchievements', {});
        if (cancelled) return;
        setStats(res.data?.stats || null);
      } catch {
        if (!cancelled) setError(t('badges.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  const state = useMemo(() => (stats ? buildBadgeState(stats) : null), [stats]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-[1.25rem]" tone="cream" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" tone="cream" />)}
        </div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="tt-card p-6 text-center space-y-3">
        <p className="text-sm text-ink-deep/60">{error || t('badges.error')}</p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>{t('common.tryAgain')}</Button>
      </div>
    );
  }

  const percent = Math.round((state.unlockedCount / state.total) * 100);

  return (
    <div className="space-y-4">
      <div className="tt-card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-terra/10 text-terra-deep shrink-0">
            <Award className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-ink-deep leading-tight">{t('badges.title')}</p>
            <p className="text-xs text-ink-deep/55 mt-0.5">{t('badges.intro')}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-ink-deep/70">
              {t('badges.of', { unlocked: state.unlockedCount, total: state.total })}
            </p>
            <span className="text-xs font-bold text-terra-deep">{percent}%</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-foreground/10 overflow-hidden">
            <div className="h-full rounded-full bg-terra transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <section>
        <p className="tt-label text-ink-deep/45 mb-2">{t('badges.inProgress')}</p>
        {state.inProgress.length === 0 ? (
          <p className="text-xs text-ink-deep/50">{t('badges.allDone')}</p>
        ) : (
          <div className="tt-card divide-y divide-ink-charcoal/10">
            {state.inProgress.map((badge) => {
              const Icon = badge.topic.Icon;
              return (
                <div key={badge.id} className="flex items-center gap-3 p-3 min-w-0">
                  <span className="grid place-items-center w-8 h-8 rounded-full bg-terra/10 text-terra-deep shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-bold text-ink-deep truncate">
                        {t(`badges.topic.${badge.topic.id}`)} · {t(`badges.level${badge.level}`)}
                      </p>
                      <span className="text-[0.6875rem] font-semibold text-ink-deep/50 shrink-0">
                        {t('badges.progress', { current: badge.current, target: badge.target })}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                      <div className="h-full rounded-full bg-terra" style={{ width: `${Math.round(badge.progress * 100)}%` }} />
                    </div>
                    <p className="text-[0.6875rem] text-ink-deep/45 mt-1">
                      {t('badges.requirement', {
                        count: badge.target,
                        unit: t(badge.topic.unitKey, { count: badge.target }),
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <p className="tt-label text-ink-deep/45 mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> {t('badges.unlocked')} ({state.unlockedCount})
        </p>
        {state.unlocked.length === 0 ? (
          <p className="text-xs text-ink-deep/50">{t('badges.none')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {state.unlocked.map((badge) => <BadgeCard key={badge.id} badge={badge} />)}
          </div>
        )}
      </section>

      <section>
        <p className="tt-label text-ink-deep/45 mb-2 flex items-center gap-1.5">
          <Lock className="w-3 h-3" /> {t('badges.locked')} ({state.locked.length})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {state.locked.map((badge) => <BadgeCard key={badge.id} badge={badge} locked />)}
        </div>
      </section>
    </div>
  );
}