import React from 'react';
import { Link } from 'react-router-dom';
import { Check, UserRound, UtensilsCrossed, Compass, Bookmark, MailCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// The profile box's ring of steps: one circle per thing that still needs doing.
// A filled terracotta circle with a check means it is done; a dashed circle with
// the step's own icon means it is missing, and the circle links straight to the
// screen where it gets filled in. Purely presentational — the values come from
// the user record and the already-cached passport/inbox data.
export default function ProfileTopicStrip({ user, bucketCount = 0, hasInbox = false }) {
  const { t } = useI18n();
  const list = (value) => (Array.isArray(value) ? value : []);

  const hasName = !!(user?.display_name || user?.full_name);
  const hasHome = !!(user?.home_city || user?.home_place?.place_id);

  const topics = [
    { key: 'personal', to: '/account/personal', Icon: UserRound, label: t('home.topicPersonal'), done: hasName && hasHome },
    { key: 'cuisine', to: '/account/personal', Icon: UtensilsCrossed, label: t('home.topicCuisine'), done: list(user?.dietary_preferences).length > 0 },
    { key: 'interests', to: '/account/personal', Icon: Compass, label: t('home.topicInterests'), done: list(user?.interests).length > 0 },
    { key: 'bucket', to: '/account/passport-awards', Icon: Bookmark, label: t('home.topicBucket'), done: bucketCount > 0 },
    { key: 'inbox', to: '/account/integrations', Icon: MailCheck, label: t('home.topicInbox'), done: hasInbox },
  ];

  const doneCount = topics.filter((tp) => tp.done).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 px-1 pb-2">
        <p className="tt-label text-ink-deep/40">{t('home.profileSteps')}</p>
        <p className="text-[0.625rem] font-semibold text-ink-deep/45">
          {t('home.profileStepsProgress', { done: doneCount, total: topics.length })}
        </p>
      </div>
      <div className="flex items-start gap-2 overflow-x-auto tt-no-scrollbar -mx-1 px-1">
        {topics.map((tp) => (
          <Link
            key={tp.key}
            to={tp.to}
            className="group flex flex-col items-center gap-1.5 shrink-0 w-[60px] focus:outline-none"
          >
            <span
              className={`grid place-items-center w-11 h-11 rounded-full border transition-colors ${
                tp.done
                  ? 'bg-terra text-cream border-terra'
                  : 'bg-cream-pale text-ink-deep/40 border-dashed border-ink-charcoal/40 group-hover:border-terra/60 group-hover:text-terra-deep'
              }`}
            >
              {tp.done ? <Check className="w-4 h-4" /> : <tp.Icon className="w-4 h-4" />}
            </span>
            <span
              className={`text-[0.625rem] leading-tight text-center font-semibold ${
                tp.done ? 'text-ink-deep/60' : 'text-ink-deep/45'
              }`}
            >
              {tp.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}