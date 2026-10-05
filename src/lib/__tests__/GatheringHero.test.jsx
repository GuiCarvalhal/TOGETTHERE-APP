import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// SSR regression for the GatheringShell hero header — narrowly scoped to the
// long-name containment / action-text reserved-separation fix. Validates the
// production JSX via react-dom/server (no jsdom / testing-library).

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key) => (key === 'journeyTypes.main_event' ? 'Main Event' : key),
    fmt: { formatDateTime: () => 'DT', formatDate: () => 'D' },
  }),
}));
vi.mock('@/components/ui/image', () => ({
  Image: (props) =>
    React.createElement('img', {
      alt: props.alt,
      'data-src': props.src,
      'data-fit': props.fittingType,
      className: props.className,
    }),
}));

import GatheringHero from '@/components/tt/GatheringHero';

const LONG_NAME =
  'Sardinia Late Summer Reunion and Mediterranean Coastal Voyage with Extended Family and Friends 2026';

function renderHero({
  name = LONG_NAME,
  role = 'owner',
  cover_image = 'https://example.com/cover.jpg',
  whatsapp_url,
  music_url,
} = {}) {
  const gathering = { name, cover_image, whatsapp_url, music_url };
  const meta = {
    mode: 'range',
    rangeStart: 'Oct 10',
    rangeEnd: 'Oct 17',
    days: 7,
    daysLabel: '7 days',
  };
  return renderToStaticMarkup(
    <MemoryRouter>
      <GatheringHero
        id="g1"
        gathering={gathering}
        role={role}
        dateStatusLabel="In 5 days"
        meta={meta}
      />
    </MemoryRouter>
  );
}

describe('GatheringHero long-name containment', () => {
  it('h1 is one-line truncated (no tt-text-balance) with full name in title for accessibility', () => {
    const html = renderHero();
    expect(html).toContain('truncate');
    expect(html).not.toContain('tt-text-balance');
    // Full name survives in the DOM text AND the title attribute.
    expect(html).toContain(LONG_NAME);
    expect(html).toContain(`title="${LONG_NAME}"`);
  });

  it('text band is in normal flow (relative), not an absolute inset-0 overlay over actions', () => {
    const html = renderHero({ whatsapp_url: 'https://wa.me/x', music_url: 'https://spotify.com/x' });
    // Old overlap class must be gone.
    expect(html).not.toContain('absolute inset-0 flex flex-col justify-end');
    // New text band is relative with min-w-0.
    expect(html).toContain('relative p-4 sm:p-6 min-w-0');
  });

  it('actions precede text in DOM order (reserved vertical separation)', () => {
    const html = renderHero({ whatsapp_url: 'https://wa.me/x', music_url: 'https://spotify.com/x' });
    const actionsIdx = html.indexOf('relative flex justify-end items-center gap-2 p-3');
    const textIdx = html.indexOf('tt-label text-white/80');
    expect(actionsIdx).toBeGreaterThan(-1);
    expect(textIdx).toBeGreaterThan(-1);
    expect(actionsIdx).toBeLessThan(textIdx);
  });

  it('min-w-0 is present on the text containers (truncation chain holds at 320px)', () => {
    const html = renderHero();
    const minW0Count = (html.match(/min-w-0/g) || []).length;
    expect(minW0Count).toBeGreaterThanOrEqual(2);
  });

  it('hero uses min-height + flex-col so it grows to fit content rather than fixed overlap', () => {
    const html = renderHero();
    expect(html).toContain('min-h-[124px]');
    expect(html).toContain('flex flex-col');
  });

  it('action touch targets stay 44px (w-11 h-11) and are not hidden', () => {
    const html = renderHero({ whatsapp_url: 'https://wa.me/x' });
    expect(html).toContain('w-11 h-11');
    expect(html).toContain('aria-label="Open WhatsApp group"');
  });

  it('viewers without whatsapp/music render no action band; text still contained', () => {
    const html = renderHero({ role: 'member', cover_image: null });
    expect(html).not.toContain('relative flex justify-end items-center gap-2 p-3');
    expect(html).toContain('truncate');
    expect(html).toContain(`title="${LONG_NAME}"`);
  });
});