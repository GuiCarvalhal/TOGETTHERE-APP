import { useState, useEffect } from 'react';

const KEY = 'tt-theme';
const PALETTE_KEY = 'tt-palette';

export const THEME_MODES = ['light', 'dark', 'system'];

// Palette is a SEPARATE appearance axis from light/dark. "colorful" is the
// original brand look (warm cream + terracotta); "neutral" is the calmer,
// lower-saturation skin. They are stored independently, so switching one never
// resets the other: every screen reads through the same CSS tokens either way.
export const PALETTES = ['colorful', 'neutral'];
const DEFAULT_PALETTE = 'colorful';

export function getStoredMode() {
  try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; }
}

export function getStoredPalette() {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    return PALETTES.includes(v) ? v : DEFAULT_PALETTE;
  } catch { return DEFAULT_PALETTE; }
}

function resolvesDark(mode) {
  if (mode === 'dark') return true;
  if (mode === 'system') {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  }
  return false;
}

// Single entry point for both axes: <html> carries `dark` (light/dark) and
// `neutral` (palette). index.css turns those classes into token sets, so no
// component ever needs to know which palette is active.
export function applyTheme(mode = getStoredMode(), palette = getStoredPalette()) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolvesDark(mode));
  root.classList.toggle('neutral', palette === 'neutral');
}

export function setMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch {}
  applyTheme(mode, getStoredPalette());
}

export function setPalette(palette) {
  if (!PALETTES.includes(palette)) return;
  try { localStorage.setItem(PALETTE_KEY, palette); } catch {}
  applyTheme(getStoredMode(), palette);
}

export function useTheme() {
  const [mode, setModeState] = useState(getStoredMode);
  const [palette, setPaletteState] = useState(getStoredPalette);

  useEffect(() => {
    applyTheme(mode, palette);
    if (mode !== 'system') return;
    let mq;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system', palette);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } catch {}
  }, [mode, palette]);

  const changeMode = (m) => { setMode(m); setModeState(m); };
  const changePalette = (p) => { setPalette(p); setPaletteState(p); };
  return { mode, setMode: changeMode, palette, setPalette: changePalette };
}