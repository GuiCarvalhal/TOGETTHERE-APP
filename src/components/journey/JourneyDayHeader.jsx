import React from 'react';
import { formatDayHeader } from '@/lib/formatPlaceTime';
import { relativeDayLabel } from '@/components/tt/Timeline';

// Journey day header: no calendar medallion inside the timeline rail any more.
// The rail keeps a small terra dot as the day anchor, and the date block sits
// immediately beside it (gap-2 = the cards' own gutter, so the header text lines
// up with the card content column instead of sitting 4px further right) with the
// relative caption on top ("in 3 days") and the weekday + day/month below
// ("Friday, November 14"). Nothing overlaps the rail line.
export default function JourneyDayHeader({ day }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-12 shrink-0 flex justify-center" aria-hidden>
        <span className="w-1.5 h-1.5 rounded-full bg-terra-coral" />
      </span>
      <div className="min-w-0">
        <p className="tt-label text-terra-coral">{relativeDayLabel(day)}</p>
        <p className="font-display text-lg text-foreground truncate">{formatDayHeader(day)}</p>
      </div>
    </div>
  );
}