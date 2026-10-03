import { describe, it, expect } from 'vitest';
import { alpha2ToAlpha3 } from '@/lib/isoCountries';

describe('alpha2ToAlpha3', () => {
  it('maps common country codes to ISO alpha-3', () => {
    expect(alpha2ToAlpha3('US')).toBe('USA');
    expect(alpha2ToAlpha3('IT')).toBe('ITA');
    expect(alpha2ToAlpha3('CH')).toBe('CHE');
    expect(alpha2ToAlpha3('BR')).toBe('BRA');
    expect(alpha2ToAlpha3('GB')).toBe('GBR');
    expect(alpha2ToAlpha3('CA')).toBe('CAN');
    expect(alpha2ToAlpha3('CO')).toBe('COL');
    expect(alpha2ToAlpha3('PA')).toBe('PAN');
    expect(alpha2ToAlpha3('IE')).toBe('IRL');
    expect(alpha2ToAlpha3('DE')).toBe('DEU');
    expect(alpha2ToAlpha3('FR')).toBe('FRA');
    expect(alpha2ToAlpha3('ES')).toBe('ESP');
    expect(alpha2ToAlpha3('PT')).toBe('PRT');
    expect(alpha2ToAlpha3('JP')).toBe('JPN');
    expect(alpha2ToAlpha3('AE')).toBe('ARE');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(alpha2ToAlpha3('us')).toBe('USA');
    expect(alpha2ToAlpha3(' It ')).toBe('ITA');
  });

  it('returns empty string for unknown / empty codes', () => {
    expect(alpha2ToAlpha3('')).toBe('');
    expect(alpha2ToAlpha3(null)).toBe('');
    expect(alpha2ToAlpha3(undefined)).toBe('');
    expect(alpha2ToAlpha3('ZZ')).toBe('');
    expect(alpha2ToAlpha3('XYZ')).toBe('');
  });
});