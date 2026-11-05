import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../deviceLayout';

describe('resolveLayout', () => {
  it('keeps phones in the phone experience', () => {
    expect(resolveLayout(390, 844)).toBe('phone');
    expect(resolveLayout(932, 430)).toBe('phone'); // large phone, landscape
  });

  it('gives tablets in portrait the phone experience', () => {
    expect(resolveLayout(768, 1024)).toBe('phone');
    expect(resolveLayout(834, 1112)).toBe('phone');
  });

  it('gives tablets in landscape the desktop experience', () => {
    expect(resolveLayout(1024, 768)).toBe('desktop');
    expect(resolveLayout(1194, 834)).toBe('desktop');
  });

  it('gives desktops the desktop experience', () => {
    expect(resolveLayout(1440, 900)).toBe('desktop');
    expect(resolveLayout(1920, 1080)).toBe('desktop');
  });

  it('treats a tall narrow window as phone', () => {
    expect(resolveLayout(1100, 1400)).toBe('phone');
  });
});