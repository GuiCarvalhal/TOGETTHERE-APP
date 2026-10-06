import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import LanguageSelector from '@/components/tt/LanguageSelector';
import { Link } from 'react-router-dom';
import { Sun, Moon, Monitor, LogOut, Settings as SettingsIcon, Smartphone, ChevronRight } from 'lucide-react';

const THEME_OPTS = [
  { key: 'light', tk: 'account.light', Icon: Sun },
  { key: 'dark', tk: 'account.dark', Icon: Moon },
  { key: 'system', tk: 'account.system', Icon: Monitor },
];

// Global App Settings section for the universal Account page. Theme + language
// persist via their existing localStorage mechanisms and take immediate effect
// across Home and every gathering page (the LocaleProvider / useTheme re-render
// the whole tree). Sign out uses the SDK logout. No gathering-scoped controls
// live here — per-gathering notification subscriptions stay on the gathering's
// own Settings page. This section is the future home for app-level integrations;
// for now it holds only the existing global controls.
export default function AccountSettings() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const { mode, setMode } = useTheme();

  return (
    <div className="tt-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-4 h-4 text-terra-deep" />
        <p className="tt-label text-ink-deep/50">{t('account.appSettings')}</p>
      </div>

      {/* Appearance — theme */}
      <div className="space-y-2">
        <p className="text-xs text-ink-deep/60">{t('account.appearance')}</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTS.map((o) => (
            <button
              key={o.key}
              onClick={() => setMode(o.key)}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${mode === o.key ? 'bg-terra/10 border-terra/30 text-terra-deep' : 'border-ink-charcoal/15 text-ink-deep/55 hover:bg-foreground/5'}`}
            >
              <o.Icon className="w-4 h-4" /> {t(o.tk)}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <p className="text-xs text-ink-deep/60">{t('account.language')}</p>
        <LanguageSelector variant="menu" />
      </div>

      {/* Add to Home screen */}
      <Link
        to="/add-to-home-screen"
        className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-xl text-sm font-semibold text-ink-deep hover:bg-foreground/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-terra-deep" /> {t('account.installApp')}
        </span>
        <ChevronRight className="w-4 h-4 text-ink-deep/40" />
      </Link>

      {/* Sign out */}
      <div className="pt-2 border-t border-ink-charcoal/10">
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-semibold text-destructive hover:bg-destructive/5 transition-colors"
        >
          <LogOut className="w-4 h-4" /> {t('account.signOut')}
        </button>
      </div>
    </div>
  );
}