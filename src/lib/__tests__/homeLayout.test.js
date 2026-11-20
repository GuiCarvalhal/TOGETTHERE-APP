import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HOME_LAYOUT, HOME_BOX_KEYS, normalizeHomeLayout, moveHomeBox, toggleHomeBox, isBoxVisible,
} from '@/lib/homeLayout';

// The Home layout preference must always resolve to a complete, valid layout —
// a missing value, a partial one, or a legacy/unknown key never leaves Home with
// a missing or duplicated box.
describe('homeLayout', () => {
  it('falls back to the shipped defaults when there is no preference', () => {
    expect(normalizeHomeLayout(undefined)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout('not json')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout({})).toEqual({ order: [...HOME_BOX_KEYS], hidden: [] });
  });

  it('accepts a stored object or a JSON string', () => {
    const stored = { order: ['profile', 'next', 'gatherings', 'imports'], hidden: ['imports'] };
    expect(normalizeHomeLayout(JSON.stringify(stored))).toEqual(stored);
  });

  it('drops unknown keys, dedupes, and appends new boxes in default position', () => {
    const result = normalizeHomeLayout({ order: ['profile', 'ghost', 'profile'], hidden: ['ghost'] });
    expect(result.order).toEqual(['profile', 'next', 'gatherings', 'imports']);
    expect(result.hidden).toEqual([]);
  });

  it('moves a box without losing any, and clamps at the ends', () => {
    const up = moveHomeBox(DEFAULT_HOME_LAYOUT, 'gatherings', -1);
    expect(up.order).toEqual(['gatherings', 'next', 'profile', 'imports']);
    expect(up.order).toHaveLength(HOME_BOX_KEYS.length);
    expect(moveHomeBox(DEFAULT_HOME_LAYOUT, 'next', -1).order).toEqual(DEFAULT_HOME_LAYOUT.order);
    expect(moveHomeBox(DEFAULT_HOME_LAYOUT, 'imports', 1).order).toEqual(DEFAULT_HOME_LAYOUT.order);
  });

  it('toggles visibility both ways', () => {
    const hidden = toggleHomeBox(DEFAULT_HOME_LAYOUT, 'profile');
    expect(isBoxVisible(hidden, 'profile')).toBe(false);
    expect(isBoxVisible(hidden, 'next')).toBe(true);
    expect(isBoxVisible(toggleHomeBox(hidden, 'profile'), 'profile')).toBe(true);
  });
});