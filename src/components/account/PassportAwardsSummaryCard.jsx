import React, { useEffect, useState } from 'react';
import { Award, Globe2, Plane, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/tt/Skeleton';
import AvatarStack from '@/components/tt/AvatarStack';
import { buildBadgeState } from '@/lib/achievements/badges';
import { loadPassportAwards, peekPassportAwards } from '@/lib/passportAwardsSummary';
import { loadCommunitySignals, peekCommunitySignals, peersForBadge, peersForCountry } from '@/lib/communitySignals';
import { countryName } from '@/lib/passport';
import { useI18n } from '@/lib/i18n';

// Compact status strip for Passport & Awards: three tappable counters plus the
// one line that matters for the section you are on — the awards closest to
// unlocking, the trips still ahead, or the wishlist places people you travelled
// with have already been to. Everything the section lists in full, condensed to
// what is coming next.
function daysUntil(date) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

export default function PassportAwardsSummaryCard({ section, onGo }) {
  const { t, fmt } = useI18n();
  const [data, setData] = useState(peekPassportAwards);
  const [signals, setSignals] = useState(peekCommunitySignals);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadPassportAwards().catch(() => null),
      loadCommunitySignals().catch(() => null),
    ]).then(([awards, community]) => {
      if (cancelled) return;
      if (awards) setData(awards);
      if (community) setSignals(community);
    });
    return () => { cancelled = true; };
  }, []);

  if (!data) return <Skeleton className="h-24 w-full rounded-[1.25rem]" tone="cream" />;

  const badges = data.achievements ? buildBadgeState(data.achievements) : null;
  const peers = signals?.peers || [];
  const trips = signals?.upcoming || [];
  const bucket = data.bucket || [];

  const chips = [
    {
      key: 'awards',
      Icon: Award,
      value: badges ? `${badges.unlockedCount}/${badges.total}` : '—',
      label: t('passportAwards.tabAwards'),
    },
    {
      key: 'passport',
      Icon: Globe2,
      value: String(data.stats?.countries || 0),
      label: t('passport.statCountries'),
    },
    {
      key: 'bucket',
      Icon: Sparkles,
      value: String(data.stats?.bucket || 0),
      label: t('passport.tabBucket'),
    },
  ];

  // The section's "what is next" line(s).
  let label = t('passportAwards.upNext');
  let rows = [];
  if (section === 'awards') {
    label = t('passportAwards.closest');
    rows = (badges?.inProgress || [])
      .slice()
      .sort((a, b) => (a.target - a.current) - (b.target - b.current))
      .slice(0, 2)
      .map((badge) => ({
        key: badge.id,
        Icon: badge.topic.Icon,
        title: `${t(`badges.topic.${badge.topic.id}`)} · ${t(`badges.level${badge.level}`)}`,
        sub: `${t('passportAwards.toGo', { count: Math.max(0, badge.target - badge.current) })} · ${badge.current}/${badge.target}`,
        people: peersForBadge(peers, badge),
      }));
  } else if (section === 'passport') {
    rows = trips.slice(0, 2).map((trip) => {
      const days = daysUntil(trip.date);
      const when = days && days > 0
        ? `${fmt.formatDate(trip.date, { month: 'short', day: 'numeric' })} · ${t('passportAwards.inDays', { count: days })}`
        : fmt.formatDate(trip.date, { month: 'short', day: 'numeric' });
      return {
        key: trip.id,
        Icon: Plane,
        title: trip.name || t('common.untitled'),
        sub: when,
      };
    });
    if (!rows.length) {
      rows = [{
        key: 'none',
        Icon: Globe2,
        title: t('passportAwards.noUpcoming'),
        sub: t('passportAwards.countries', { count: data.stats?.countries || 0 }),
      }];
    }
  } else {
    label = t('passportAwards.beenThereLabel');
    rows = bucket
      .map((row) => ({ code: row.code, people: peersForCountry(peers, row.code) }))
      .filter((row) => row.people.length > 0)
      .sort((a, b) => b.people.length - a.people.length)
      .slice(0, 2)
      .map((row) => ({
        key: row.code,
        Icon: Sparkles,
        title: countryName(row.code, fmt.locale),
        sub: t('passportAwards.beenThere', { count: row.people.length }),
        people: row.people,
      }));
    if (!rows.length) {
      rows = [{
        key: 'none',
        Icon: Sparkles,
        title: t('passportAwards.bucketCount', { count: data.stats?.bucket || 0 }),
        sub: t('passportAwards.beenThereEmpty'),
      }];
    }
  }

  return (
    <div className="tt-card p-2.5 space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {chips.map(({ key, Icon, value, label: chipLabel }) => (
          <button
            key={key}
            type="button"
            onClick={() => onGo(key)}
            aria-pressed={section === key}
            className={`rounded-xl border px-2 py-1.5 text-left min-w-0 transition-colors ${
              section === key
                ? 'border-terra/40 bg-terra/10 text-terra-deep'
                : 'border-ink-charcoal/12 bg-foreground/[0.03] text-ink-deep/60 hover:bg-foreground/[0.06]'
            }`}
          >
            <span className="flex items-center gap-1 min-w-0">
              <Icon className="w-3 h-3 shrink-0" />
              <span className="font-display text-sm font-bold leading-none truncate">{value}</span>
            </span>
            <span className="tt-label block mt-1 truncate opacity-80">{chipLabel}</span>
          </button>
        ))}
      </div>

      <div className={`pt-1.5 border-t border-ink-charcoal/10 ${rows.length ? '' : 'hidden'}`}>
        <p className="tt-label text-ink-deep/40 mb-0.5">{label}</p>
        {rows.map(({ key, Icon, title, sub, people }) => (
          <div key={key} className="flex items-center gap-2 py-1 min-w-0">
            <span className="grid place-items-center w-7 h-7 rounded-full bg-terra/10 text-terra-deep shrink-0">
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink-deep truncate">{title}</p>
              <p className="text-[0.6875rem] text-ink-deep/50 truncate">{sub}</p>
            </div>
            {people?.length ? <AvatarStack people={people} max={2} size="xs" ringClass="ring-card" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}