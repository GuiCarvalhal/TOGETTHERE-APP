import { describe, it, expect } from 'vitest';
import { nextBriefTips, haversineMeters, briefFamily } from '../nextBriefTips';

const ids = (tips) => tips.map((t) => t.id);

describe('nextBriefTips', () => {
  it('always returns exactly 3 tips per family', () => {
    expect(nextBriefTips({ type: 'flight', title: 'BA208' })).toHaveLength(3);
    expect(nextBriefTips({ type: 'car', title: 'Drive' })).toHaveLength(3);
    expect(nextBriefTips({ type: 'hotel', title: 'Stay' })).toHaveLength(3);
    expect(nextBriefTips({ type: 'other', title: 'Thing' })).toHaveLength(3);
    expect(nextBriefTips(null)).toHaveLength(0);
  });

  it('classifies families by item type', () => {
    expect(briefFamily('flight')).toBe('flight');
    expect(briefFamily('car')).toBe('transfer');
    expect(briefFamily('train')).toBe('transfer');
    expect(briefFamily('cruise')).toBe('transfer');
    expect(briefFamily('hotel')).toBe('stay');
    expect(briefFamily('activity')).toBe('stay');
    expect(briefFamily('main_event')).toBe('stay');
    expect(briefFamily('other')).toBe('stay');
  });

  it('uses the flight-number tip when a flight number and time exist', () => {
    const tips = nextBriefTips(
      { type: 'flight', confirmation_number: 'BA208', from_place: { city: 'Miami' }, to_place: { city: 'London' } },
      { time: '9:40 PM' },
    );
    expect(ids(tips)).toEqual(['gate', 'airport', 'landing']);
    expect(tips[0].detailKey).toBe('home.brief.flightGateDetail');
    expect(tips[0].vars).toEqual({ flight: 'BA208', time: '9:40 PM' });
    expect(tips[1].detailKey).toBe('home.brief.flightAirportDetail');
    expect(tips[1].vars.origin).toBe('Miami');
    expect(tips[2].titleKey).toBe('home.brief.flightArrivalTitle');
    expect(tips[2].vars.city).toBe('London');
  });

  it('degrades flight tips when nothing but the type is known', () => {
    const tips = nextBriefTips({ type: 'flight' });
    expect(tips[0].detailKey).toBe('home.brief.flightGateDetailGeneric');
    expect(tips[1].detailKey).toBe('home.brief.flightAirportDetailNoPlace');
    expect(tips[2].titleKey).toBe('home.brief.flightArrivalTitleNoCity');
  });

  it('uses distance and departure timing for transfers', () => {
    const tips = nextBriefTips(
      { type: 'car', from_place: { city: 'Naples' }, to_place: { city: 'Amalfi' } },
      { time: '10:00 AM', distanceLabel: '34 mi' },
    );
    expect(ids(tips)).toEqual(['depart', 'route', 'dropoff']);
    expect(tips[0].detailKey).toBe('home.brief.transferDepartDetail');
    expect(tips[1].detailKey).toBe('home.brief.transferRouteDetail');
    expect(tips[1].vars.distance).toBe('34 mi');
    expect(tips[2].vars.to).toBe('Amalfi');
  });

  it('degrades transfer tips without time, place or distance', () => {
    const tips = nextBriefTips({ type: 'train' });
    expect(tips[0].detailKey).toBe('home.brief.transferDepartDetailGeneric');
    expect(tips[1].detailKey).toBe('home.brief.transferRouteDetailNoData');
    expect(tips[2].detailKey).toBe('home.brief.transferArrivalDetailGeneric');
  });

  it('uses place and confirmation for stays', () => {
    const tips = nextBriefTips(
      { type: 'hotel', place: { name: 'Hotel Santa Caterina' }, confirmation_number: 'ABC123' },
      { time: '3:00 PM' },
    );
    expect(ids(tips)).toEqual(['timing', 'nearby', 'prep']);
    expect(tips[0].detailKey).toBe('home.brief.stayTimingDetail');
    expect(tips[0].vars).toEqual({ time: '3:00 PM', place: 'Hotel Santa Caterina' });
    expect(tips[1].detailKey).toBe('home.brief.stayNearbyDetail');
    expect(tips[2].detailKey).toBe('home.brief.stayPrepDetail');
    expect(tips[2].vars.confirmation).toBe('ABC123');
  });

  it('prefers the city over the place name for labels', () => {
    const tips = nextBriefTips({
      type: 'activity',
      place: { name: 'Colosseum', city: 'Rome' },
    });
    expect(tips[0].vars.place).toBe('Rome');
  });

  it('computes a straight-line distance only when both ends have coordinates', () => {
    expect(haversineMeters({ lat: 40.85, lng: 14.27 }, { lat: 40.63, lng: 14.6 })).toBeGreaterThan(30000);
    expect(haversineMeters({ lat: 40.85 }, { lat: 40.63, lng: 14.6 })).toBeNull();
    expect(haversineMeters(null, { lat: 1, lng: 1 })).toBeNull();
  });
});