import { useEffect, useState } from 'react';

// The selected stamp design. Kept in localStorage (per device, no server round
// trip) and broadcast through a window event so every mounted stamp re-inks
// itself the moment the user approves a different style.

export const STAMP_STYLES = [
  { id: 'ink', labelKey: 'passport.styleInk' },
  { id: 'postmark', labelKey: 'passport.stylePostmark' },
  { id: 'visa', labelKey: 'passport.styleVisa' },
];

const KEY = 'tt-stamp-style';
const EVENT = 'tt-stamp-style-change';
const DEFAULT_STYLE = 'ink';

export const isStampStyle = (id) => STAMP_STYLES.some((s) => s.id === id);

export function readStampStyle() {
  try {
    const v = localStorage.getItem(KEY);
    return isStampStyle(v) ? v : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export function setStampStyle(id) {
  if (!isStampStyle(id)) return;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useStampStyle() {
  const [style, setStyle] = useState(readStampStyle);
  useEffect(() => {
    const handler = () => setStyle(readStampStyle());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return style;
}