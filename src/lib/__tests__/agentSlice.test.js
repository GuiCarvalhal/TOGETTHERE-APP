import { describe, it, expect } from 'vitest';
import { sliceAgentData, shouldShowReloadHint, SHORT_COUNT, LONG_COUNT } from '@/lib/agentSlice';

const fullData = {
  whereToEat: Array.from({ length: 10 }, (_, i) => ({ name: `Eat ${i}` })),
  whatToDo: Array.from({ length: 10 }, (_, i) => ({ name: `Do ${i}` })),
  todaysPicks: [{ name: 'Today 1' }, { name: 'Today 2' }],
  vibe: { tags: ['test'], paragraph: 'p', tip: 't' },
  tasks: [{ text: 'Task 1', category: 'documents' }],
  goodToKnow: { destinationCurrency: 'EUR' },
  phase: 'during',
};

describe('sliceAgentData — 5/10 slicing', () => {
  it('short mode slices to 5+5', () => {
    const s = sliceAgentData(fullData, 'short');
    expect(s.whereToEat).toHaveLength(5);
    expect(s.whatToDo).toHaveLength(5);
  });

  it('long mode slices to 10+10', () => {
    const s = sliceAgentData(fullData, 'long');
    expect(s.whereToEat).toHaveLength(10);
    expect(s.whatToDo).toHaveLength(10);
  });

  it('does not slice todaysPicks (already capped by backend)', () => {
    const s = sliceAgentData(fullData, 'short');
    expect(s.todaysPicks).toHaveLength(2);
  });

  it('preserves non-place fields (vibe, tasks, goodToKnow, phase)', () => {
    const s = sliceAgentData(fullData, 'short');
    expect(s.vibe).toEqual(fullData.vibe);
    expect(s.tasks).toEqual(fullData.tasks);
    expect(s.goodToKnow).toEqual(fullData.goodToKnow);
    expect(s.phase).toBe(fullData.phase);
  });

  it('switching is instant — same underlying data, no mutation', () => {
    const short = sliceAgentData(fullData, 'short');
    const long = sliceAgentData(fullData, 'long');
    expect(short.whereToEat[0]).toBe(long.whereToEat[0]); // same reference
    expect(fullData.whereToEat).toHaveLength(10); // original unmutated
  });

  it('handles fewer than max gracefully', () => {
    const small = { whereToEat: [{ name: 'A' }], whatToDo: [{ name: 'B' }] };
    const s = sliceAgentData(small, 'long');
    expect(s.whereToEat).toHaveLength(1);
    expect(s.whatToDo).toHaveLength(1);
  });

  it('returns null for null data', () => {
    expect(sliceAgentData(null, 'short')).toBeNull();
    expect(sliceAgentData(undefined, 'long')).toBeUndefined();
  });

  it('default (unknown length) falls back to short count', () => {
    const s = sliceAgentData(fullData, 'unknown');
    expect(s.whereToEat).toHaveLength(5);
  });
});

describe('shouldShowReloadHint', () => {
  it('shows hint in long mode when fewer than 10 eat places', () => {
    expect(shouldShowReloadHint({ whereToEat: [{ name: 'A' }], whatToDo: Array(10) }, 'long')).toBe(true);
  });

  it('shows hint in long mode when fewer than 10 do places', () => {
    expect(shouldShowReloadHint({ whereToEat: Array(10), whatToDo: [{ name: 'B' }] }, 'long')).toBe(true);
  });

  it('does not show hint in short mode', () => {
    expect(shouldShowReloadHint({ whereToEat: [{ name: 'A' }], whatToDo: [] }, 'short')).toBe(false);
  });

  it('does not show hint when long has 10+10', () => {
    const full = { whereToEat: Array(10), whatToDo: Array(10) };
    expect(shouldShowReloadHint(full, 'long')).toBe(false);
  });

  it('does not show hint for null data', () => {
    expect(shouldShowReloadHint(null, 'long')).toBe(false);
  });
});

describe('default independent scope', () => {
  it('SHORT_COUNT is 5', () => { expect(SHORT_COUNT).toBe(5); });
  it('LONG_COUNT is 10', () => { expect(LONG_COUNT).toBe(10); });
});