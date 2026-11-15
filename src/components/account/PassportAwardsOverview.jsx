import React, { useEffect, useState } from 'react';
import { Award, ChevronRight, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/tt/Skeleton';
import { Button } from '@/components/ui/button';
import PassportCover from '@/components/passport/PassportCover';
import StampArt from '@/components/passport/stamps/StampArt';
import { buildBadgeState } from '@/lib/achievements/badges';
import { loadPassportAwards, peekPassportAwards } from '@/lib/passportAwardsSummary';
import { useStampStyle } from '@/lib/stampStyle';
import { countryName } from '@/lib/passport';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';

// Overview of the merged area: the passport book, the award shelf progress and
// the latest stamps, each one tap from its own section below.
export default function PassportAwardsOverview({ onGo }) {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const style = useStampStyle();
  const [data, setData] = useState(peekPassportAwards);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) return undefined;
    let cancelled = false;
    loadPassportAwards()
      .then((next) => { if (!cancelled) { setData(next); setError(''); } })
      .catch(() => { if (!cancelled) setError(t('passport.loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [data, t]);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full rounded-[1.25rem]" tone="cream" />
        <Skeleton className="h-24 w-full rounded-[1.25rem]" tone="cream" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="tt-card p-6 text-center">
        <p className="text-sm text-ink-deep/60">{error || t('passport.loadFailed')}</p>
      </div>
    );
  }

  const badges = data.achievements ? buildBadgeState(data.achievements) : null;
  const percent = badges ? Math.round((badges.unlockedCount / badges.total) * 100) : 0;
  const latest = [...(data.visited || [])]
    .sort((a, b) => String(b.first_visit || '').localeCompare(String(a.first_visit || '')))
    .slice(0, 4);

  return (
    <div className="space-y-4">
      <PassportCover name={user?.full_name || user?.email || ''} stats={data.stats} />

      {badges ? (
        <button
          type="button"
          onClick={() => onGo('awards')}
          className="tt-card w-full p-4 sm:p-5 text-left hover:bg-foreground/[0.03] transition"
        >
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-2xl bg-terra/10 text-terra-deep shrink-0">
              <Award className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-ink-deep truncate">{t('badges.title')}</p>
              <p className="text-xs text-ink-deep/55 mt-0.5">
                {t('passportAwards.awardsProgress', { unlocked: badges.unlockedCount, total: badges.total })}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-deep/30 shrink-0" />
          </div>
          <div className="mt-3 h-2 rounded-full bg-foreground/10 overflow-hidden">
            <div className="h-full rounded-full bg-terra transition-all" style={{ width: `${percent}%` }} />
          </div>
        </button>
      ) : null}

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="tt-label text-ink-deep/45 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> {t('passportAwards.recent')}
          </p>
          <button
            type="button"
            onClick={() => onGo('passport')}
            className="text-[0.6875rem] font-semibold text-terra-deep inline-flex items-center gap-0.5"
          >
            {t('passportAwards.viewPassport')} <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {latest.length === 0 ? (
          <div className="tt-card p-4 text-center space-y-2">
            <p className="text-xs text-ink-deep/55 leading-relaxed">{t('passportAwards.emptyStamps')}</p>
            <Button size="sm" variant="secondary" onClick={() => onGo('passport')}>
              {t('passport.addVisited')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {latest.map((row) => (
              <div key={row.code} className="min-w-0 text-terra-deep">
                <StampArt
                  code={row.code}
                  name={countryName(row.code, fmt.locale)}
                  caption={row.first_visit ? fmt.formatDate(row.first_visit, { month: 'short', year: 'numeric' }) : t('passport.stamped')}
                  style={style}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => onGo('bucket')}
        className="tt-card w-full p-4 text-left hover:bg-foreground/[0.03] transition flex items-center gap-3"
      >
        <span className="grid place-items-center w-9 h-9 rounded-2xl bg-terra/10 text-terra-deep shrink-0">
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink-deep truncate">{t('passport.tabBucket')}</p>
          <p className="text-[0.6875rem] text-ink-deep/50">
            {t('passportAwards.bucketCount', { count: data.stats.bucket || 0 })}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-ink-deep/30 shrink-0" />
      </button>
    </div>
  );
}