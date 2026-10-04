import React from 'react';
import { Plane, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { journeyMeta, formatTimeAbbrAlpha3, formatDuration } from '@/lib/formatPlaceTime';
import { useItemStartTz, useItemStartCountry, useItemEndTz, useItemEndCountry } from '@/lib/useItemPlace';
import { alpha2ToAlpha3 } from '@/lib/isoCountries';

// Compact flight header card for the flight detail page. Faithfully reuses
// the same data and formatters as the Journey flight card: meta line (flight
// number · airline · duration), route (city (IATA) → city (IATA)), and
// scheduled times with DST-aware abbreviation + ISO alpha-3 country. Stored
// metadata only — no render-time API calls (isFlight=true on all place hooks).
export default function FlightDetailHeader({ item }) {
  const { t } = useI18n();
  const startTz = useItemStartTz(item, true);
  const endTz = useItemEndTz(item, true);
  const startCc = useItemStartCountry(item, true);
  const endCc = useItemEndCountry(item, true);

  const meta = journeyMeta(item);
  const flightDur = (item.start_datetime && item.end_datetime) ? formatDuration(item.start_datetime, item.end_datetime) : '';
  const metaLine = [meta, flightDur && `${flightDur} ${t('flightEditor.duration')}`].filter(Boolean).join(' · ');

  const fromCity = item.from_place?.city || item.from_place?.name || item.location_from || '';
  const toCity = item.to_place?.city || item.to_place?.name || item.location_to || '';
  const fromIata = item.from_place?.iata || '';
  const toIata = item.to_place?.iata || '';
  const fromLabel = fromCity ? (fromIata ? `${fromCity} (${fromIata})` : fromCity) : (fromIata ? `(${fromIata})` : '');
  const toLabel = toCity ? (toIata ? `${toCity} (${toIata})` : toCity) : (toIata ? `(${toIata})` : '');

  const startCc3 = item.from_place?.country_alpha3 || alpha2ToAlpha3(item.from_place?.country) || startCc;
  const endCc3 = item.to_place?.country_alpha3 || alpha2ToAlpha3(item.to_place?.country) || endCc;
  const startFull = item.start_datetime ? formatTimeAbbrAlpha3(item.start_datetime, startTz, startCc3) : '';
  const endFull = item.end_datetime ? formatTimeAbbrAlpha3(item.end_datetime, endTz, endCc3) : '';

  return (
    <div className="tt-card p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-sky-100 text-sky-700 border border-sky-200">
          <Plane className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          {metaLine && <p className="text-[0.6875rem] text-ink-deep/50 truncate">{metaLine}</p>}
          <h1 className="font-display text-lg font-bold text-ink-deep leading-tight mt-0.5">
            {fromLabel && toLabel ? (
              <span className="block">{fromLabel}<span className="px-2 text-ink-deep/40">→</span>{toLabel}</span>
            ) : (
              <span className="block">{item.title}</span>
            )}
          </h1>
          {(startFull || endFull) && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-ink-deep/55 flex-wrap">
              {startFull && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{startFull}</span>}
              {endFull && <><span className="opacity-50">→</span><span>{endFull}</span></>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}