export const FLIGHT_ENRICHMENT_VERSION = 'flight-enrichment-v2';
export const isCodeLike = value => /^[A-Z]{2,3}$/.test((value || '').trim());

export default function flightEnrichmentInput(item) {
  const flight = item?.type === 'flight';
  const title = String(item?.title || '');
  const route = flight ? title.match(/\b([A-Z]{3})\b\s*(?:→|->|-)\s*\b([A-Z]{3})\b/) : null;
  const titleAirline = flight ? (title.match(/^[Ff]light\s+\S+\s+[—–-]\s+(.+)$/)?.[1] || title.match(/^(.+?)\s+[A-Z]{2}\d{1,4}$/)?.[1] || '').trim() : '';
  const payload = {
    flight_number: (item?.confirmation_number || '').trim().toUpperCase().replace(/\s+/g, ''),
    date: item?.start_datetime?.slice(0, 10) || '',
    from_iata: (item?.from_place?.iata || route?.[1] || '').toUpperCase(),
    to_iata: (item?.to_place?.iata || route?.[2] || '').toUpperCase(),
    from_place_id: item?.from_place?.place_id || '',
    to_place_id: item?.to_place?.place_id || '',
  };
  const airline = item?.airline || titleAirline;
  const fromCity = isCodeLike(item?.from_place?.city) ? '' : item?.from_place?.city || '';
  const toCity = isCodeLike(item?.to_place?.city) ? '' : item?.to_place?.city || '';
  const lookupFlight = !!payload.flight_number && !!payload.date;
  const needsFetch = flight && ((!airline && lookupFlight) || (!fromCity && (lookupFlight || payload.from_iata || payload.from_place_id)) || (!toCity && (lookupFlight || payload.to_iata || payload.to_place_id)));
  return { payload, airline, fromCity, toCity, flight, needsFetch: !!needsFetch, key: `${FLIGHT_ENRICHMENT_VERSION}:${JSON.stringify(payload)}` };
}