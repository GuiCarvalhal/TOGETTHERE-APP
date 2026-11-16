import React, { useEffect, useState } from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import ProfileTopicStrip from '@/components/home/ProfileTopicStrip';
import PassportAwardsSummary from '@/components/home/PassportAwardsSummary';
import { loadPassportAwards, peekPassportAwards } from '@/lib/passportAwardsSummary';
import { useI18n } from '@/lib/i18n';

// The profile box reads as one surface: who you are on top, the steps that still
// need doing in the middle (circles), and the latest passport/awards on the
// bottom. Counts live in the gatherings box, so they are not repeated here.
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
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <MemberAvatar member={user} size="lg" />
        <div className="min-w-0">
          <p className="tt-label text-ink-deep/40">{t('home.profileCaixaLabel')}</p>
          <p className="font-display text-lg font-bold text-ink-deep leading-tight truncate">
            {displayNameOf(user, t('account.member'))}
          </p>
          {user?.email ? (
            <p className="text-xs text-ink-deep/50 truncate mt-0.5">{user.email}</p>
          ) : null}
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-4">
        <ProfileTopicStrip user={user} bucketCount={bucketCount} hasInbox={hasInbox} />
      </div>

      <div className="mt-auto">
        <PassportAwardsSummary data={awards} />
      </div>
    </section>
  );
}