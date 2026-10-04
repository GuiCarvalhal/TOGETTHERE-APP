import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Route, Receipt, Sparkles, ArrowRight } from 'lucide-react';
import AppHeader from '@/components/tt/AppHeader';
import { useI18n } from '@/lib/i18n';

export default function HowItWorks() {
  const { t } = useI18n();
  const PILLARS = [
    {
      icon: Route,
      title: t('howItWorks.pillar1Title'),
      tagline: t('howItWorks.pillar1Tagline'),
      body: t('howItWorks.pillar1Body'),
      points: t('howItWorks.pillar1Points'),
    },
    {
      icon: Receipt,
      title: t('howItWorks.pillar2Title'),
      tagline: t('howItWorks.pillar2Tagline'),
      body: t('howItWorks.pillar2Body'),
      points: t('howItWorks.pillar2Points'),
    },
    {
      icon: Sparkles,
      title: t('howItWorks.pillar3Title'),
      tagline: t('howItWorks.pillar3Tagline'),
      body: t('howItWorks.pillar3Body'),
      points: t('howItWorks.pillar3Points'),
    },
  ];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-8">
        <p className="tt-label text-terra-coral mb-3">{t('howItWorks.label')}</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight tt-text-balance">
          {t('howItWorks.title')}
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
          {t('howItWorks.intro')}
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 space-y-5">
        {PILLARS.map((p) => (
          <div key={p.title} className="tt-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-terra/15 border border-terra/25 flex items-center justify-center shrink-0">
                <p.icon className="w-5 h-5 text-terra-coral" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-foreground">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.tagline}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
            <ul className="mt-3 space-y-1.5">
              {p.points.map((pt) => (
                <li key={pt} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-terra shrink-0" /> {pt}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 text-center">
        <Button asChild className="bg-terra hover:bg-terra-deep text-cream rounded-full">
          <Link to="/">{t('howItWorks.startPlanning')} <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
        </Button>
      </section>
    </div>
  );
}