// Detects whether the app is currently running in an installed/standalone
// context (opened from the Home screen icon) rather than a regular browser tab.
//
// Returns true when ANY of these hold:
//   - matchMedia('(display-mode: standalone)')   .matches
//   - matchMedia('(display-mode: fullscreen)')   .matches
//   - matchMedia('(display-mode: minimal-ui)')   .matches
//   - matchMedia('(display-mode: window-controls-overlay)') .matches
//   - navigator.standalone === true  (iOS Safari)
//
// SSR / non-browser safe: returns false when window or matchMedia is absent.
// This is a pure, synchronous check — safe to call during render to avoid a
// first-paint flash. A regular browser cannot reliably know whether the app
// was installed elsewhere, so this only reflects the CURRENT context.
export function isStandaloneApp() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  const modes = [
    '(display-mode: standalone)',
    '(display-mode: fullscreen)',
    '(display-mode: minimal-ui)',
    '(display-mode: window-controls-overlay)',
  ];
  for (const q of modes) {
    try {
      if (window.matchMedia(q).matches) return true;
    } catch (_) {
      // matchMedia may throw on unsupported query strings — ignore.
    }
  }
  if (typeof window.navigator !== 'undefined' && window.navigator.standalone === true) {
    return true;
  }
  return false;
}

export default isStandaloneApp;