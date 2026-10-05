import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// SSR markup tests for the shared GatheringMetaLine — the component used by
// BOTH the Home gathering card and the internal gathering header. Validates
// the production JSX (Star placement, bold duration, truncation, empty
// states) via react-dom/server (no jsdom / testing-library).

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => (key === 'journeyTypes.main_event' ? 'Main Event' : key),
    fmt: { formatDateTime: () => 'DT', formatDate: () => 'D' },
  }),
}));

import GatheringMetaLine from '@/components/tt/GatheringMetaLine';

function render(meta, className = '') {
  return renderToStaticMarkup(React.createElement(GatheringMetaLine, { meta, className }));
}

describe('GatheringMetaLine — EVENT mode', () => {
  it('renders a Star with accessible Main Event label + when · address', () => {
    const html = render({ mode: 'event', when: 'Oct 12, 11:15 PM', address: 'Central Park, New York, NY, USA' });
    expect(html).toContain('aria-label="Main Event"');
    expect(html).toContain('title="Main Event"');
    expect(html).toMatch(/<svg[^>]*>/); // Star
    expect(html).toContain('Oct 12, 11:15 PM');
    expect(html).toContain('Central Park, New York, NY, USA');
    expect(html).toContain('·');
  });

  it('full text exposed via container title attribute', () => {
    const html = render({ mode: 'event', when: 'Oct 12, 11:15 PM', address: '123 Main St' });
    expect(html).toContain('title="Oct 12, 11:15 PM · 123 Main St"');
  });

  it('partial: when only, no address separator', () => {
    const html = render({ mode: 'event', when: 'Oct 12, 11:15 PM', address: '' });
    expect(html).toContain('Oct 12, 11:15 PM');
    expect(html).not.toContain(' · ');
  });

  it('Star is shrink-0; text truncates with min-w-0', () => {
    const html = render({ mode: 'event', when: 'W', address: 'A' });
    expect(html).toMatch(/shrink-0/);
    expect(html).toMatch(/truncate/);
    expect(html).toMatch(/min-w-0/);
  });
});

describe('GatheringMetaLine — RANGE mode (no Main Event)', () => {
  it('renders start – end · (N days) with bold duration', () => {
    const html = render({ mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 19', days: 8, daysLabel: '8 days' });
    expect(html).toContain('Oct 12');
    expect(html).toContain('Oct 19');
    expect(html).toContain('–');
    expect(html).toContain('(8 days)');
    expect(html).toMatch(/<strong[^>]*>\(8 days\)<\/strong>/);
  });

  it('separator + bold duration is shrink-0 nowrap tail; date portion truncates', () => {
    const html = render({ mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 19', days: 8, daysLabel: '8 days' });
    expect(html).toMatch(/shrink-0/);
    expect(html).toMatch(/whitespace-nowrap/);
    expect(html).toMatch(/truncate/);
  });

  it('no Star in range mode', () => {
    const html = render({ mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 19', days: 8, daysLabel: '8 days' });
    expect(html).not.toContain('aria-label="Main Event"');
    expect(html).not.toContain('Main Event');
  });

  it('same-day: (1 day) bold', () => {
    const html = render({ mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 12', days: 1, daysLabel: '1 day' });
    expect(html).toContain('(1 day)');
    expect(html).toMatch(/<strong[^>]*>\(1 day\)<\/strong>/);
  });

  it('no daysLabel: renders range only, no separator/duration', () => {
    const html = render({ mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 19', days: 0, daysLabel: '' });
    expect(html).toContain('Oct 12');
    expect(html).not.toContain('(0');
    expect(html).not.toContain('<strong');
  });

  it('full text in title attribute', () => {
    const html = render({ mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 19', days: 8, daysLabel: '8 days' });
    expect(html).toContain('title="Oct 12 – Oct 19 · (8 days)"');
  });
});

describe('GatheringMetaLine — empty/partial states (truthful, never NaN)', () => {
  it('tbd mode renders nothing', () => {
    expect(render({ mode: 'tbd' })).toBe('');
  });

  it('null meta renders nothing', () => {
    expect(render(null)).toBe('');
  });

  it('event mode with no when and no address renders nothing', () => {
    expect(render({ mode: 'event', when: '', address: '' })).toBe('');
  });

  it('range mode with no dates and no daysLabel renders nothing', () => {
    expect(render({ mode: 'range', rangeStart: '', rangeEnd: '', days: 0, daysLabel: '' })).toBe('');
  });

  it('never renders NaN or undefined', () => {
    const html = render({ mode: 'range', rangeStart: '', rangeEnd: '', days: 0, daysLabel: '' });
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });
});

describe('GatheringShell — shares GatheringMetaLine with Home card via GatheringHero', () => {
  const shellSrc = readFileSync(resolve('src/components/GatheringShell.jsx'), 'utf8');
  const heroSrc = readFileSync(resolve('src/components/tt/GatheringHero.jsx'), 'utf8');

  it('GatheringShell delegates the header to GatheringHero', () => {
    expect(shellSrc).toContain('GatheringHero');
  });

  it('GatheringHero imports and renders <GatheringMetaLine meta={meta} />', () => {
    expect(heroSrc).toContain('GatheringMetaLine');
    expect(heroSrc).toMatch(/<GatheringMetaLine\s+meta=\{meta\}/);
  });

  it('neither the shell nor the hero uses formatGatheringRange/deriveGatheringLocation', () => {
    expect(shellSrc).not.toContain('formatGatheringRange');
    expect(shellSrc).not.toContain('deriveGatheringLocation');
    expect(shellSrc).not.toContain('destinationMapsUrl');
    expect(heroSrc).not.toContain('formatGatheringRange');
    expect(heroSrc).not.toContain('deriveGatheringLocation');
  });
});