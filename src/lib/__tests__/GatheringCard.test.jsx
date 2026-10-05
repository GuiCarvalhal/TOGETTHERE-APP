import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// SSR validation of the GatheringCard markup (no jsdom / testing-library —
// uses react-dom/server which ships with react-dom). The shared
// GatheringMetaLine is mocked so we can assert the card DELEGATES metadata to
// it (proving Home card + internal header share one component) and passes the
// structured meta through unchanged.

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => (key === 'journeyTypes.main_event' ? 'Main Event' : key),
    fmt: { formatDateTime: () => 'DT', formatDate: () => 'D' },
  }),
}));
vi.mock('@/components/ui/image', () => ({
  Image: (props) => React.createElement('img', { alt: props.alt, 'data-src': props.src, 'data-fit': props.fittingType }),
}));
vi.mock('@/components/tt/AvatarStack', () => ({
  default: ({ people }) => React.createElement('div', { 'data-testid': 'avatars', 'data-count': (people || []).length }),
}));
let lastMeta = null;
vi.mock('@/components/tt/GatheringMetaLine', () => ({
  default: ({ meta }) => {
    lastMeta = meta;
    return React.createElement('div', { 'data-testid': 'meta-line', 'data-mode': meta?.mode || 'none' });
  },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }) => React.createElement('a', { href: to, className }, children),
}));

import GatheringCard from '@/components/tt/cards/GatheringCard';

const baseGathering = { name: 'Sardinia 2026', cover_image: 'https://x/cover.jpg' };

function render(overrides = {}) {
  const props = {
    gathering: baseGathering,
    dateLabel: 'In 3 days',
    meta: { mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 19', days: 8, daysLabel: '8 days' },
    role: 'member',
    people: [],
    to: '/g/1/journey',
    ...overrides,
  };
  lastMeta = null;
  return renderToStaticMarkup(React.createElement(GatheringCard, props));
}

describe('GatheringCard — delegates metadata to shared GatheringMetaLine', () => {
  it('renders the GatheringMetaLine component (shared with internal header)', () => {
    const html = render();
    expect(html).toContain('data-testid="meta-line"');
  });

  it('passes the structured meta through unchanged', () => {
    render({ meta: { mode: 'event', when: 'Oct 12, 11:15 PM', address: '123 Main St' } });
    expect(lastMeta).toEqual({ mode: 'event', when: 'Oct 12, 11:15 PM', address: '123 Main St' });
  });

  it('no Star next to the gathering name (Star lives in the metadata line)', () => {
    const html = render({ meta: { mode: 'event', when: 'W', address: 'A' } });
    expect(html).not.toContain('aria-label="Main Event"');
  });

  it('the <h3> name contains no svg (Star moved to metadata)', () => {
    const html = render();
    const h3Match = html.match(/<h3[^>]*>.*?<\/h3>/s);
    expect(h3Match).toBeTruthy();
    expect(h3Match[0]).not.toContain('svg');
  });
});

describe('GatheringCard — event vs range meta modes', () => {
  it('event meta: data-mode="event"', () => {
    const html = render({ meta: { mode: 'event', when: 'Oct 12, 11:15 PM', address: 'Central Park' } });
    expect(html).toContain('data-mode="event"');
  });

  it('range meta: data-mode="range"', () => {
    const html = render({ meta: { mode: 'range', rangeStart: 'Oct 12', rangeEnd: 'Oct 19', days: 8, daysLabel: '8 days' } });
    expect(html).toContain('data-mode="range"');
  });

  it('tbd meta: data-mode="tbd"', () => {
    const html = render({ meta: { mode: 'tbd' } });
    expect(html).toContain('data-mode="tbd"');
  });
});