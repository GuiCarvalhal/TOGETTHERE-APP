import React from 'react';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import LanguageSelector from '@/components/tt/LanguageSelector';
import { useDistanceUnit } from '@/lib/distanceUnit';
import { Sun, Moon, Monitor } from 'lucide-react';

const THEME_OPTS = [
  { key: 'light', tk: 'account.light', Icon: Sun },
  { key: 'dark', tk: 'account.dark', Icon: Moon },
  { key: 'system', tk: 'account.system', Icon: Monitor },
];

// Palette is a second appearance axis, independent of Light/Dark: Colorful keeps
// the warm trip palette, Neutral is calmer and lower-saturation.
const PALETTE_OPTS = [
  { key: 'colorful', tk: 'account.paletteColorful', swatch: 'bg-gradient-to-br from-terra-coral to-terra-deep' },
  { key: 'neutral', tk: 'account.paletteNeutral', swatch: 'bg-gradient-to-br from-slate-400 to-slate-600' },
];

// Preferences section of the Account page: appearance and language. Both persist
// through their existing localStorage mechanisms and take effect immediately
// across the whole app (useTheme / LocaleProvider re-render the tree).
const UNIT_OPTS = [
  { key: 'mi', tk: 'account.unitMiles' },
  { key: 'km', tk: 'account.unitKilometers' },
];

export default function AccountPreferences() {
  const { t } = useI18n();
  const { mode, setMode, palette, setPalette } = useTheme();
  const { unit, setUnit } = useDistanceUnit();

  return (
    <div className="tt-card p-4 sm:p-5 space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink-deep/60">{t('account.appearance')}</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setMode(o.key)}
              aria-pressed={mode === o.key}
              className={`flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === o.key ? 'bg-terra/10 border-terra/30 text-terra-deep' : 'border-ink-charcoal/15 text-ink-deep/55 hover:bg-foreground/5'}`}
            >
              <o.Icon className="w-4 h-4" /> {t(o.tk)}
            </button>
          ))}
        </div>
      </div>

      {/* Palette — independent from Light/Dark above, persisted app-wide. */}
      <div className="space-y-2 pt-4 border-t border-ink-charcoal/10">
        <p className="text-xs font-semibold text-ink-deep/60">{t('account.palette')}</p>
        <div className="grid grid-cols-2 gap-2">
          {PALETTE_OPTS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setPalette(o.key)}
              aria-pressed={palette === o.key}
              className={`flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${palette === o.key ? 'bg-terra/10 border-terra/30 text-terra-deep' : 'border-ink-charcoal/15 text-ink-deep/55 hover:bg-foreground/5'}`}
            >
              <span className={`w-3.5 h-3.5 rounded-full border border-ink-charcoal/20 ${o.swatch}`} aria-hidden="true" />
              {t(o.tk)}
            </button>
          ))}
        </div>
        <p className="text-[0.6875rem] text-ink-deep/45 leading-snug">{t('account.paletteDesc')}</p>
      </div>

      <div className="space-y-2 pt-4 border-t border-ink-charcoal/10">
        <p className="text-xs font-semibold text-ink-deep/60">{t('account.language')}</p>
        <LanguageSelector variant="menu" />
      </div>

      {/* Distance unit — applies to every distance shown in the Journey.
          Durations keep their minutes/hours wording either way. */}
      <div className="space-y-2 pt-4 border-t border-ink-charcoal/10">
        <p className="text-xs font-semibold text-ink-deep/60">{t('account.distanceUnit')}</p>
        <div className="grid grid-cols-2 gap-2">
          {UNIT_OPTS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setUnit(o.key)}
              aria-pressed={unit === o.key}
              className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${unit === o.key ? 'bg-terra/10 border-terra/30 text-terra-deep' : 'border-ink-charcoal/15 text-ink-deep/55 hover:bg-foreground/5'}`}
            >
              {t(o.tk)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}