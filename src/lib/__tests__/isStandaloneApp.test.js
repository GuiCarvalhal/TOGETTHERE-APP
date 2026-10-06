import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isStandaloneApp } from '@/lib/isStandaloneApp';

describe('isStandaloneApp', () => {
  const originalWindow = (typeof globalThis !== 'undefined') ? globalThis.window : undefined;
  const modes = [
    '(display-mode: standalone)',
    '(display-mode: fullscreen)',
    '(display-mode: minimal-ui)',
    '(display-mode: window-controls-overlay)',
  ];

  function setWindow(win) {
    Object.defineProperty(globalThis, 'window', {
      value: win,
      writable: true,
      configurable: true,
    });
  }

  function mockWindow({ matchMediaImpl, navigatorStandalone } = {}) {
    const mq = (q) => ({
      matches: matchMediaImpl ? matchMediaImpl(q) : false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
    setWindow({
      matchMedia: (q) => mq(q),
      navigator: { standalone: navigatorStandalone },
    });
  }

  beforeEach(() => {
    delete globalThis.window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      setWindow(originalWindow);
    }
  });

  it('returns false when window is undefined (SSR)', () => {
    expect(isStandaloneApp()).toBe(false);
  });

  it('returns false when matchMedia is missing', () => {
    setWindow({ navigator: {} });
    expect(isStandaloneApp()).toBe(false);
  });

  it('returns false in a regular browser (no mode matches, no iOS standalone)', () => {
    mockWindow({ matchMediaImpl: () => false, navigatorStandalone: undefined });
    expect(isStandaloneApp()).toBe(false);
  });

  it.each(modes)('returns true when %s matches', (mode) => {
    mockWindow({ matchMediaImpl: (q) => q === mode, navigatorStandalone: undefined });
    expect(isStandaloneApp()).toBe(true);
  });

  it('returns true when navigator.standalone is true (iOS Safari)', () => {
    mockWindow({ matchMediaImpl: () => false, navigatorStandalone: true });
    expect(isStandaloneApp()).toBe(true);
  });

  it('survives a matchMedia that throws on unsupported queries', () => {
    setWindow({
      matchMedia: () => { throw new Error('unsupported'); },
      navigator: {},
    });
    expect(isStandaloneApp()).toBe(false);
  });
});