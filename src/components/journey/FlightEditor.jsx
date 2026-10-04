import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PlaceAutocomplete from '@/components/journey/PlaceAutocomplete';
import FlightResultList from '@/components/journey/FlightResultList';
import { isoToWallInput } from '@/lib/formatPlaceTime';
import { parseUtcIso, normalizeNumber, extractIata } from '@/lib/flightSearch';
import { useI18n } from '@/lib/i18n';
import { Loader2, Plane, Search, X, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

// Flight segment editor — the single owner of flight identity, airports,
// dates and times when type === 'flight'. Three views:
//  • search  — initial add / "Search another flight": departure date,
//              number/route mode, inputs, Search.
//  • summary — after a result is selected, or on edit with existing data:
//              compact confirmation + optional fields (booking ref, notes,
//              participants, attachments via the `optionalFields` prop).
//  • manual  — entered via "Enter manually instead" / "Edit manually":
//              Title, Departure/Arrival, From/To, Flight #, Booking ref.
//
// ROUTE-SEARCH STATE IS SEPARATE FROM THE FORM. The search panel's From/To
// inputs mutate ONLY searchFrom/searchTo state, never the saved form — so
// "Back to current flight" and saving without selecting a replacement leave
// the original flight unchanged. The manual-edit view edits the form
// directly (that IS editing the flight). A selected result is the only thing
// that writes to the form (via applyFlight).
//
// `onResolvingChange(boolean)` lifts the resolving flag to the parent so the
// Save button can be disabled while airport metadata is being resolved.
export default function FlightEditor({ form, setForm, setStartTouched, setEndTouched, gatheringStartDate, optionalFields, manual, setManual, onResolvingChange }) {
  const { t, fmt } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState('number');
  const [searchDate, setSearchDate] = useState(gatheringStartDate || (form.start_datetime ? form.start_datetime.slice(0, 10) : today));
  const [flightNumber, setFlightNumber] = useState(form.confirmation_number || '');
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [resolveWarning, setResolveWarning] = useState(null);
  const [selected, setSelected] = useState(null);
  // "Search another flight" (edit): exposes the search panel again without
  // clearing the existing flight from the form, so the original is preserved
  // until a replacement is selected and explicitly saved.
  const [searchAgain, setSearchAgain] = useState(false);

  // Separate route-SEARCH airport state (text + resolved place). Seeded from
  // the form on mount so edit shows the current airports as a starting point,
  // but editing these never touches the saved flight.
  const [searchFromText, setSearchFromText] = useState(form.location_from || '');
  const [searchFromPlace, setSearchFromPlace] = useState(form.from_place || null);
  const [searchToText, setSearchToText] = useState(form.location_to || '');
  const [searchToPlace, setSearchToPlace] = useState(form.to_place || null);

  // Monotonic request token: a stale search/resolve response (from an earlier
  // selection or search) can never overwrite a newer one.
  const reqSeq = useRef(0);

  // Lift resolving to the parent so Save disables mid-resolve.
  useEffect(() => { onResolvingChange?.(resolving); }, [resolving, onResolvingChange]);

  const hasFlight = !!(form.confirmation_number && form.from_place && form.to_place && form.start_datetime);
  const showSummary = (hasFlight || selected) && !manual && !searchAgain;
  const showSearch = !manual && (!showSummary || searchAgain);

  // Manual-edit handlers mutate the FORM (manual edit IS editing the flight).
  function onFromText(v) { setForm((f) => ({ ...f, location_from: v, from_place: null })); }
  function onFromSelect(p) { setForm((f) => ({ ...f, from_place: p })); }
  function onToText(v) { setForm((f) => ({ ...f, location_to: v, to_place: null })); }
  function onToSelect(p) { setForm((f) => ({ ...f, to_place: p })); }

  // Route-search handlers mutate ONLY search state — never the form.
  function onSearchFromText(v) { setSearchFromText(v); setSearchFromPlace(null); }
  function onSearchFromSelect(p) { setSearchFromText(p?.name || searchFromText); setSearchFromPlace(p); }
  function onSearchToText(v) { setSearchToText(v); setSearchToPlace(null); }
  function onSearchToSelect(p) { setSearchToText(p?.name || searchToText); setSearchToPlace(p); }

  async function runSearch() {
    setError(null); setResolveWarning(null); setResults([]); setSelected(null);
    if (!searchDate) { toast({ title: t('flightEditor.pickDepartureDate'), variant: 'destructive' }); return; }
    const seq = ++reqSeq.current;
    if (mode === 'number') {
      const fn = flightNumber.trim();
      if (!fn) { toast({ title: t('flightEditor.enterFlightNumber'), description: t('flightEditor.enterFlightNumberDesc'), variant: 'destructive' }); return; }
      setSearching(true);
      try {
        const res = await base44.functions.invoke('searchFlights', { flight_number: fn, date: searchDate });
        if (seq !== reqSeq.current) return; // a newer search/apply started
        const data = res.data || res;
        if (data.error) { setError(data.error); return; }
        setResults(data.results || []);
        if (!data.results?.length) setError(t('flightEditor.noFlightsNumber', { fn: fn.toUpperCase(), date: searchDate }));
      } catch (e) {
        if (seq !== reqSeq.current) return;
        setError(e.response?.data?.error || e.message || t('flightEditor.searchFailed'));
      } finally {
        if (seq === reqSeq.current) setSearching(false);
      }
    } else {
      const o = searchFromPlace, d = searchToPlace;
      if (!o?.lat || !d?.lat) { toast({ title: t('flightEditor.chooseBothAirports'), description: t('flightEditor.chooseBothAirportsDesc'), variant: 'destructive' }); return; }
      setSearching(true);
      try {
        const res = await base44.functions.invoke('searchFlights', {
          origin_lat: o.lat, origin_lng: o.lng, origin_iata: extractIata(o),
          dest_lat: d.lat, dest_lng: d.lng, dest_iata: extractIata(d),
          date: searchDate,
        });
        if (seq !== reqSeq.current) return;
        const data = res.data || res;
        if (data.error) { setError(data.error); return; }
        setResults(data.results || []);
        if (!data.results?.length) setError(t('flightEditor.noFlightsRoute', { from: searchFromText, to: searchToText, date: searchDate }));
      } catch (e) {
        if (seq !== reqSeq.current) return;
        setError(e.response?.data?.error || e.message || t('flightEditor.searchFailed'));
      } finally {
        if (seq === reqSeq.current) setSearching(false);
      }
    }
  }

  async function applyFlight(r) {
    // Duplicate selection guard: tapping the already-selected result is a no-op.
    if (selected?.id === r.id) return;
    const seq = ++reqSeq.current;
    setError(null); setResolveWarning(null);
    const depIso = parseUtcIso(r.dep_utc);
    const arrIso = parseUtcIso(r.arr_utc);
    let fromPlace, toPlace;
    let degraded = false;
    if (mode === 'route' && searchFromPlace && searchToPlace) {
      fromPlace = { ...searchFromPlace, iata: r.dep_iata, tz: r.dep_tz || searchFromPlace.tz || '' };
      toPlace = { ...searchToPlace, iata: r.arr_iata, tz: r.arr_tz || searchToPlace.tz || '' };
    } else {
      setResolving(true);
      try {
        const res = await base44.functions.invoke('resolveFlightAirports', { from_iata: r.dep_iata, to_iata: r.arr_iata });
        if (seq !== reqSeq.current) return; // stale — a newer selection/search started
        const data = res.data || res;
        fromPlace = data.from_place || null;
        toPlace = data.to_place || null;
        if (!fromPlace || !toPlace) degraded = true;
        if (fromPlace && !fromPlace.city) degraded = true;
        if (toPlace && !toPlace.city) degraded = true;
        if (!fromPlace) fromPlace = { iata: r.dep_iata, name: r.dep_name || r.dep_iata, tz: r.dep_tz || '' };
        if (!toPlace) toPlace = { iata: r.arr_iata, name: r.arr_name || r.arr_iata, tz: r.arr_tz || '' };
      } catch {
        if (seq !== reqSeq.current) return; // stale
        degraded = true;
        fromPlace = { iata: r.dep_iata, name: r.dep_name || r.dep_iata, tz: r.dep_tz || '' };
        toPlace = { iata: r.arr_iata, name: r.arr_name || r.arr_iata, tz: r.arr_tz || '' };
      } finally {
        if (seq === reqSeq.current) setResolving(false);
      }
    }
    if (seq !== reqSeq.current) return; // stale after awaits
    if (degraded) {
      setResolveWarning(t('flightEditor.airportIncomplete'));
    }
    // Airline: replace with the new result's known airline, or clear the stale
    // value (never keep the old carrier when changing flights).
    // Title: refresh an auto-generated title when changing flights; preserve a
    // truly custom title. An auto title matches "Flight <oldNumber>" or
    // "Flight <oldNumber> — <oldAirline>".
    const oldNum = (form.confirmation_number || '').trim();
    const oldAirline = form.airline || '';
    const autoTitleA = oldNum ? `Flight ${oldNum}` : '';
    const autoTitleB = (oldNum && oldAirline) ? `Flight ${oldNum} — ${oldAirline}` : '';
    const isAutoTitle = !!(form.title && (form.title === autoTitleA || form.title === autoTitleB));
    const newAutoTitle = `Flight ${r.number}${r.airline_name ? ' — ' + r.airline_name : ''}`;
    const nextTitle = isAutoTitle ? newAutoTitle : (form.title || newAutoTitle);
    setStartTouched(true);
    setEndTouched(true);
    setForm((s) => ({
      ...s,
      confirmation_number: normalizeNumber(r.number),
      airline: r.airline_name || '',
      title: nextTitle,
      location_from: fromPlace.name || r.dep_iata,
      from_place: fromPlace,
      location_to: toPlace.name || r.arr_iata,
      to_place: toPlace,
      start_datetime: depIso ? isoToWallInput(depIso, fromPlace.tz || r.dep_tz) : s.start_datetime,
      end_datetime: arrIso ? isoToWallInput(arrIso, toPlace.tz || r.arr_tz) : s.end_datetime,
    }));
    setSelected(r);
    setResults([]);
    setSearchAgain(false);
  }

  // Summary display reads from the FORM (source of truth after applyFlight),
  // so the stored airline shows on edit rather than a blank.
  const dispNumber = form.confirmation_number;
  const dispAirline = form.airline || '';
  const dispFromIata = form.from_place?.iata || '';
  const dispToIata = form.to_place?.iata || '';
  const dispFromName = form.from_place?.name || form.location_from || '';
  const dispToName = form.to_place?.name || form.location_to || '';
  const dispDepTime = fmtWall(form.start_datetime, fmt.locale);
  const dispArrTime = fmtWall(form.end_datetime, fmt.locale);
  const overnight = selected?.overnight || false;
  const dayShift = selected?.day_shift || 0;

  const warningNode = resolveWarning && (
    <p className="text-xs text-terra-deep flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{resolveWarning}</p>
  );

  return (
    <div className="space-y-4">
      {showSearch && (
        <>
          <div className="tt-ink-panel p-3 space-y-3">
            <div className="flex items-center gap-2 text-ink-deep">
              <Plane className="w-4 h-4 text-terra" />
              <span className="font-display font-semibold text-sm">{t('flightEditor.findFlight')}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-ink-deep text-xs">{t('flightEditor.departureDate')}</Label>
              <Input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <div className="flex gap-1 p-1 rounded-lg bg-ink-soft">
              {['number', 'route'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setResults([]); setError(null); setResolveWarning(null); }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${mode === m ? 'bg-card text-ink-deep shadow-sm' : 'text-ink-deep/55'}`}
                >
                  {m === 'number' ? t('flightEditor.byNumber') : t('flightEditor.byRoute')}
                </button>
              ))}
            </div>
            {mode === 'number' && (
              <div className="space-y-1.5">
                <Label className="text-ink-deep text-xs">{t('flightEditor.flightNumber')}</Label>
                <Input
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder={t('flightEditor.flightNumberPlaceholder')}
                  className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
                />
              </div>
            )}
            {mode === 'route' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-ink-deep text-xs">{t('flightEditor.from')}</Label>
                  <PlaceAutocomplete
                    value={searchFromText}
                    onText={onSearchFromText}
                    onSelect={onSearchFromSelect}
                    placeholder={t('flightEditor.originAirport')}
                    types="airport"
                    className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-ink-deep text-xs">{t('flightEditor.to')}</Label>
                  <PlaceAutocomplete
                    value={searchToText}
                    onText={onSearchToText}
                    onSelect={onSearchToSelect}
                    placeholder={t('flightEditor.destinationAirport')}
                    types="airport"
                    className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                  />
                </div>
              </div>
            )}
            <Button type="button" onClick={runSearch} disabled={searching} className="w-full bg-terra hover:bg-terra-deep text-cream rounded-full">
              {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              {searching ? t('flightEditor.searching') : t('flightEditor.searchFlights')}
            </Button>
            {error && <p className="text-xs text-terra-deep">{error}</p>}
            {resolving && <p className="text-xs text-ink-deep/60 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {t('flightEditor.resolvingAirports')}</p>}
            {warningNode}
          </div>
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="tt-label text-ink-deep/60">{t('flightEditor.flightsFound', { count: results.length })}</p>
              <FlightResultList results={results} selectedId={selected?.id} onSelect={applyFlight} />
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {searchAgain && (hasFlight || selected) && (
              <button type="button" onClick={() => setSearchAgain(false)} className="text-xs text-terra-deep hover:underline flex items-center gap-1">
                <X className="w-3 h-3" /> {t('flightEditor.backToCurrent')}
              </button>
            )}
            <button type="button" onClick={() => setManual(true)} className="text-xs text-terra-deep hover:underline flex items-center gap-1">
              <Pencil className="w-3 h-3" /> {t('flightEditor.enterManually')}
            </button>
          </div>
        </>
      )}

      {showSummary && (
        <>
          <div className="tt-card p-3 border-terra/30">
            <div>
              <p className="font-display font-semibold text-sm text-ink-deep">
                {dispAirline ? `${dispAirline} · ` : ''}{dispNumber}
              </p>
              <p className="text-xs text-ink-deep/60">
                {dispFromIata || dispFromName} → {dispToIata || dispToName}{overnight ? ` · ${t('flightEditor.overnightSuffix', { count: dayShift })}` : ''}
              </p>
              <p className="text-xs text-ink-deep/60 mt-0.5">{dispDepTime} → {dispArrTime}</p>
            </div>
          </div>
          {warningNode}
          <div className="space-y-1.5">
            <Label className="text-ink-deep">{t('flightEditor.titleOptional')} <span className="text-ink-deep/40 font-normal">{t('flightEditor.optionalSuffix')}</span></Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('journeyForm.titlePlaceholder')}
              className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-ink-deep">{t('journeyForm.bookingRef')}</Label>
            <Input
              value={form.booking_reference || ''}
              onChange={(e) => setForm((f) => ({ ...f, booking_reference: e.target.value }))}
              placeholder={t('journeyForm.bookingRefPlaceholder')}
              className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
            />
          </div>
          {optionalFields}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => { setSearchAgain(true); setResults([]); setError(null); setResolveWarning(null); }} className="text-xs text-terra-deep hover:underline flex items-center gap-1">
              <Search className="w-3 h-3" /> {t('flightEditor.searchAnother')}
            </button>
            <button type="button" onClick={() => setManual(true)} className="text-xs text-terra-deep hover:underline flex items-center gap-1">
              <Pencil className="w-3 h-3" /> {t('flightEditor.editManually')}
            </button>
          </div>
        </>
      )}

      {manual && (
        <>
          <div className="space-y-1.5">
            <Label className="text-ink-deep">{t('journeyForm.title')}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('journeyForm.titlePlaceholder')}
              className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-ink-deep">{t('flightEditor.departure')}</Label>
              <Input
                type="datetime-local"
                value={form.start_datetime}
                onChange={(e) => { setStartTouched(true); setForm((f) => ({ ...f, start_datetime: e.target.value })); }}
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-ink-deep">{t('flightEditor.arrival')}</Label>
              <Input
                type="datetime-local"
                value={form.end_datetime}
                onChange={(e) => { setEndTouched(true); setForm((f) => ({ ...f, end_datetime: e.target.value })); }}
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-ink-deep">{t('flightEditor.from')}</Label>
              <PlaceAutocomplete
                value={form.location_from}
                onText={onFromText}
                onSelect={onFromSelect}
                placeholder={t('flightEditor.originAirport')}
                types="airport"
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-ink-deep">{t('flightEditor.to')}</Label>
              <PlaceAutocomplete
                value={form.location_to}
                onText={onToText}
                onSelect={onToSelect}
                placeholder={t('flightEditor.destinationAirport')}
                types="airport"
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-ink-deep">{t('flightEditor.flightNum')}</Label>
              <Input
                value={form.confirmation_number}
                onChange={(e) => { setForm((f) => ({ ...f, confirmation_number: e.target.value })); setSelected(null); }}
                placeholder={t('flightEditor.flightNumPlaceholder')}
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-ink-deep">{t('journeyForm.bookingRef')}</Label>
              <Input
                value={form.booking_reference || ''}
                onChange={(e) => setForm((f) => ({ ...f, booking_reference: e.target.value }))}
                placeholder={t('journeyForm.bookingRefPlaceholder')}
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              />
            </div>
          </div>
          {optionalFields}
          <button type="button" onClick={() => setManual(false)} className="text-xs text-terra-deep hover:underline flex items-center gap-1">
            <Search className="w-3 h-3" /> {t('flightEditor.useSearch')}
          </button>
        </>
      )}
    </div>
  );
}

function fmtWall(s, locale) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(locale || 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}