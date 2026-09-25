import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PlaceAutocomplete from '@/components/journey/PlaceAutocomplete';
import FlightResultList from '@/components/journey/FlightResultList';
import { isoToWallInput } from '@/lib/formatPlaceTime';
import { parseUtcIso, normalizeNumber, extractIata } from '@/lib/flightSearch';
import { Loader2, Plane, Search, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

// Flight segment editor shown only when type === 'flight'. Combines an
// optional AeroDataBox search (by flight number OR by route) with
// always-editable manual fields (origin, destination, flight #, booking ref).
// Selecting a search result auto-fills the route, times (in airport-local wall
// time), and places; the user can still tweak any field afterwards. All fields
// are the parent form's, so saving never loses other data.
//
// Props: form, setForm (parent state), setStartTouched/setEndTouched (so the
// place-tz re-derive effect doesn't overwrite the flight's scheduled times),
// gatheringStartDate (default departure date for the search).
export default function FlightEditor({ form, setForm, setStartTouched, setEndTouched, gatheringStartDate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState('number');
  const [searchDate, setSearchDate] = useState(gatheringStartDate || (form.start_datetime ? form.start_datetime.slice(0, 10) : today));
  const [flightNumber, setFlightNumber] = useState(form.confirmation_number || '');
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Editing origin/destination/flight# manually invalidates a prior selection.
  function onFromText(v) { setForm((f) => ({ ...f, location_from: v, from_place: null })); setSelected(null); }
  function onFromSelect(p) { setForm((f) => ({ ...f, from_place: p })); setSelected(null); }
  function onToText(v) { setForm((f) => ({ ...f, location_to: v, to_place: null })); setSelected(null); }
  function onToSelect(p) { setForm((f) => ({ ...f, to_place: p })); setSelected(null); }

  async function runSearch() {
    setError(null);
    setResults([]);
    setSelected(null);
    if (!searchDate) { toast({ title: 'Pick a departure date', variant: 'destructive' }); return; }
    if (mode === 'number') {
      const fn = flightNumber.trim();
      if (!fn) { toast({ title: 'Enter a flight number', description: 'e.g. AA123', variant: 'destructive' }); return; }
      setSearching(true);
      try {
        const res = await base44.functions.invoke('searchFlights', { flight_number: fn, date: searchDate });
        const data = res.data || res;
        if (data.error) { setError(data.error); return; }
        setResults(data.results || []);
        if (!data.results?.length) setError(`No flights found for ${fn.toUpperCase()} on ${searchDate}. Check the number and date, or try searching by route.`);
      } catch (e) {
        setError(e.response?.data?.error || e.message || 'Search failed. You can still enter the details manually.');
      } finally { setSearching(false); }
    } else {
      const o = form.from_place, d = form.to_place;
      if (!o?.lat || !d?.lat) { toast({ title: 'Choose both airports', description: 'Pick an origin and destination airport from the suggestions.', variant: 'destructive' }); return; }
      setSearching(true);
      try {
        const res = await base44.functions.invoke('searchFlights', {
          origin_lat: o.lat, origin_lng: o.lng, origin_iata: extractIata(o),
          dest_lat: d.lat, dest_lng: d.lng, dest_iata: extractIata(d),
          date: searchDate,
        });
        const data = res.data || res;
        if (data.error) { setError(data.error); return; }
        setResults(data.results || []);
        if (!data.results?.length) setError(`No flights found from ${form.location_from} to ${form.location_to} on ${searchDate}.`);
      } catch (e) {
        setError(e.response?.data?.error || e.message || 'Search failed. You can still enter the details manually.');
      } finally { setSearching(false); }
    }
  }

  async function applyFlight(r) {
    const depIso = parseUtcIso(r.dep_utc);
    const arrIso = parseUtcIso(r.arr_utc);
    let fromPlace, toPlace;
    if (mode === 'route' && form.from_place && form.to_place) {
      // Route mode: the user already picked Google Places — just attach the IATA + tz.
      fromPlace = { ...form.from_place, iata: r.dep_iata, tz: r.dep_tz || form.from_place.tz || '' };
      toPlace = { ...form.to_place, iata: r.arr_iata, tz: r.arr_tz || form.to_place.tz || '' };
    } else {
      // Number mode: resolve the API airports to full Google Places (place_id, lat/lng, tz).
      setResolving(true);
      try {
        const res = await base44.functions.invoke('resolveFlightAirports', { from_iata: r.dep_iata, to_iata: r.arr_iata });
        const data = res.data || res;
        fromPlace = data.from_place || { iata: r.dep_iata, name: r.dep_name || r.dep_iata, tz: r.dep_tz || '' };
        toPlace = data.to_place || { iata: r.arr_iata, name: r.arr_name || r.arr_iata, tz: r.arr_tz || '' };
      } catch {
        fromPlace = { iata: r.dep_iata, name: r.dep_name || r.dep_iata, tz: r.dep_tz || '' };
        toPlace = { iata: r.arr_iata, name: r.arr_name || r.arr_iata, tz: r.arr_tz || '' };
      } finally { setResolving(false); }
    }
    setStartTouched(true);
    setEndTouched(true);
    setForm((s) => ({
      ...s,
      confirmation_number: normalizeNumber(r.number),
      title: s.title || `Flight ${r.number}${r.airline_name ? ' — ' + r.airline_name : ''}`,
      location_from: fromPlace.name || r.dep_iata,
      from_place: fromPlace,
      location_to: toPlace.name || r.arr_iata,
      to_place: toPlace,
      start_datetime: depIso ? isoToWallInput(depIso, fromPlace.tz || r.dep_tz) : s.start_datetime,
      end_datetime: arrIso ? isoToWallInput(arrIso, toPlace.tz || r.arr_tz) : s.end_datetime,
    }));
    setSelected(r);
    setResults([]);
  }

  return (
    <div className="space-y-4">
      {/* Origin / Destination — always editable; also used by route search */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-ink-deep">From</Label>
          <PlaceAutocomplete
            value={form.location_from}
            onText={onFromText}
            onSelect={onFromSelect}
            placeholder="Origin airport"
            types="airport"
            className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-ink-deep">To</Label>
          <PlaceAutocomplete
            value={form.location_to}
            onText={onToText}
            onSelect={onToSelect}
            placeholder="Destination airport"
            types="airport"
            className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
          />
        </div>
      </div>

      {/* Search helper */}
      <div className="tt-ink-panel p-3 space-y-3">
        <div className="flex items-center gap-2 text-ink-deep">
          <Plane className="w-4 h-4 text-terra" />
          <span className="font-display font-semibold text-sm">Find a flight</span>
        </div>
        <div className="space-y-1.5">
          <Label className="text-ink-deep text-xs">Departure date</Label>
          <Input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-ink-soft">
          {['number', 'route'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setResults([]); setError(null); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${mode === m ? 'bg-card text-ink-deep shadow-sm' : 'text-ink-deep/55'}`}
            >
              {m === 'number' ? 'By flight number' : 'By route'}
            </button>
          ))}
        </div>
        {mode === 'number' && (
          <div className="space-y-1.5">
            <Label className="text-ink-deep text-xs">Flight number</Label>
            <Input
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value)}
              placeholder="AA123"
              className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
            />
          </div>
        )}
        {mode === 'route' && (
          <p className="text-xs text-ink-deep/55">Searches from the origin and destination airports above.</p>
        )}
        <Button type="button" onClick={runSearch} disabled={searching} className="w-full bg-terra hover:bg-terra-deep text-cream rounded-full">
          {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          {searching ? 'Searching…' : 'Search flights'}
        </Button>
        {error && <p className="text-xs text-terra-deep">{error}</p>}
        {resolving && <p className="text-xs text-ink-deep/60 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Resolving airport details…</p>}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="tt-label text-ink-deep/60">{results.length} flight{results.length > 1 ? 's' : ''} found — tap to fill</p>
          <FlightResultList results={results} selectedId={selected?.id} onSelect={applyFlight} />
        </div>
      )}

      {/* Selected summary */}
      {selected && (
        <div className="tt-card p-3 border-terra/30">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display font-semibold text-sm text-ink-deep">{selected.airline_name} · {selected.number}</p>
              <p className="text-xs text-ink-deep/60">{selected.dep_iata} → {selected.arr_iata}{selected.overnight ? ` · +${selected.day_shift} day${selected.day_shift > 1 ? 's' : ''}` : ''}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-ink-deep/50 hover:text-ink-deep shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Flight # + Booking ref — always editable */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-ink-deep">Flight #</Label>
          <Input
            value={form.confirmation_number}
            onChange={(e) => { setForm((f) => ({ ...f, confirmation_number: e.target.value })); setSelected(null); }}
            placeholder="BA208"
            className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-ink-deep">Booking ref</Label>
          <Input
            value={form.booking_reference || ''}
            onChange={(e) => setForm((f) => ({ ...f, booking_reference: e.target.value }))}
            placeholder="PNR"
            className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
          />
        </div>
      </div>
    </div>
  );
}