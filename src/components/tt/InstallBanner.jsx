import React from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStandaloneApp } from '@/hooks/useStandaloneApp';

// Simple install-prompt banner for the Home page. The whole card is a single
// link to /add-to-home-screen. Uses design-system tokens so it adapts to
// light/dark mode. Hidden when the app is already running as an installed
// app (standalone display mode) — no point prompting then. No dismiss logic.
export default function InstallBanner() {
  const { t } = useI18n();
  const standalone = useStandaloneApp();
  if (standalone) return null;

  return (
    <Link
      to="/add-to-home-screen"
      aria-label={t('home.installBannerAria')}
      className="tt-card p-4 flex items-center gap-3.5 rounded-[1.25rem] hover:bg-foreground/[0.03] active:scale-[0.99] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="w-11 h-11 rounded-xl bg-terra/15 border border-terra/25 flex items-center justify-center shrink-0">
        <Smartphone className="w-5 h-5 text-terra-coral" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold text-ink-deep">{t('home.installBannerTitle')}</p>
        <p className="text-sm text-muted-foreground leading-snug mt-0.5 truncate">{t('home.installBannerBody')}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-ink-deep/40 shrink-0" />
    </Link>
  );
}