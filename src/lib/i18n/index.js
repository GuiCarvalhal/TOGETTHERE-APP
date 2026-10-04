import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { en } from './en';
import { ptBR } from './pt-BR';
import { makeFormatters } from './formatters';

// LocaleProvider — lightweight i18n for EN + pt-BR. Persists the user's choice
// in localStorage (tt-locale). English is the default. No runtime translation
// API; dictionaries are static. Missing keys fall back to English, then to the
// key itself. Interpolation via {name} placeholders. Plurals via a `count`
// param that picks the `one`/`other` variant when the value is an object.
//
// formatters: locale-aware date/number/currency/relative-time helpers that
// replace the hardcoded 'en-US' in gatheringHelpers. The browser locale never
// changes stored amounts or dates — only the display format.

export const LOCALES = { en: 'en-US', 'pt-BR': 'pt-BR' };
export const LOCALE_LABELS = { en: 'English', 'pt-BR': 'Português (Brasil)' };

const STORAGE_KEY = 'tt-locale';
const DEFAULT_LOCALE = 'en';

const DICTS = { en, 'pt-BR': ptBR };

const LocaleContext = createContext(null);

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && DICTS[v]) return v;
  } catch { /* ignore */ }
  return DEFAULT_LOCALE;
}

function resolveKey(dict, key) {
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : ''));
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(readStored);

  const setLocale = useCallback((l) => {
    if (!DICTS[l]) return;
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key, params) => {
    const primary = resolveKey(DICTS[locale], key);
    const value = primary != null ? primary : resolveKey(en, key);
    if (value == null) return key;
    if (typeof value === 'object') {
      // Plural: { one: '...', other: '...' } — pick by count
      if (params && typeof params.count === 'number') {
        const variant = params.count === 1 ? value.one : value.other;
        return interpolate(variant != null ? variant : key, params);
      }
      return key;
    }
    return interpolate(value, params);
  }, [locale]);

  const fmt = useMemo(() => makeFormatters(LOCALES[locale] || 'en-US'), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, fmt }), [locale, setLocale, t, fmt]);
  return React.createElement(LocaleContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) return { locale: DEFAULT_LOCALE, setLocale: () => {}, t: (k) => k, fmt: makeFormatters('en-US') };
  return ctx;
}

// Convenience: get just the t function (avoids re-renders from locale changes
// in components that only format, not translate).
export function useT() {
  return useI18n().t;
}

// Convenience: get just the formatters.
export function useFmt() {
  return useI18n().fmt;
}