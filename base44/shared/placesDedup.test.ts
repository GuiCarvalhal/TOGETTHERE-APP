const { test } = globalThis;
import assert from 'node:assert/strict';
import { dedupePlaces } from './googlePlaces.ts';

test('dedupePlaces — dedupes by place id', () => {
  const lists = [
    [{ id: 'a', name: 'Place A', address: 'Addr A' }],
    [{ id: 'a', name: 'Place A', address: 'Addr A' }],
  ];
  assert.equal(dedupePlaces(lists, 10).length, 1);
});

test('dedupePlaces — dedupes by name+address when id is missing', () => {
  const lists = [
    [{ name: 'Place A', address: 'Addr A' }],
    [{ name: 'Place A', address: 'Addr A' }],
  ];
  assert.equal(dedupePlaces(lists, 10).length, 1);
});

test('dedupePlaces — keeps distinct places', () => {
  const lists = [
    [{ id: 'a', name: 'A', address: 'X' }],
    [{ id: 'b', name: 'B', address: 'Y' }],
  ];
  assert.equal(dedupePlaces(lists, 10).length, 2);
});

test('dedupePlaces — respects max limit', () => {
  const lists = [Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, address: `A${i}` }))];
  assert.equal(dedupePlaces(lists, 10).length, 10);
});

test('dedupePlaces — single-destination has enough unique places for 10', () => {
  const lists = [Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, address: `A${i}` }))];
  const result = dedupePlaces(lists, 10);
  assert.equal(result.length, 10);
  assert.equal(new Set(result.map((p) => p.id)).size, 10);
});

test('dedupePlaces — multiple destinations with overlapping places', () => {
  const lists = [
    [{ id: 'a', name: 'A', address: 'X' }, { id: 'b', name: 'B', address: 'Y' }],
    [{ id: 'b', name: 'B', address: 'Y' }, { id: 'c', name: 'C', address: 'Z' }],
  ];
  const result = dedupePlaces(lists, 10);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((p) => p.id), ['a', 'b', 'c']);
});

test('dedupePlaces — does not fabricate or pad duplicates', () => {
  const lists = [[{ id: 'a', name: 'A', address: 'X' }]];
  assert.equal(dedupePlaces(lists, 10).length, 1);
});

test('dedupePlaces — preserves order (first occurrence wins)', () => {
  const lists = [
    [{ id: 'c', name: 'C', address: 'Z' }],
    [{ id: 'a', name: 'A', address: 'X' }, { id: 'b', name: 'B', address: 'Y' }],
  ];
  const result = dedupePlaces(lists, 10);
  assert.deepEqual(result.map((p) => p.id), ['c', 'a', 'b']);
});