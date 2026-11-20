import React, { useEffect, useState } from 'react';
import {
  Sparkles, Plane, Navigation, CloudSun, Coffee, RefreshCw, Clock, MapPin, Info, Globe,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { useDistanceUnit } from '@/lib/distanceUnit';
import { buildBriefBullets } from '@/lib/nextBriefBullets';

// "Next / Now" AI Agent brief — ONE compact box attached to the featured
// segment above it: no title, time or place repeated, just 3–5 dense bullets.
//
// Deterministic bullets render immediately from the segment itself (times,
// schedule, straight-line distance); getNextBrief then upgrades them with live
// flight status, traffic ETA, weather and lounge. If any source fails, the
// deterministic bullets simply stay — never an error, never filler.
const ICONS = {
  status: Plane,
  ground: Navigation,
  timing: Navigation,
  arrive: MapPin,
  weather: CloudSun,
  lounge: Coffee,
  feed: RefreshCw,
  checkin: Clock,
  cutoff: Clock,
  terminal: Info,
  hint: Info,
  tz: Globe,
};

export default function NextBriefCard({ next }) {
  const { t } = useI18n();
  const { unit } = useDistanceUnit();
  const [live, setLive] = useState(null);
  const item = next?.item;
  const itemId = item?.id;
  const gatheringId = next?.gatheringId;

  useEffect(() => {
    let alive = true;
    setLive(null);
    if (!itemId || !gatheringId) return () => { alive = false; };
    // Live enrichment is the most expensive call on Home (flight status, traffic,
    // weather). It is deferred to the first idle moment: the deterministic bullets
    // are already on screen by then, so nothing waits for it.
    const fetchLive = () => base44.functions.invoke('getNextBrief', { gathering_id: gatheringId, item_id: itemId })
      .then((res) => {
        const data = res?.data;
        if (alive && data && !data.error) setLive(data);
      })
      .catch(() => {});
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(fetchLive, { timeout: 1500 })
      : window.setTimeout(fetchLive, 400);

    // A gate gets assigned or moved while the card sits on screen, so a flight is
    // re-checked every five minutes and whenever the tab comes back into view.
    const isFlight = item?.type === 'flight';
    const timer = isFlight ? window.setInterval(fetchLive, 5 * 60 * 1000) : null;
    const onVisible = () => { if (document.visibilityState === 'visible') fetchLive(); };
    if (isFlight) document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else clearTimeout(idle);
      if (timer) window.clearInterval(timer);
      if (isFlight) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [itemId, gatheringId, item?.type]);

  if (!item) return null;
  const bullets = buildBriefBullets({ item, live, unit, t });
  if (!bullets.length) return null;

  // Rendered INSIDE Home's NEXT module, under the featured card: the tips carry
  // no chrome of their own — just a hairline divider and the bullet list. The
  // band bleeds to the box edges (cancelling the box padding) so the tips sit on
  // the box's own surface, continuous with it, instead of reading as a separate
  // block floating inside the card.
  return (
    <div className="-mx-3.5 sm:-mx-4 -mb-3.5 sm:-mb-4 mt-3 rounded-b-[1.25rem] bg-card border-t border-ink-charcoal/10 px-3.5 sm:px-4 pt-3 pb-3.5 sm:pb-4 lg:mx-0 lg:mb-0 lg:rounded-xl lg:border lg:px-3 lg:py-3">
      <ul className="space-y-1.5">
        {bullets.map((bullet) => {
          const Icon = ICONS[bullet.icon] || Sparkles;
          return (
            <li key={bullet.id} className="flex items-start gap-2">
              <Icon className="w-3.5 h-3.5 mt-[3px] shrink-0 text-terra-deep" aria-hidden="true" />
              <span className="text-xs sm:text-[0.8125rem] leading-snug text-ink-deep/80 min-w-0">
                {bullet.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}