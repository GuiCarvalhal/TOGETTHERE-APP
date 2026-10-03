const { test } = globalThis;
import assert from 'node:assert/strict';
import { alpha2ToAlpha3 } from './isoCountries.ts';

test('alpha2ToAlpha3 maps the countries that appear in flight routes', () => {
  assert.equal(alpha2ToAlpha3('US'), 'USA');
  assert.equal(alpha2ToAlpha3('IT'), 'ITA');
  assert.equal(alpha2ToAlpha3('CH'), 'CHE');
  assert.equal(alpha2ToAlpha3('BR'), 'BRA');
  assert.equal(alpha2ToAlpha3('GB'), 'GBR');
  assert.equal(alpha2ToAlpha3('CA'), 'CAN');
  assert.equal(alpha2ToAlpha3('CO'), 'COL');
  assert.equal(alpha2ToAlpha3('PA'), 'PAN');
  assert.equal(alpha2ToAlpha3('IE'), 'IRL');
  assert.equal(alpha2ToAlpha3('DE'), 'DEU');
});

test('alpha2ToAlpha3 is case-insensitive and returns "" for unknown codes', () => {
  assert.equal(alpha2ToAlpha3('us'), 'USA');
  assert.equal(alpha2ToAlpha3(''), '');
  assert.equal(alpha2ToAlpha3('ZZ'), '');
});