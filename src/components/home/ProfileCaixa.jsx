import React, { useEffect, useState } from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import ProfileTopicStrip from '@/components/home/ProfileTopicStrip';
import PassportAwardsSummary from '@/components/home/PassportAwardsSummary';
import { loadPassportAwards, peekPassportAwards } from '@/lib/passportAwardsSummary';
import { useI18n } from '@/lib/i18n';

// The profile box reads as one surface: who you are on top (name and address
// first, the avatar on the right), then the steps that still need doing and the
// latest passport/awards — stacked on phones, side by side on desktop. Counts
// live in the gatherings box, so they are not repeated here.
//
// The name shown is the profile name, never the mailbox: the platform seeds
// full_name with the email local part for some accounts, so a value that equals
// the address (or contains an @) is skipped in favour of the fallback label.
function displayNameOf(user, fallback) {
  const emailLocal = String(user?.email || '').split('@')[0].toLowerCase();
  for (const raw of [user?.display_name, user?.full_name]) {
    const value = String(raw || '').trim();
    if (!value || value.includes('@')) continue;
    if (value.toLowerCase() === emailLocal) continue;
    return value;
  }
  return fallback;
}

export default function ProfileCaixa({ user, hasInbox = false }) {
  const { t } = useI18n();
  // Passport + awards are read AFTER the first paint (idle), from the shared
  // short-lived cache, so this box never delays Home.
  const [awards, setAwards] = useState(peekPassportAwards);

  useEffect(() => {
    if (awards) return undefined;
    let cancelled = false;
    const run = () => {
      loadPassportAwards()
        .then((next) => { if (!cancelled) setAwards(next); })
        .catch(() => {});
    };
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(run, { timeout: 1800 })
      : window.setTimeout(run, 700);
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [awards]);

  const bucketCount = Array.isArray(awards?.bucket) ? awards.bucket.length : 0;

  return (
    <section className="tt-card-hairline overflow-hidden flex flex-col">
      {/* Identity first, avatar on the right: the name and the address are the
          information, the picture is the marker. */}
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wide text-terra-coral">{t('home.profileCaixaLabel')}</p>
          <p className="font-display text-xl font-bold text-ink-deep leading-tight truncate mt-0.5">
            {displayNameOf(user, t('account.member'))}
          </p>
          {user?.email ? (
            <p className="text-xs text-ink-deep/50 truncate mt-0.5">{user.email}</p>
          ) : null}
        </div>
        <MemberAvatar member={user} size="lg" className="shrink-0" />
      </div>

      {/* Steps and Passport/Awards: one row on desktop, two blocks on phones. */}
      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-ink-charcoal/10 border-t border-ink-charcoal/10">
        <div className="px-3 sm:px-4 py-3.5 min-w-0">
          <ProfileTopicStrip user={user} bucketCount={bucketCount} hasInbox={hasInbox} />
        </div>
        <PassportAwardsSummary data={awards} />
      </div>
    </section>
  );
}