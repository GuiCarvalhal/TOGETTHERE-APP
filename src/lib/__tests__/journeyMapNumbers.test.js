import { describe, it, expect } from 'vitest';
import { suggestionRouteNumbers, suggestionKey } from '@/lib/journeyMap';

describe('suggestionRouteNumbers — map/card numbering consistency', () => {
  it('numbers suggestions 1, 2, 3 in order', () => {
    const suggs = [
      { lat: 40, lng: 14, categoryLabel: 'Eat', place: { name: 'A', address: 'X' } },
      { lat: 41, lng: 15, categoryLabel: 'Do', place: { name: 'B', address: 'Y' } },
      { lat: 42, lng: 16, categoryLabel: 'Eat', place: { name: 'C', address: 'Z' } },
    ];
    const nums = suggestionRouteNumbers(suggs);
    expect(nums.get(suggestionKey(suggs[0]))).toBe(1);
    expect(nums.get(suggestionKey(suggs[1]))).toBe(2);
    expect(nums.get(suggestionKey(suggs[2]))).toBe(3);
  });

  it('skips suggestions without coords (no number, renumbers rest)', () => {
    const suggs = [
      { lat: 40, lng: 14, categoryLabel: 'Eat', place: { name: 'A', address: 'X' } },
      { lat: null, lng: null, categoryLabel: 'Do', place: { name: 'B', address: 'Y' } },
      { lat: 42, lng: 16, categoryLabel: 'Eat', place: { name: 'C', address: 'Z' } },
    ];
    const nums = suggestionRouteNumbers(suggs);
    expect(nums.get(suggestionKey(suggs[0]))).toBe(1);
    expect(nums.get(suggestionKey(suggs[1]))).toBeUndefined();
    expect(nums.get(suggestionKey(suggs[2]))).toBe(2);
  });

  it('same place under different categories gets different numbers', () => {
    const place = { name: 'A', address: 'X' };
    const suggs = [
      { lat: 40, lng: 14, categoryLabel: 'Eat', place },
      { lat: 40, lng: 14, categoryLabel: 'Do', place },
    ];
    const nums = suggestionRouteNumbers(suggs);
    expect(nums.get(suggestionKey(suggs[0]))).toBe(1);
    expect(nums.get(suggestionKey(suggs[1]))).toBe(2);
  });

  it('slicing the list renumbers consistently — first N keep same numbers', () => {
    const suggs = Array.from({ length: 10 }, (_, i) => ({
      lat: 40 + i, lng: 14 + i, categoryLabel: 'Eat', place: { name: `P${i}`, address: `A${i}` },
    }));
    const full = suggestionRouteNumbers(suggs);
    const sliced = suggestionRouteNumbers(suggs.slice(0, 5));
    for (let i = 0; i < 5; i++) {
      expect(full.get(suggestionKey(suggs[i]))).toBe(i + 1);
      expect(sliced.get(suggestionKey(suggs[i]))).toBe(i + 1);
    }
  });

  it('empty list returns empty map', () => {
    expect(suggestionRouteNumbers([]).size).toBe(0);
    expect(suggestionRouteNumbers(null).size).toBe(0);
  });
});