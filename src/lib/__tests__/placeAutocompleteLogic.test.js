import { describe, it, expect } from 'vitest';
import { shouldSearch, homePlaceOnSelect } from '@/lib/placeAutocompleteLogic';

describe('shouldSearch — suppress search after selection', () => {
  it('does not search right after a selection (justSelected=true)', () => {
    expect(shouldSearch('New York, NY, USA', true)).toBe(false);
  });

  it('searches again after the user types (justSelected=false)', () => {
    expect(shouldSearch('New York,', false)).toBe(true);
  });

  it('does not search for text shorter than 2 chars', () => {
    expect(shouldSearch('N', false)).toBe(false);
    expect(shouldSearch('', false)).toBe(false);
    expect(shouldSearch('  ', false)).toBe(false);
  });

  it('justSelected suppresses even for long text', () => {
    expect(shouldSearch('A very long address that would normally search', true)).toBe(false);
  });

  it('trims text before checking length', () => {
    expect(shouldSearch('  AB  ', false)).toBe(true);
    expect(shouldSearch('  A  ', false)).toBe(false);
  });

  it('handles null/undefined text safely', () => {
    expect(shouldSearch(null, false)).toBe(false);
    expect(shouldSearch(undefined, false)).toBe(false);
  });
});

describe('homePlaceOnSelect — map resolved place to form state', () => {
  it('valid place fills formatted address + structured place', () => {
    const result = homePlaceOnSelect({
      place_id: 'ChIJh',
      name: 'New York',
      address: 'New York, NY, USA',
      lat: 40.71,
      lng: -74.0,
      country: 'US',
    });
    expect(result).toEqual({
      text: 'New York, NY, USA',
      place: { place_id: 'ChIJh', lat: 40.71, lng: -74.0, country: 'US' },
    });
  });

  it('falls back to name when address is absent', () => {
    const result = homePlaceOnSelect({ place_id: '1', name: 'Rome', lat: 41.9, lng: 12.5, country: 'IT' });
    expect(result.text).toBe('Rome');
    expect(result.place).toEqual({ place_id: '1', lat: 41.9, lng: 12.5, country: 'IT' });
  });

  it('null selection returns null — caller must not override typed text', () => {
    expect(homePlaceOnSelect(null)).toBeNull();
    expect(homePlaceOnSelect(undefined)).toBeNull();
  });

  it('does not include extra fields in the place (only the 4 supported)', () => {
    const result = homePlaceOnSelect({
      place_id: '1', name: 'A', address: 'B', lat: 1, lng: 2, country: 'X',
      tz: 'America/New_York', city: 'NYC', iata: 'JFK',
    });
    expect(Object.keys(result.place).sort()).toEqual(['country', 'lat', 'lng', 'place_id']);
  });
});