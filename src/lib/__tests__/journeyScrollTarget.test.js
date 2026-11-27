import { describe, it, expect } from 'vitest';
import {
  isDayKey, pickLandingDay, todayKeyInTz,
} from '@/lib/journeyScrollTarget';

// Landing rule for a fresh Journey visit:
//   today when the list has it → else the closest FUTURE day → else the top.

const DAYS = ['2026-11-29', '2026-11-25', '2026-11-27', 'unscheduled'];

describe('pickLandingDay', () => {
  it('lands on today when the list has it', () => {
    expect(pickLandingDay(DAYS, '2026-11-27')).toBe('2026-11-27');
  });

  it('falls forward to the closest future day when today has no block', () => {
    expect(pickLandingDay(DAYS, '2026-11-26')).toBe('2026-11-27');
    expect(pickLandingDay(DAYS, '2026-11-28')).toBe('2026-11-29');
  });

  it('lands on the first day of a trip that has not started yet', () => {
    expect(pickLandingDay(DAYS, '2026-06-01')).toBe('2026-11-25');
  });

  it('stays at the top for a past-only list', () => {
    expect(pickLandingDay(DAYS, '2026-12-24')).toBe(null);
  });

  it('never lands on an unscheduled group', () => {
    expect(pickLandingDay(['unscheduled'], '2026-11-27')).toBe(null);
    expect(pickLandingDay(DAYS, '2026-11-30')).toBe(null);
  });

  it('ignores unsorted input and empty lists', () => {
    expect(pickLandingDay(['2026-12-02', '2026-11-28'], '2026-11-27')).toBe('2026-11-28');
    expect(pickLandingDay([], '2026-11-27')).toBe(null);
    expect(pickLandingDay(null, '2026-11-27')).toBe(null);
  });

  it('refuses a malformed today key instead of guessing', () => {
    expect(pickLandingDay(DAYS, '')).toBe(null);
    expect(pickLandingDay(DAYS, '27/11/2026')).toBe(null);
    expect(pickLandingDay(DAYS, null)).toBe(null);
  });
});

describe('todayKeyInTz', () => {
  it('resolves the day in the viewer timezone, not UTC', () => {
    const lateEveningInNewYork = new Date('2026-11-28T02:30:00Z');
    expect(todayKeyInTz(lateEveningInNewYork, 'America/New_York')).toBe('2026-11-27');
    expect(todayKeyInTz(lateEveningInNewYork, 'UTC')).toBe('2026-11-28');
    expect(todayKeyInTz(lateEveningInNewYork, 'Asia/Tokyo')).toBe('2026-11-28');
  });

  it('is correct across the New York DST change', () => {
    // 04:30Z on 2026-11-01 is 00:30 EDT, still the same calendar day.
    expect(todayKeyInTz(new Date('2026-11-01T04:30:00Z'), 'America/New_York')).toBe('2026-11-01');
    // 05:30Z on 2026-11-02 is 00:30 EST, still the same calendar day.
    expect(todayKeyInTz(new Date('2026-11-02T05:30:00Z'), 'America/New_York')).toBe('2026-11-02');
  });

  it('falls back to the device date for an unknown zone', () => {
    const key = todayKeyInTz(new Date('2026-11-27T18:00:00Z'), 'Not/AZone');
    expect(isDayKey(key)).toBe(true);
  });

  it('always returns a usable day key', () => {
    expect(isDayKey(todayKeyInTz())).toBe(true);
  });
});

describe('isDayKey', () => {
  it('accepts only calendar dates', () => {
    expect(isDayKey('2026-11-27')).toBe(true);
    expect(isDayKey('unscheduled')).toBe(false);
    expect(isDayKey('2026-11-27T10:00:00Z')).toBe(false);
    expect(isDayKey(undefined)).toBe(false);
  });
});