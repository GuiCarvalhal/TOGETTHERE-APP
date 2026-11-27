import React from 'react';
import { formatDayHeader } from '@/lib/formatPlaceTime';

// Shared vertical timeline rail used by Journey and Expenses so the two pages
// read as one product. A continuous 1px line runs down the page at left-6; each
// day is a TimelineDay marker on the rail followed by that day's rows. The
// per-row left column (icon medallion + primary value) is rendered by each
// domain's card (JourneyCard / ExpenseTimelineCard) so the rail aligns without
// a parallel implementation that would drift.
export function Timeline({ children }) {
  return (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-px bg-foreground/12" aria-hidden />
      <div className="space-y-8">{children}</div>
    </div>
  );
}

// Day marker on the rail — same treatment as the Journey day header: no icon,
// just a small terra dot as the day anchor, with the date block immediately
// beside it (gap-2 = the cards' own gutter, so the header text lines up with
// the card content column). `day` is a YYYY-MM-DD string (or 'unscheduled');
// formatDayHeader parses the calendar date directly so it never shifts across
// timezones.
// Relative day caption for the day marker: "Today", "Tomorrow", "Yesterday",
// "in 2 days", "3 days ago", etc. — replaces the generic "Day" label which
// carried no useful information. `day` is a YYYY-MM-DD string parsed as local
// midnight so it never shifts across timezones; 'unscheduled' stays as-is.
export function relativeDayLabel(day) {
  if (day === 'unscheduled') return 'Unscheduled';
  const target = new Date(`${day}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const delta = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 1) return `in ${delta} days`;
  return `${-delta} days ago`;
}

export function TimelineDay({ day, label }) {
  const cap = label ?? relativeDayLabel(day);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-12 shrink-0 flex justify-center" aria-hidden>
        <span className="w-1.5 h-1.5 rounded-full bg-terra-coral" />
      </span>
      <div className="min-w-0">
        <p className="tt-label text-terra-coral">{cap}</p>
        <p className="font-display text-lg text-foreground truncate">{formatDayHeader(day)}</p>
      </div>
    </div>
  );
}