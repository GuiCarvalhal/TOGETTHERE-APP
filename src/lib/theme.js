import { useState, useEffect } from 'react';

const KEY = 'tt-theme';
export const THEME_MODES = ['light', 'dark', 'system'];

export function getStoredMode() {
  try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; }
}

function resolvesDark(mode) {
  if (mode === 'dark') return true;
  if (mode === 'system') {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  }
  return false;
}

export function applyTheme(mode) {
  document.documentElement.classList.toggle('dark', resolvesDark(mode));
}

export function setMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch {}
  applyTheme(mode);
}

export function useTheme() {
  const [mode, setModeState] = useState(getStoredMode());
  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'system') return;
    let mq;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } catch {}
  }, [mode]);
  const change = (m) => { setMode(m); setModeState(m); };
  return { mode, setMode: change };
}