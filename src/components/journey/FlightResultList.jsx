import React from 'react';
import { formatOffsetTime } from '@/lib/formatPlaceTime';
import { Clock, ArrowRight } from 'lucide-react';

// Selectable list of flight search results. Each row shows airline + number,
// the origin/destination IATA with airport-local times (and tz abbreviation),
// duration, and an overnight badge. Tapping a row calls onSelect(result).
export default function FlightResultList({ results, selectedId, onSelect }) {
  return (
    <div className="space-y-2">
      {results.map((r) => {
        const isSel = selectedId === r.id;
        const depT = formatOffsetTime(r.dep_local, r.dep_tz);
        const arrT = formatOffsetTime(r.arr_local, r.arr_tz);
        const dur = r.duration_min ? `${Math.floor(r.duration_min / 60)}h ${r.duration_min % 60}m` : '';
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r)}
            className={`w-full text-left rounded-xl border p-3 transition bg-card ${isSel ? 'border-terra bg-terra/8' : 'border-ink-charcoal/15 hover:bg-foreground/5'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-semibold text-sm text-ink-deep truncate">
                {r.airline_name} · {r.number}
              </span>
              {r.status && <span className="tt-stamp border-ink-charcoal/20 text-ink-deep/60">{r.status}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-sm text-ink-deep flex-wrap">
              <span className="font-semibold">{r.dep_iata}</span>
              <span className="text-ink-deep/50 text-xs">{depT}</span>
              <ArrowRight className="w-3.5 h-3.5 text-ink-deep/40 mx-0.5" />
              <span className="font-semibold">{r.arr_iata}</span>
              <span className="text-ink-deep/50 text-xs">{arrT}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-deep/55">
              {dur && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{dur}</span>}
              {r.overnight && <span className="text-terra-deep font-semibold">+{r.day_shift} day{r.day_shift > 1 ? 's' : ''}</span>}
              {r.is_codeshare && <span>codeshare</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}