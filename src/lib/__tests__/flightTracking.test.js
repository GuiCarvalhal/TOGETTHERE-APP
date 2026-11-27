import { describe, it, expect } from 'vitest';
import {
  TRACKING_BEFORE_MS, TRACKING_AFTER_MS, trackingPhase, chipKey, fieldConfidence, freshness,
  interpolatedPosition,
} from '@/lib/flightTracking';

// Tracking is emphasised from T-6h until 2h after landing, then the card falls
// back to its regular view. The window is what keeps a journey list from asking
// the flight provider about flights months away.

const H = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-27T18:00:00Z');
const LANDING = T0 + 3 * H;

describe('trackingPhase', () => {
  it('is inactive before the six-hour window', () => {
    expect(trackingPhase({ startMs: T0, endMs: LANDING, nowMs: T0 - TRACKING_BEFORE_MS - 1 })).toBe('before');
  });

  it('opens exactly at T-6h', () => {
    expect(trackingPhase({ startMs: T0, endMs: LANDING, nowMs: T0 - TRACKING_BEFORE_MS })).toBe('active');
  });

  it('stays active through the flight and two hours after landing', () => {
    expect(trackingPhase({ startMs: T0, endMs: LANDING, nowMs: T0 })).toBe('active');
    expect(trackingPhase({ startMs: T0, endMs: LANDING, nowMs: LANDING })).toBe('active');
    expect(trackingPhase({ startMs: T0, endMs: LANDING, nowMs: LANDING + TRACKING_AFTER_MS })).toBe('active');
  });

  it('closes right after the landing buffer', () => {
    expect(trackingPhase({ startMs: T0, endMs: LANDING, nowMs: LANDING + TRACKING_AFTER_MS + 1 })).toBe('after');
  });

  it('assumes a three-hour block when no landing time is stored', () => {
    expect(trackingPhase({ startMs: T0, nowMs: T0 + 4 * H })).toBe('active');
    expect(trackingPhase({ startMs: T0, nowMs: T0 + 6 * H })).toBe('after');
  });

  it('never opens without a usable departure', () => {
    expect(trackingPhase({ startMs: NaN })).toBe('after');
    expect(trackingPhase({})).toBe('after');
  });
});

describe('chipKey', () => {
  it('maps every feed status onto the six chip words', () => {
    expect(chipKey('scheduled')).toBe('scheduled');
    expect(chipKey('checkIn')).toBe('scheduled');
    expect(chipKey('boarding')).toBe('boarding');
    expect(chipKey('gateClosed')).toBe('boarding');
    expect(chipKey('departed')).toBe('inAir');
    expect(chipKey('approaching')).toBe('inAir');
    expect(chipKey('arrived')).toBe('landed');
    expect(chipKey('delayed')).toBe('delayed');
    expect(chipKey('cancelled')).toBe('cancelled');
  });

  it('keeps diverted distinct from a delay', () => {
    expect(chipKey('diverted')).toBe('diverted');
  });

  it('has no chip for an unknown status', () => {
    expect(chipKey('')).toBe('');
    expect(chipKey('somethingElse')).toBe('');
  });
});

describe('fieldConfidence', () => {
  const nowMs = T0;

  it('has nothing to qualify when the field is absent', () => {
    expect(fieldConfidence({ hasValue: false, live: true, updatedMs: nowMs })).toBe('none');
  });

  it('is high for a fresh live value', () => {
    expect(fieldConfidence({ hasValue: true, live: true, updatedMs: nowMs - 5 * 60000, nowMs })).toBe('high');
  });

  it('drops to medium when the live answer is old', () => {
    expect(fieldConfidence({ hasValue: true, live: true, updatedMs: nowMs - 45 * 60000, nowMs })).toBe('medium');
    expect(fieldConfidence({ hasValue: true, live: true, updatedMs: null, nowMs })).toBe('medium');
  });

  it('is low for a schedule-only record', () => {
    expect(fieldConfidence({ hasValue: true, live: false, updatedMs: nowMs, nowMs })).toBe('low');
  });

  it('is low for a value we estimated ourselves', () => {
    expect(fieldConfidence({ hasValue: true, live: true, updatedMs: nowMs, estimated: true, nowMs })).toBe('low');
  });
});

describe('freshness', () => {
  it('buckets the feed age', () => {
    const nowMs = T0;
    expect(freshness({ updatedMs: nowMs - 60000, nowMs }).level).toBe('fresh');
    expect(freshness({ updatedMs: nowMs - 40 * 60000, nowMs }).level).toBe('recent');
    expect(freshness({ updatedMs: nowMs - 200 * 60000, nowMs }).level).toBe('stale');
    expect(freshness({ updatedMs: NaN, nowMs }).level).toBe('unknown');
  });

  it('reports the minutes shown next to the status', () => {
    expect(freshness({ updatedMs: T0 - 12 * 60000, nowMs: T0 }).minutes).toBe(12);
  });
});

describe('interpolatedPosition', () => {
  const from = { lat: 0, lng: 0 };
  const to = { lat: 0, lng: 10 };
  const startMs = T0;
  const endMs = T0 + 2 * H;

  it('has no position before departure', () => {
    expect(interpolatedPosition({ from, to, startMs, endMs, nowMs: startMs - 1000 })).toBe(null);
  });

  it('sits at the origin just after departure and at the destination on arrival', () => {
    const early = interpolatedPosition({ from, to, startMs, endMs, nowMs: startMs + 1000 });
    expect(early.progress).toBeLessThan(0.01);
    expect(early.lat).toBeCloseTo(0, 2);
    const late = interpolatedPosition({ from, to, startMs, endMs, nowMs: endMs });
    expect(late.progress).toBe(1);
    expect(late.lng).toBeCloseTo(10, 4);
  });

  it('is halfway along the route at the midpoint', () => {
    const mid = interpolatedPosition({ from, to, startMs, endMs, nowMs: startMs + H });
    expect(mid.progress).toBeCloseTo(0.5, 3);
    expect(mid.lat).toBeCloseTo(0, 4);
    expect(mid.lng).toBeCloseTo(5, 3);
  });

  it('follows the great circle rather than a flat line', () => {
    const mid = interpolatedPosition({
      from: { lat: 40.6, lng: -73.8 }, to: { lat: 51.5, lng: -0.1 }, startMs, endMs, nowMs: startMs + H,
    });
    // A rhumb/flat interpolation would sit near 46.05 lat; the great circle bows north.
    expect(mid.lat).toBeGreaterThan(47);
  });

  it('refuses unusable inputs instead of inventing a point', () => {
    expect(interpolatedPosition({ from: null, to, startMs, endMs })).toBe(null);
    expect(interpolatedPosition({ from: { lat: 'x', lng: 0 }, to, startMs, endMs })).toBe(null);
    expect(interpolatedPosition({ from, to, startMs: NaN, endMs, nowMs: T0 })).toBe(null);
    expect(interpolatedPosition({ from, to, startMs: T0, endMs: T0, nowMs: T0 })).toBe(null);
  });
});