import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Plane, RefreshCw, Clock } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import { formatOffsetLocal, formatOffsetTime } from '@/lib/formatPlaceTime';

const STATUS_TONE = {
  Scheduled: 'bg-ink-deep/8 text-ink-deep/70 border-ink-charcoal/15',
  Boarding: 'bg-terra/15 text-terra-deep border-terra/30',
  Departed: 'bg-terra/15 text-terra-deep border-terra/30',
  EnRoute: 'bg-terra/15 text-terra-deep border-terra/30',
  GateClosed: 'bg-terra/15 text-terra-deep border-terra/30',
  Arrived: 'bg-[#4a8b6f]/15 text-[#3f7a5e] border-[#4a8b6f]/30',
  Completed: 'bg-[#4a8b6f]/15 text-[#3f7a5e] border-[#4a8b6f]/30',
  Cancelled: 'bg-destructive/12 text-destructive border-destructive/30',
  Delayed: 'bg-amber-100 text-amber-700 border-amber-300',
  Diverted: 'bg-amber-100 text-amber-700 border-amber-300',
};

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0 || s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function FlightStatusCard({ flightNumber, date, originTimezone, destinationTimezone }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Use the saved item's stored place tz (from_place.tz / to_place.tz) to format
  // status timestamps — no secondary airport geocode/lookup. When the stored tz
  // is absent, formatOffsetLocal/Time fall back to the raw local string without
  // any network call.
  const depTz = originTimezone || null;
  const arrTz = destinationTimezone || null;

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await base44.functions.invoke('getFlightStatus', { flight_number: flightNumber, date });
      setData(res.data || res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [flightNumber, date]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="tt-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-6 w-20 ml-auto rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16" tone="cream" />
          <Skeleton className="h-16" tone="cream" />
        </div>
      </div>
    );
  }
  if (!data) return null; // graceful hide on any failure

  const tone = STATUS_TONE[data.status] || STATUS_TONE.Scheduled;
  const dep = data.departure || {};
  const arr = data.arrival || {};

  return (
    <div className="tt-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Plane className="w-4 h-4 text-terra-deep shrink-0" />
        <span className="tt-label text-ink-deep/50">Flight status</span>
        <span className={`tt-stamp ml-auto ${tone}`}>{data.status || 'Scheduled'}</span>
        <button onClick={() => load(true)} disabled={refreshing} aria-label="Refresh flight status" className="p-1.5 rounded-full text-ink-deep/50 hover:text-terra-deep hover:bg-foreground/5 shrink-0">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="tt-ink-panel p-3 min-w-0">
          <p className="font-display text-base font-bold text-ink-deep mb-0.5 truncate">{dep.iata || 'Departure'}</p>
          <p className="text-xs text-ink-deep/55 truncate">{dep.airport || dep.iata || '—'}</p>
          <p className="text-xs text-ink-deep/65 mt-1 flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />{formatOffsetLocal(dep.actual || dep.revised || dep.scheduled, depTz) || '—'}</p>
          {(dep.actual || dep.revised) && dep.scheduled && (dep.actual || dep.revised) !== dep.scheduled && <p className="text-[0.625rem] text-ink-deep/40 mt-0.5">Sched {formatOffsetTime(dep.scheduled, depTz)}</p>}
          {(dep.terminal || dep.gate) && (
            <p className="text-xs font-semibold text-ink-deep mt-1.5">{dep.terminal && `T${dep.terminal}`}{dep.terminal && dep.gate && ' · '}{dep.gate && `Gate ${dep.gate}`}</p>
          )}
        </div>
        <div className="tt-ink-panel p-3 min-w-0">
          <p className="font-display text-base font-bold text-ink-deep mb-0.5 truncate">{arr.iata || 'Arrival'}</p>
          <p className="text-xs text-ink-deep/55 truncate">{arr.airport || arr.iata || '—'}</p>
          <p className="text-xs text-ink-deep/65 mt-1 flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />{formatOffsetLocal(arr.actual || arr.revised || arr.scheduled, arrTz) || '—'}</p>
          {(arr.actual || arr.revised) && arr.scheduled && (arr.actual || arr.revised) !== arr.scheduled && <p className="text-[0.625rem] text-ink-deep/40 mt-0.5">Sched {formatOffsetTime(arr.scheduled, arrTz)}</p>}
          {(arr.terminal || arr.gate) && (
            <p className="text-xs font-semibold text-ink-deep mt-1.5">{arr.terminal && `T${arr.terminal}`}{arr.terminal && arr.gate && ' · '}{arr.gate && `Gate ${arr.gate}`}</p>
          )}
        </div>
      </div>

      {data.lastUpdatedUtc && <p className="text-[0.625rem] text-ink-deep/40 mt-2.5">Updated {timeAgo(data.lastUpdatedUtc)}</p>}
    </div>
  );
}