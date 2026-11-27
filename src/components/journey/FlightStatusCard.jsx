import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Plane, RefreshCw, Clock } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import { useI18n } from '@/lib/i18n';
import { formatOffsetLocal, formatOffsetTime } from '@/lib/formatPlaceTime';
import { flightStatusKey, FLIGHT_STATUS_TONE, OPERATIONAL_STATUSES } from '@/lib/flightStatusLabel';
import {
  chipKey, fieldConfidence, freshness, trackingPhase,
} from '@/lib/flightTracking';

// Provider local strings look like "2026-11-26 23:15-03:00".
function providerMs(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(' ', 'T').replace(/(\d{2}:\d{2})([+-]\d{2}:\d{2})$/, '$1:00$2');
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

function timeAgo(iso, t) {
  if (!iso) return '';
  // The provider stamps look like "2026-11-27 02:26Z" — the space makes Safari
  // parse it as an invalid date, which printed "há NaN min".
  const ms = Date.parse(String(iso).replace(' ', 'T'));
  if (Number.isNaN(ms)) return '';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 0 || s < 45) return t('flightStatus.justNow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('flightStatus.mAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('flightStatus.hAgo', { count: h });
  return t('flightStatus.dAgo', { count: Math.floor(h / 24) });
}

export default function FlightStatusCard({ flightNumber, date, departureAt, originTimezone, destinationTimezone, originCountry, destinationCountry }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Use the saved item's stored place tz (from_place.tz / to_place.tz) to format
  // status timestamps — no secondary airport geocode/lookup. When the stored tz
  // is absent, formatOffsetLocal/Time fall back to the raw local string without
  // any network call.
  const depTz = originTimezone || null;
  const arrTz = destinationTimezone || null;

  // The function owns the refresh cadence (6h, or every load inside the 4h
  // departure window), so opening this card costs nothing until the window
  // allows it. The refresh button is the only thing that forces a call.
  const load = useCallback(async (silent, force) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await base44.functions.invoke('getFlightStatus', {
        flight_number: flightNumber,
        date,
        departure_at: departureAt || '',
        origin_timezone: originTimezone || '',
        force: force === true,
      });
      setData(res.data || res);
    } catch {
      setData({ found: false });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [flightNumber, date, departureAt, originTimezone]);

  useEffect(() => { load(false, false); }, [load]);

  if (loading) {
    return (
      <div className="tt-card-hairline p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-6 w-20 ml-auto rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Skeleton className="h-16" tone="cream" />
          <Skeleton className="h-16" tone="cream" />
        </div>
      </div>
    );
  }

  const refreshButton = (
    <button onClick={() => load(true, true)} disabled={refreshing} aria-label={t('flightStatus.refresh')} className="p-1.5 rounded-full text-ink-deep/50 hover:text-terra-deep hover:bg-foreground/5 shrink-0">
      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
    </button>
  );

  // The feed has no flight for this number/date (or did not answer). Say so —
  // hiding the card made a rate-limited lookup look like a flight with no
  // details at all.
  if (!data?.found) {
    return (
      <div className="tt-card-hairline p-4">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-terra-deep shrink-0" />
          <span className="tt-label text-ink-deep/50">{t('flightStatus.flightStatus')}</span>
          <span className="ml-auto">{refreshButton}</span>
        </div>
        <p className="text-sm text-ink-deep/65 mt-2">{t('flightStatus.unavailable')}</p>
        <p className="text-[0.6875rem] text-ink-deep/40 mt-1">{t('flightStatus.unavailableHint')}</p>
      </div>
    );
  }

  const dep = data.departure || {};
  const arr = data.arrival || {};
  const statusKey = flightStatusKey(data.status);
  const tone = FLIGHT_STATUS_TONE[statusKey] || FLIGHT_STATUS_TONE.scheduled;
  const chip = chipKey(statusKey);
  // The feed's own stamp drives the trust wording and the footer age.
  const updatedMs = Date.parse(String(data.lastUpdatedUtc || '').replace(' ', 'T'));
  const feedFreshness = freshness({ updatedMs });
  const gateConf = fieldConfidence({
    hasValue: !!(dep.gate || dep.terminal), live: data.live !== false, updatedMs, nowMs: Date.now(),
  });
  // Tracking is emphasised from T-6h until 2h after landing; outside it the
  // card keeps its regular view.
  const phase = trackingPhase({
    startMs: providerMs(dep.actual || dep.revised || dep.scheduled) ?? Date.parse(departureAt || ''),
    endMs: providerMs(arr.actual || arr.revised || arr.scheduled) ?? NaN,
  });
  // The provider only holds the schedule for some airports (GRU answers
  // "Expected" with no gate even for a flight that already left), so its status
  // word is not live data. Printing it as a live stamp is what made a departed
  // flight read "Scheduled".
  const notLive = data.live === false;
  const moving = OPERATIONAL_STATUSES.includes(statusKey);
  // The feed can still say "Expected" long after the scheduled departure — some
  // airports never push the departure movement. Past the scheduled time with no
  // actual or revised departure, the honest label is that the airline has not
  // updated it, not "Scheduled".
  const noUpdate = !notLive && statusKey === 'scheduled'
    && (providerMs(dep.actual || dep.revised || dep.scheduled) ?? Infinity) < Date.now() - 20 * 60000;

  return (
    <div className="tt-card-hairline p-4">
      <div className="flex items-center gap-2 mb-3">
        <Plane className="w-4 h-4 text-terra-deep shrink-0" />
        <span className="tt-label text-ink-deep/50">{t('flightStatus.flightStatus')}</span>
        {notLive ? (
          <span className="tt-stamp ml-auto bg-ink-deep/8 text-ink-deep/60 border-ink-charcoal/15">{t('flightStatus.notLive')}</span>
        ) : noUpdate ? (
          <span className="tt-stamp ml-auto bg-ink-deep/8 text-ink-deep/60 border-ink-charcoal/15">{t('flightStatus.noUpdate')}</span>
        ) : (
          <>
            {(chip || statusKey) && (
              <span className={`tt-stamp ml-auto ${tone}`}>
                {chip ? t(`flightStatus.chip.${chip}`) : t(`flightStatus.status.${statusKey}`)}
              </span>
            )}
            {!chip && !statusKey && <span className="ml-auto" />}
          </>
        )}
        {refreshButton}
      </div>

      {/* Origin and destination stack full width: side by side on a phone the two
          panels clipped the airport name, the scheduled-vs-actual time and the
          terminal/gate line. Same tokens and surfaces, one column. */}
      <div className="grid grid-cols-1 gap-3">
        <div className="tt-ink-panel p-3 min-w-0">
          <p className="font-display text-base font-bold text-ink-deep mb-0.5 truncate">{dep.iata || t('flightStatus.departure')}</p>
          <p className="text-xs text-ink-deep/55">{dep.airport || dep.iata || '—'}</p>
          <p className="text-xs text-ink-deep/65 mt-1 flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />{formatOffsetLocal(dep.actual || dep.revised || dep.scheduled, depTz, originCountry) || '—'}</p>
          {(dep.actual || dep.revised) && dep.scheduled && (dep.actual || dep.revised) !== dep.scheduled && <p className="text-[0.625rem] text-ink-deep/40 mt-0.5">{t('flightStatus.sched', { time: formatOffsetTime(dep.scheduled, depTz, originCountry) })}</p>}
          {(dep.terminal || dep.gate) && (
            <p className="text-xs font-semibold text-ink-deep mt-1.5">{dep.terminal && t('flightStatus.terminal', { terminal: dep.terminal })}{dep.terminal && dep.gate && ' · '}{dep.gate && t('flightStatus.gate', { gate: dep.gate })}{!dep.gate && !moving && <>{dep.terminal && ' · '}<span className="font-normal text-ink-deep/50">{t('flightStatus.gateNotPublished')}</span></>}{gateConf !== 'none' && <span className="font-normal text-ink-deep/45"> · {t(`flightStatus.confidence.${gateConf}`)}</span>}</p>
          )}
        </div>
        <div className="tt-ink-panel p-3 min-w-0">
          <p className="font-display text-base font-bold text-ink-deep mb-0.5 truncate">{arr.iata || t('flightStatus.arrival')}</p>
          <p className="text-xs text-ink-deep/55">{arr.airport || arr.iata || '—'}</p>
          <p className="text-xs text-ink-deep/65 mt-1 flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" /><span className="text-ink-deep/45">{t('flightStatus.eta')}</span>{formatOffsetLocal(arr.actual || arr.revised || arr.scheduled, arrTz, destinationCountry) || '—'}</p>
          {(arr.actual || arr.revised) && arr.scheduled && (arr.actual || arr.revised) !== arr.scheduled && <p className="text-[0.625rem] text-ink-deep/40 mt-0.5">{t('flightStatus.sched', { time: formatOffsetTime(arr.scheduled, arrTz, destinationCountry) })}</p>}
          {(arr.terminal || arr.gate) && (
            <p className="text-xs font-semibold text-ink-deep mt-1.5">{arr.terminal && t('flightStatus.terminal', { terminal: arr.terminal })}{arr.terminal && arr.gate && ' · '}{arr.gate && t('flightStatus.gate', { gate: arr.gate })}</p>
          )}
        </div>
      </div>

      {notLive && <p className="text-[0.6875rem] text-ink-deep/45 mt-2.5">{t('flightStatus.notLiveHint')}</p>}
      {noUpdate && <p className="text-[0.6875rem] text-ink-deep/45 mt-2.5">{t('flightStatus.noUpdateHint')}</p>}
      {!notLive && !noUpdate && data.lastUpdatedUtc && (
        <p className="text-[0.625rem] text-ink-deep/40 mt-2.5">
          {phase === 'active' && <>{t('flightStatus.liveTracking')} · </>}
          {t('flightStatus.updated', { time: timeAgo(data.lastUpdatedUtc, t) })}
          {feedFreshness.level === 'stale' && <> · {t('flightStatus.confidence.unverified')}</>}
        </p>
      )}
    </div>
  );
}