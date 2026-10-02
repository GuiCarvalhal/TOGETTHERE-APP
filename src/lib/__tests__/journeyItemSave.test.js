import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the base44 client so submitJourneyItem never hits the network.
vi.mock('@/api/base44Client', () => ({
  base44: {
    functions: { invoke: vi.fn() },
  },
}));

import { buildJourneyPayload, submitJourneyItem } from '@/lib/journeyItemSave';
import { base44 } from '@/api/base44Client';

const base = {
  gatheringId: 'g1',
  currentMember: { user_id: 'u1' },
  item: null,
  startTz: 'America/New_York',
  endTz: 'Europe/London',
  meta: { fromTo: true, place: false },
};

describe('buildJourneyPayload — airline + place.city whitelist', () => {
  it('includes airline and place city for a flight', () => {
    const form = {
      type: 'flight', title: 'Flight BA208 — British Airways',
      start_datetime: '2026-10-15T18:00', end_datetime: '2026-10-16T08:00',
      location_from: 'Miami Airport', location_to: 'London Heathrow',
      from_place: { place_id: 'p1', name: 'Miami Airport', city: 'Miami', country: 'US', iata: 'MIA', tz: 'America/New_York' },
      to_place: { place_id: 'p2', name: 'London Heathrow', city: 'London', country: 'GB', iata: 'LHR', tz: 'Europe/London' },
      confirmation_number: 'BA208', booking_reference: 'ABC123',
      airline: 'British Airways', notes: 'note', attachments: [],
    };
    const payload = buildJourneyPayload({ ...base, form, attendeeIds: ['u2'] });
    expect(payload.airline).toBe('British Airways');
    expect(payload.from_place.city).toBe('Miami');
    expect(payload.to_place.city).toBe('London');
    expect(payload.confirmation_number).toBe('BA208');
    expect(payload.attendee_user_ids).toEqual(['u2']);
    expect(payload.type).toBe('flight');
  });

  it('preserves a cleared airline as empty string (not undefined) so update clears a stale value', () => {
    const form = {
      type: 'flight', title: 'Flight BA208',
      start_datetime: '2026-10-15T18:00', end_datetime: '2026-10-16T08:00',
      location_from: 'MIA', location_to: 'LHR',
      from_place: { iata: 'MIA', city: 'Miami' }, to_place: { iata: 'LHR', city: 'London' },
      confirmation_number: 'BA208', booking_reference: '', airline: '', notes: '', attachments: [],
    };
    const payload = buildJourneyPayload({ ...base, form, attendeeIds: [] });
    expect(payload.airline).toBe('');
    expect('airline' in payload).toBe(true);
  });
});

describe('submitJourneyItem — forwards whitelist end-to-end', () => {
  beforeEach(() => { base44.functions.invoke.mockReset(); });

  it('edit forwards payload (with airline + city) to updateJourneyItem', async () => {
    base44.functions.invoke.mockResolvedValue({ ok: true });
    const payload = { airline: 'British Airways', from_place: { city: 'Miami' }, type: 'flight' };
    await submitJourneyItem({ isEdit: true, gatheringId: 'g1', itemId: 'i1', payload });
    expect(base44.functions.invoke).toHaveBeenCalledWith('updateJourneyItem', { gathering_id: 'g1', item_id: 'i1', payload });
    const sent = base44.functions.invoke.mock.calls[0][1].payload;
    expect(sent.airline).toBe('British Airways');
    expect(sent.from_place.city).toBe('Miami');
  });

  it('add forwards payload to createJourneyItem', async () => {
    base44.functions.invoke.mockResolvedValue({ item: { id: 'new' } });
    const payload = { airline: '', type: 'flight' };
    await submitJourneyItem({ isEdit: false, gatheringId: 'g1', itemId: null, payload });
    expect(base44.functions.invoke).toHaveBeenCalledWith('createJourneyItem', { gathering_id: 'g1', payload });
  });
});