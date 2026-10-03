import { describe, it, expect } from 'vitest';
import { formatTimeAbbrAlpha3, tzAbbrAt } from '@/lib/formatPlaceTime';

describe('formatTimeAbbrAlpha3', () => {
  // A summer instant in America/New_York (EDT) and a winter instant (EST) to
  // verify DST-aware abbreviation from the stored IANA tz + the scheduled
  // instant — never a bare GMT offset.
  const summerIso = '2026-07-08T14:00:00.000Z'; // 10:00 AM EDT
  const winterIso = '2026-12-08T14:00:00.000Z'; // 9:00 AM EST

  it('formats as "TIME ABBR-ALPHA3" with a hyphen, no spaces around it', () => {
    expect(formatTimeAbbrAlpha3(summerIso, 'America/New_York', 'USA')).toMatch(/10:00 AM EDT-USA/);
  });

  it('is DST-aware: EDT in summer, EST in winter for the same IANA tz', () => {
    expect(formatTimeAbbrAlpha3(summerIso, 'America/New_York', 'USA')).toMatch(/EDT-USA/);
    expect(formatTimeAbbrAlpha3(winterIso, 'America/New_York', 'USA')).toMatch(/EST-USA/);
  });

  it('never produces a GMT offset when the tz is known', () => {
    const result = formatTimeAbbrAlpha3(summerIso, 'America/New_York', 'USA');
    expect(result).not.toMatch(/GMT/);
    expect(tzAbbrAt(summerIso, 'America/New_York')).toBe('EDT');
    expect(tzAbbrAt(winterIso, 'America/New_York')).toBe('EST');
  });

  it('renders Europe/Rome summer time as CEST-ITA', () => {
    const romeSummer = '2026-07-08T10:00:00.000Z'; // 12:00 PM CEST
    expect(formatTimeAbbrAlpha3(romeSummer, 'Europe/Rome', 'ITA')).toMatch(/CEST-ITA/);
  });

  it('falls back to "TIME ABBR" when no alpha-3 code is available', () => {
    expect(formatTimeAbbrAlpha3(summerIso, 'America/New_York', '')).toMatch(/10:00 AM EDT$/);
    expect(formatTimeAbbrAlpha3(summerIso, 'America/New_York', '')).not.toMatch(/-/);
  });

  it('falls back to bare wall clock when no abbreviation is derivable', () => {
    // An invalid tz yields no time at all (formatTimeOnly catches the error).
    expect(formatTimeAbbrAlpha3(summerIso, 'Not/A/Zone', 'USA')).toBe('');
  });

  it('returns empty string when iso or tz is missing', () => {
    expect(formatTimeAbbrAlpha3('', 'America/New_York', 'USA')).toBe('');
    expect(formatTimeAbbrAlpha3(summerIso, '', 'USA')).toBe('');
    expect(formatTimeAbbrAlpha3(null, 'America/New_York', 'USA')).toBe('');
  });
});