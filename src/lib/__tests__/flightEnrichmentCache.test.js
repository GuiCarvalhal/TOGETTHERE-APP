import { describe, it, expect, vi } from 'vitest';
import createFlightEnrichmentCache from '@/lib/flightEnrichmentCache';
import flightEnrichmentInput, { FLIGHT_ENRICHMENT_VERSION } from '@/lib/flightEnrichmentInput';

const response = (fields = {}, errors = [], warnings = []) => ({ data: { airline: '', from_city: '', to_city: '', ...fields, errors, warnings, version: FLIGHT_ENRICHMENT_VERSION } });
const transient = { field: 'to_city', source: 'google.places', code: 'RATE_LIMITED', message: 'Rate limited.', retryable: true };

describe('flight enrichment client cache', () => {
  it('retains known fields, dedupes, and retries transient failures at most twice later', async () => {
    let time = 1000;
    const invoke = vi.fn().mockResolvedValueOnce(response({ airline: 'American Airlines', from_city: 'São Paulo' }, [transient])).mockRejectedValue(new Error('offline'));
    const load = createFlightEnrichmentCache(invoke, () => time);
    const [first, duplicate] = await Promise.all([load('key', {}), load('key', {})]);
    expect(first).toEqual(duplicate);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(first.retryAt).toBe(31000);
    await load('key', {});
    expect(invoke).toHaveBeenCalledTimes(1);
    time = first.retryAt;
    const second = await load('key', {});
    expect(second).toMatchObject({ airline: 'American Airlines', from_city: 'São Paulo', retryAt: 91000 });
    time = second.retryAt;
    const third = await load('key', {});
    expect(third.retryAt).toBe(0);
    expect(third.errors[0].source).toBe('enrichment');
    await load('key', {});
    expect(invoke).toHaveBeenCalledTimes(3);
    time += 300001;
    await load('key', {});
    expect(invoke).toHaveBeenCalledTimes(4);
  });
  it('fills partial values on recovery and never loses previous successful values', async () => {
    let time = 1000;
    const invoke = vi.fn().mockResolvedValueOnce(response({ from_city: 'São Paulo' }, [transient])).mockResolvedValueOnce(response({ airline: 'American Airlines', to_city: 'Miami' }));
    const load = createFlightEnrichmentCache(invoke, () => time);
    const first = await load('key', {});
    time = first.retryAt;
    expect(await load('key', {})).toMatchObject({ airline: 'American Airlines', from_city: 'São Paulo', to_city: 'Miami', errors: [], retryAt: 0 });
  });
  it('missing results have a short cooldown rather than permanent suppression', async () => {
    let time = 1000;
    const invoke = vi.fn().mockResolvedValue(response({}, [], [{ field: 'airline', source: 'aerodatabox.flight', code: 'NOT_FOUND', retryable: false }]));
    const load = createFlightEnrichmentCache(invoke, () => time);
    expect((await load('key', {})).retryAt).toBe(0);
    await load('key', {});
    expect(invoke).toHaveBeenCalledTimes(1);
    time += 60001;
    await load('key', {});
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it('does not retry recovered fields unnecessarily, and rejects stale success-shaped responses', async () => {
    const invoke = vi.fn().mockResolvedValueOnce(response({ to_city: 'Miami' }, [transient])).mockResolvedValueOnce({ data: { airline: '', from_city: '', to_city: '' } });
    const load = createFlightEnrichmentCache(invoke, () => 1000);
    expect((await load('recovered', {})).retryAt).toBe(0);
    const stale = await load('stale', {});
    expect(stale.errors[0].retryable).toBe(true);
    expect(stale.retryAt).toBe(31000);
  });
  it('the normal exact legacy key is versioned and no-place flights still request route resolution', () => {
    const normal = flightEnrichmentInput({ type: 'flight', title: 'GRU → MIA', confirmation_number: 'AA906', start_datetime: '2026-06-27T22:15:00-04:00', from_place: { place_id: 'from', country: 'BR' }, to_place: { place_id: 'to', country: 'US' } });
    expect(normal.payload).toEqual({ flight_number: 'AA906', date: '2026-06-27', from_iata: 'GRU', to_iata: 'MIA', from_place_id: 'from', to_place_id: 'to' });
    expect(normal.key.startsWith(`${FLIGHT_ENRICHMENT_VERSION}:`)).toBe(true);
    const missingPlaces = flightEnrichmentInput({ type: 'flight', title: 'Air Canada AC095', confirmation_number: 'AC095', start_datetime: '2026-07-08T10:00:00-04:00' });
    expect(missingPlaces.needsFetch).toBe(true);
    expect(missingPlaces.airline).toBe('Air Canada');
    expect(flightEnrichmentInput({ type: 'hotel' }).needsFetch).toBe(false);
  });
});