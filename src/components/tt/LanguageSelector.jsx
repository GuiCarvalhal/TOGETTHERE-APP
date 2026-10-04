import React from 'react';
import { useI18n, LOCALE_LABELS } from '@/lib/i18n';
import { Globe } from 'lucide-react';

// Compact language selector — two buttons (English / Português (Brasil)).
// Used on the Login page and in the account menu (MoreMenu). Persists the
// choice via the LocaleProvider (localStorage).
export default function LanguageSelector({ variant = 'menu' }) {
  const { locale, setLocale } = useI18n();
  const locales = Object.entries(LOCALE_LABELS);

  if (variant === 'inline') {
    // Login page variant — pill buttons below the form
    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <Globe className="w-4 h-4 text-muted-foreground" />
        {locales.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setLocale(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              locale === key
                ? 'bg-terra text-cream'
                : 'bg-foreground/5 text-foreground/60 hover:text-foreground border border-foreground/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  // Menu variant — row in the account drawer
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Globe className="w-3.5 h-3.5 text-foreground/45" />
      {locales.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setLocale(key)}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            locale === key
              ? 'bg-terra/10 text-terra-deep border border-terra/30'
              : 'border border-foreground/12 text-foreground/55 hover:bg-foreground/5'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}