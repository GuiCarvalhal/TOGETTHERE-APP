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
  yourtime: Globe,
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
    base44.functions.invoke('getNextBrief', { gathering_id: gatheringId, item_id: itemId })
      .then((res) => {
        const data = res?.data;
        if (alive && data && !data.error) setLive(data);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [itemId, gatheringId]);

  if (!item) return null;
  const bullets = buildBriefBullets({ item, live, unit, t });
  if (!bullets.length) return null;

  // Rendered INSIDE Home's NEXT module, under the featured card: the tips carry
  // no chrome of their own — just a hairline divider and the bullet list.
  return (
    <div className="mt-3 pt-3 border-t border-ink-charcoal/10">
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