import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { shouldSearch } from '@/lib/placeAutocompleteLogic';
import { Loader2, MapPin, CornerDownLeft } from 'lucide-react';

// Debounced Google Places type-ahead used by the journey form to resolve a
// place AT ENTRY TIME. As the user types it calls the searchPlaces backend
// function and shows predictions in a dropdown; on selection it calls
// resolvePlace to fetch the full record (place_id, name, address, lat, lng,
// country, IANA tz) and returns it via onSelect. Free text is always allowed:
// if Google returns nothing (or the user ignores the dropdown) the typed text
// is kept via onText and onSelect(null) so saving is never blocked.
//
// Props:
//   value      — current text (controlled)
//   onText    — (text) => void        called on every keystroke; parent clears the place
//   onSelect  — (place|null) => void  called with the resolved place on pick, or null when the user keeps typing/free text
//   placeholder, types ('airport' to restrict), className
export default function PlaceAutocomplete({ value, onText, onSelect, placeholder, types, className = '' }) {
  const [text, setText] = useState(value || '');
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(-1);
  const reqId = useRef(0);
  const wrapRef = useRef(null);
  const { toast } = useToast();
  const { t } = useI18n();
  // Suppress the debounced search for every text change that follows a
  // selection (choose sets text, the parent echoes a new controlled value
  // back, resolvePlace resolves the full name…). Without this, each of
  // those cascading text changes re-fires the 300 ms search and reopens the
  // dropdown after the user picks a place. The flag persists until the user
  // deliberately types again (handleChange), so ALL cascading changes are
  // skipped — not just the first.
  const justSelectedRef = useRef(false);

  useEffect(() => { setText(value || ''); }, [value]);

  useEffect(() => {
    if (!shouldSearch(text, justSelectedRef.current)) {
      setPredictions([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    const q = text.trim();
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('searchPlaces', { text: q, types: types || undefined });
        if (id !== reqId.current) return;
        const data = res.data || res;
        setPredictions(data.predictions || []);
        setOpen(true);
        setFocused(-1);
      } catch {
        if (id === reqId.current) { setPredictions([]); setOpen(false); }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text, types]);

  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function handleChange(e) {
    const v = e.target.value;
    justSelectedRef.current = false; // user is editing — re-enable search
    setText(v);
    onText(v);
    onSelect(null); // clear any previously resolved place; user is editing free text
  }

  async function choose(pred) {
    justSelectedRef.current = true; // suppress search for all cascading text changes
    setOpen(false);
    setPredictions([]);
    setText(pred.name);
    onText(pred.name);
    try {
      const res = await base44.functions.invoke('resolvePlace', { place_id: pred.place_id });
      const data = res.data || res;
      if (data.place) {
        setText(data.place.name || pred.name);
        onText(data.place.name || pred.name);
        onSelect(data.place);
      } else {
        toast({ title: t('placeAutocomplete.resolveFailed'), variant: 'destructive' });
        onSelect(null);
      }
    } catch {
      toast({ title: t('placeAutocomplete.resolveFailed'), variant: 'destructive' });
      onSelect(null);
    }
  }

  function onKey(e) {
    if (!open || !predictions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused((f) => Math.min(f + 1, predictions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter' && focused >= 0) { e.preventDefault(); choose(predictions[focused]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        value={text}
        onChange={handleChange}
        onKeyDown={onKey}
        onFocus={() => predictions.length && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-ink-deep/40 pointer-events-none" />}
      {open && predictions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-ink-charcoal/20 bg-card shadow-lg">
          {predictions.map((p, i) => (
            <button
              type="button"
              key={p.place_id}
              onClick={() => choose(p)}
              onMouseEnter={() => setFocused(i)}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm border-b border-ink-charcoal/8 last:border-0 ${i === focused ? 'bg-terra/10' : 'hover:bg-foreground/5'}`}
            >
              <MapPin className="w-3.5 h-3.5 text-terra-deep mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold text-ink-deep truncate">{p.name}</span>
                {p.address && <span className="block text-xs text-ink-deep/55 truncate">{p.address}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && text.trim().length >= 2 && predictions.length === 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-ink-charcoal/20 bg-card shadow-lg px-3 py-2 text-xs text-ink-deep/60 flex items-center gap-1.5">
          <CornerDownLeft className="w-3.5 h-3.5 text-ink-deep/40" />
          No matches — keep “{text.trim()}” as typed.
        </div>
      )}
    </div>
  );
}