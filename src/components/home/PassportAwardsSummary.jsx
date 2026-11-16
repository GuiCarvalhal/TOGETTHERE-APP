import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { buildBadgeState } from '@/lib/achievements/badges';
import { countryName, flagEmoji } from '@/lib/passport';
import { useI18n } from '@/lib/i18n';

// Footer of the profile box: two independent lists side by side — the latest
// stamps on the left, the awards on the right — each under its own section
// title. Stamps and awards are different collections: they are never merged
// into one strip. Everything is derived from the passport + achievements
// payload the box already loaded.
const SEEN_KEY = 'tt-pa-seen-v1';
const MAX_PER_COLUMN = 3;

function readSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.stamps !== 'number' || typeof parsed.awards !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSeen(value) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(value)); } catch { /* ignore */ }
}

function Token({ item }) {
  return (
    <span
      title={item.title}
      className="grid place-items-center w-9 h-9 rounded-full ring-2 ring-card bg-cream-pale border border-ink-charcoal/20 text-terra-deep shrink-0"
    >
      {item.glyph}
    </span>
  );
}

function Extra({ count }) {
  if (count <= 0) return null;
  return (
    <span className="grid place-items-center w-9 h-9 rounded-full ring-2 ring-card bg-cream-pale border border-ink-charcoal/15 text-[0.625rem] font-semibold text-ink-deep shrink-0">
      +{count}
    </span>
  );
}

function Column({ title, meta, items, total }) {
  return (
    <div className="min-w-0 px-4 sm:px-5 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="tt-label text-ink-deep/40 truncate">{title}</p>
        <p className="text-[0.625rem] font-semibold text-ink-deep/55 shrink-0">{meta}</p>
      </div>
      <div className="flex items-center -space-x-2 mt-2.5 min-w-0">
        {items.map((item) => <Token key={item.key} item={item} />)}
        <Extra count={total - items.length} />
      </div>
    </div>
  );
}

export default function PassportAwardsSummary({ data }) {
  const { t, fmt } = useI18n();
  const [seen, setSeen] = useState(readSeen);

  const state = data?.achievements ? buildBadgeState(data.achievements) : null;
  const stamps = data?.stats?.countries || 0;
  const awards = state?.unlockedCount || 0;

  // First time the numbers are known, record them as seen so nobody is greeted
  // with a celebration for awards they already had.
  useEffect(() => {
    if (!state || seen) return;
    const next = { stamps, awards };
    setSeen(next);
    writeSeen(next);
  }, [state, seen, stamps, awards]);

  useEffect(() => {
    if (!data || !seen) return;
    if (awards > seen.awards || stamps > seen.stamps) return;
    if (stamps !== seen.stamps || awards !== seen.awards) {
      const next = { stamps, awards };
      setSeen(next);
      writeSeen(next);
    }
  }, [data, seen, stamps, awards]);

  if (!data || !state) return null;

  const newAwards = seen ? Math.max(0, awards - seen.awards) : 0;
  const newStamps = seen ? Math.max(0, stamps - seen.stamps) : 0;
  const celebrating = newAwards > 0 || newStamps > 0;

  const visited = [...(data.visited || [])]
    .sort((a, b) => String(b.first_visit || '').localeCompare(String(a.first_visit || '')));
  const stampItems = visited.map((v) => ({
    key: `c:${v.code}`,
    title: countryName(v.code, fmt.locale),
    glyph: <span className="text-sm leading-none">{flagEmoji(v.code)}</span>,
  }));

  // Awards carry no timestamp, so "latest" is the highest tier reached per topic.
  const bestByTopic = new Map();
  state.unlocked.forEach((b) => {
    const current = bestByTopic.get(b.topic.id);
    if (!current || b.level > current.level) bestByTopic.set(b.topic.id, b);
  });
  const awardItems = [...bestByTopic.values()]
    .sort((a, b) => b.level - a.level || a.topic.id.localeCompare(b.topic.id))
    .map((b) => {
      const Icon = b.topic.Icon;
      return {
        key: `b:${b.id}`,
        title: `${t('badges.topic.' + b.topic.id)} · ${t('badges.level' + b.level)}`,
        glyph: <Icon className="w-4 h-4" />,
      };
    });

  return (
    <Link
      to="/account/passport-awards"
      aria-label={t('passportAwards.open')}
      className="block border-t border-ink-charcoal/10 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-1.5 px-4 sm:px-5 pt-3.5">
        <p className="tt-label text-ink-deep/40">{t('passportAwards.label')}</p>
        {celebrating && <Sparkles className="w-3.5 h-3.5 text-terra-deep" />}
        <ChevronRight className="w-4 h-4 text-ink-deep/30 ml-auto shrink-0" />
      </div>

      <div className="grid grid-cols-2 divide-x divide-ink-charcoal/10">
        <Column
          title={t('passportAwards.tabPassport')}
          meta={t('passportAwards.countries', { count: stamps })}
          items={stampItems.slice(0, MAX_PER_COLUMN)}
          total={stampItems.length}
        />
        <Column
          title={t('passportAwards.tabAwards')}
          meta={`${awards}/${state.total}`}
          items={awardItems.slice(0, MAX_PER_COLUMN)}
          total={awardItems.length}
        />
      </div>
    </Link>
  );
}