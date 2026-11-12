import React from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// One badge tile. Unlocked tiles carry the level's warm intensity and the icon;
// locked tiles are muted and show the requirement instead of a counter, so the
// two states are unmistakable at a glance.
const LEVEL_TONE = {
  1: 'bg-terra/10 text-terra-deep border-terra/25',
  2: 'bg-terra/15 text-terra-deep border-terra/30',
  3: 'bg-terra/25 text-terra-deep border-terra/40',
  4: 'bg-terra/40 text-ink-deep border-terra/50',
  5: 'bg-terra/70 text-cream border-terra/70',
  6: 'bg-terra text-cream border-terra-deep',
};

export default function BadgeCard({ badge, locked = false }) {
  const { t } = useI18n();
  const Icon = badge.topic.Icon;
  const name = `${t(`badges.topic.${badge.topic.id}`)} · ${t(`badges.level${badge.level}`)}`;
  const requirement = t('badges.requirement', {
    count: badge.target,
    unit: t(badge.topic.unitKey, { count: badge.target }),
  });

  return (
    <div
      className={`rounded-2xl border p-3 min-w-0 ${locked ? 'border-ink-charcoal/15 bg-foreground/5' : ''}`}
      title={name}
    >
      <div className="flex items-start gap-2 min-w-0">
        <span
          className={`grid place-items-center w-9 h-9 rounded-full border shrink-0 ${
            locked ? 'bg-foreground/5 text-ink-deep/30 border-ink-charcoal/15' : LEVEL_TONE[badge.level]
          }`}
        >
          {locked ? <Lock className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold leading-tight ${locked ? 'text-ink-deep/45' : 'text-ink-deep'}`}>
            {t(`badges.topic.${badge.topic.id}`)}
          </p>
          <p className={`text-[0.6875rem] leading-tight mt-0.5 ${locked ? 'text-ink-deep/35' : 'text-terra-deep/80'}`}>
            {t(`badges.level${badge.level}`)}
          </p>
        </div>
      </div>
      <p className={`text-[0.6875rem] mt-2 leading-snug break-words ${locked ? 'text-ink-deep/40' : 'text-ink-deep/60'}`}>
        {locked ? requirement : t('badges.progress', { current: badge.target, target: badge.target })}
      </p>
    </div>
  );
}