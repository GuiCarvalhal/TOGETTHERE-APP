import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import AppHeader from '@/components/tt/AppHeader';
import { InstallIllustration } from '@/components/tt/InstallIllustrations';
import { useI18n } from '@/lib/i18n';

// "Add to Home screen" help page — teaches travelers how to install TOGETTHERE
// as a PWA (no app store) on Android and iPhone. Bilingual via i18n, responsive,
// accessible numbered steps with original SVG illustrations. No push is
// implemented or promised here; the notifications note is informational only.
export default function AddToHomeScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [platform, setPlatform] = useState('android');

  const onBack = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/account');
  }, [navigate]);

  const STEPS = {
    android: [
      { title: t('addToHomeScreen.androidStep1'), hint: t('addToHomeScreen.androidStep1Hint'), variant: 'android-browser' },
      { title: t('addToHomeScreen.androidStep2'), hint: t('addToHomeScreen.androidStep2Hint'), variant: 'android-menu-button' },
      { title: t('addToHomeScreen.androidStep3'), hint: t('addToHomeScreen.androidStep3Hint'), variant: 'android-menu' },
      { title: t('addToHomeScreen.androidStep4'), hint: t('addToHomeScreen.androidStep4Hint'), variant: 'home-screen' },
    ],
    iphone: [
      { title: t('addToHomeScreen.iphoneStep1'), hint: t('addToHomeScreen.iphoneStep1Hint'), variant: 'iphone-safari' },
      { title: t('addToHomeScreen.iphoneStep2'), hint: t('addToHomeScreen.iphoneStep2Hint'), variant: 'iphone-share-button' },
      { title: t('addToHomeScreen.iphoneStep3'), hint: t('addToHomeScreen.iphoneStep3Hint'), variant: 'iphone-share-sheet' },
      { title: t('addToHomeScreen.iphoneStep4'), hint: t('addToHomeScreen.iphoneStep4Hint'), variant: 'home-screen' },
    ],
  };
  const steps = STEPS[platform];
  const isAndroid = platform === 'android';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-16">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-deep/60 hover:text-ink-deep transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> {t('addToHomeScreen.back')}
        </button>

        <p className="tt-label text-terra-coral mb-2">{t('addToHomeScreen.label')}</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tt-text-balance">
          {t('addToHomeScreen.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-xl leading-relaxed">
          {t('addToHomeScreen.intro')}
        </p>

        {/* Platform toggle */}
        <div
          className="mt-6 inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10"
          role="group"
          aria-label={t('addToHomeScreen.title')}
        >
          {['android', 'iphone'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${platform === p ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
            >
              {p === 'android' ? t('addToHomeScreen.platformAndroid') : t('addToHomeScreen.platformIphone')}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          {isAndroid ? t('addToHomeScreen.androidIntro') : t('addToHomeScreen.iphoneIntro')}
        </p>

        {/* Numbered steps */}
        <ol className="mt-5 space-y-4">
          {steps.map((s, i) => (
            <li key={i} className="tt-card p-5">
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-terra text-cream flex items-center justify-center font-display font-bold text-sm">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-foreground leading-snug">{s.title}</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.hint}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-col items-center">
                <div className="w-36 sm:w-40">
                  <InstallIllustration variant={s.variant} />
                </div>
                <p className="tt-label text-ink-deep/40 mt-2 text-center normal-case tracking-normal font-medium">
                  {t('addToHomeScreen.illustrationNote')}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* Fallback note */}
        <div className="mt-4 tt-ink-panel p-4">
          <p className="text-sm text-ink-deep/70 leading-relaxed">
            {isAndroid ? t('addToHomeScreen.androidFallback') : t('addToHomeScreen.iphoneFallback')}
          </p>
        </div>

        {/* Notifications note — informational only, no push implemented */}
        <div className="mt-5 tt-card p-5 border-l-4 border-l-terra/40">
          <div className="flex items-center gap-2 mb-1.5">
            <Info className="w-4 h-4 text-terra-deep" />
            <p className="font-display font-bold text-foreground">{t('addToHomeScreen.notificationsTitle')}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('addToHomeScreen.notificationsBody')}
          </p>
        </div>
      </div>
    </div>
  );
}