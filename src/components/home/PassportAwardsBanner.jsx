import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, ChevronRight, Sparkles, X } from 'lucide-react';
import { buildBadgeState } from '@/lib/achievements/badges';
import { loadPassportAwards, peekPassportAwards } from '@/lib/passportAwardsSummary';
import { countryName } from '@/lib/passport';
import { useI18n } from '@/lib/i18n';

// Home's Passport & Awards line: a single compact card between the NEXT module
// and the gatherings list. It celebrates a new stamp or award since the last
// time the user acknowledged one, and otherwise just reports progress. The data
// is loaded AFTER first paint (idle callback) from the shared summary cache, so
// it never delays Home.
const SEEN_KEY = 'tt-pa-seen-v1';

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

export default function PassportAwardsBanner() {
  const { t, fmt } = useI18n();
  const [data, setData] = useState(peekPassportAwards);
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    if (data) return undefined;
    let cancelled = false;
    const run = () => {
      loadPassportAwards()
        .then((next) => { if (!cancelled) setData(next); })
        .catch(() => {});
    };
    // Deferred so the first paint and Home's own payload always come first.
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(run, { timeout: 1800 })
      : window.setTimeout(run, 700);
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [data]);

  const state = data?.achievements ? buildBadgeState(data.achievements) : null;
  const stamps = data?.stats?.countries || 0;
  const awards = state?.unlockedCount || 0;

  // First time the numbers are known, silently record them as "seen" so nobody is
  // greeted with a celebration for awards they already had.
  useEffect(() => {
    if (!state || seen) return;
    const next = { stamps, awards };
    setSeen(next);
    writeSeen(next);
  }, [state, seen, stamps, awards]);

  useEffect(() => {
    if (!data) return;
    if (!seen || awards > seen.awards || stamps > seen.stamps) return;
    // Nothing new since the last acknowledgement? Keep the stored snapshot fresh.
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
  const latest = [...(data.visited || [])]
    .sort((a, b) => String(b.first_visit || '').localeCompare(String(a.first_visit || '')))[0];

  const acknowledge = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = { stamps, awards };
    setSeen(next);
    writeSeen(next);
  };

  const percent = Math.round((awards / state.total) * 100);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
      <Link
        to="/account/passport-awards"
        aria-label={t('passportAwards.open')}
        className={`block rounded-[1.25rem] border p-3.5 transition active:scale-[0.995] ${
          celebrating
            ? 'border-terra/45 bg-terra/[0.07]'
            : 'border-ink-charcoal/15 bg-card hover:bg-foreground/[0.03]'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`grid place-items-center w-10 h-10 rounded-2xl shrink-0 ${celebrating ? 'bg-terra text-cream' : 'bg-terra/10 text-terra-deep'}`}>
            {celebrating ? <Sparkles className="w-5 h-5" /> : <BookMarked className="w-5 h-5" />}
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-ink-deep truncate">
              {celebrating ? t('passportAwards.celebrateTitle') : t('passportAwards.label')}
            </p>
            <p className="text-[0.6875rem] text-ink-deep/55 mt-0.5 truncate">
              {celebrating
                ? [
                    newStamps === 1 && latest
                      ? t('passportAwards.newStamp', { country: countryName(latest.code, fmt.locale) })
                      : newStamps > 0 ? t('passportAwards.newStamps', { count: newStamps }) : '',
                    newAwards > 0 ? t('passportAwards.newAwards', { count: newAwards }) : '',
                  ].filter(Boolean).join(' · ')
                : [
                    t('passportAwards.countries', { count: stamps }),
                    t('passportAwards.awardsProgress', { unlocked: awards, total: state.total }),
                  ].join(' · ')}
            </p>
          </div>

          {celebrating ? (
            <button
              type="button"
              onClick={acknowledge}
              aria-label={t('passportAwards.dismiss')}
              className="grid place-items-center w-7 h-7 rounded-full bg-foreground/10 text-foreground/55 hover:bg-foreground/20 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <ChevronRight className="w-4 h-4 text-ink-deep/30 shrink-0" />
          )}
        </div>

        <div className="mt-2.5 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
          <div className="h-full rounded-full bg-terra transition-all" style={{ width: `${percent}%` }} />
        </div>
      </Link>
    </section>
  );
}