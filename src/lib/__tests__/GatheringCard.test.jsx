import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// SSR validation of the GatheringCard markup (no jsdom / testing-library —
// uses react-dom/server which ships with react-dom). Dependencies that touch
// the browser/router are mocked so we exercise the production component's
// own JSX (Star indicator, single truncate line, title attribute) — not a
// copy of its logic.

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
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }) => React.createElement('a', { href: to, className }, children),
}));

import GatheringCard from '@/components/tt/cards/GatheringCard';

const baseGathering = { name: 'Sardinia 2026', cover_image: 'https://x/cover.jpg' };

function render(overrides = {}) {
  const props = {
    gathering: baseGathering,
    dateLabel: 'In 3 days',
    metaLine: 'Oct 12 – Oct 19 (8 days)',
    isMainEvent: false,
    role: 'member',
    people: [],
    to: '/g/1/journey',
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(GatheringCard, props));
}

describe('GatheringCard — Main Event branch', () => {
  it('renders a Star indicator with an accessible Main Event label', () => {
    const html = render({ isMainEvent: true, metaLine: 'Oct 12, 11:15 PM · Central Park, New York, NY, USA' });
    expect(html).toContain('aria-label="Main Event"');
    expect(html).toContain('title="Main Event"');
    // Star icon renders as an svg
    expect(html).toMatch(/<svg[^>]*>/);
  });

  it('renders only one metadata line (no second address/range row)', () => {
    const html = render({ isMainEvent: true, metaLine: 'Oct 12, 11:15 PM · Central Park, New York, NY, USA' });
    // exactly one <p> metadata line
    const pCount = (html.match(/<p /g) || []).length;
    expect(pCount).toBe(1);
    expect(html).toContain('Central Park, New York, NY, USA');
  });

  it('no Star when not a Main Event', () => {
    const html = render({ isMainEvent: false });
    expect(html).not.toContain('aria-label="Main Event"');
  });
});

describe('GatheringCard — no Main Event branch', () => {
  it('renders the range+days line and NO address separator (·) when none provided', () => {
    const html = render({ isMainEvent: false, metaLine: 'Oct 12 – Oct 19 (8 days)' });
    expect(html).toContain('Oct 12 – Oct 19 (8 days)');
    expect(html).not.toContain(' · ');
  });
});

describe('GatheringCard — single-line truncation', () => {
  it('metadata line is truncated with the full text in title', () => {
    const longLine = 'Oct 12, 11:15 PM · A very long address that should truncate and not overflow the card at 320px width whatever happens';
    const html = render({ isMainEvent: true, metaLine: longLine });
    expect(html).toContain('class="');
    // the metadata <p> carries the truncate utility and a title attribute
    expect(html).toMatch(/<p [^>]*truncate[^>]*title="[^"]*"/);
    expect(html).toContain(`title="${longLine}"`);
  });

  it('renders without error when metaLine is empty', () => {
    const html = render({ isMainEvent: false, metaLine: '' });
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });
});