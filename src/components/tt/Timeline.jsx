import React from 'react';
import { Calendar } from 'lucide-react';
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

// Day marker on the rail: a terra-coral calendar medallion over the line, with
// the day label + full date header to its right. `day` is a YYYY-MM-DD string
// (or 'unscheduled'); formatDayHeader parses the calendar date directly so it
// never shifts across timezones.
export function TimelineDay({ day, icon: Icon = Calendar, label }) {
  const cap = label ?? (day === 'unscheduled' ? 'Unscheduled' : 'Day');
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 flex justify-center shrink-0">
        <div className="w-10 h-10 rounded-full bg-background border-2 border-terra-coral flex items-center justify-center relative z-10">
          <Icon className="w-4 h-4 text-terra-coral" />
        </div>
      </div>
      <div>
        <p className="tt-label text-terra-coral">{cap}</p>
        <p className="font-display text-lg text-foreground">{formatDayHeader(day)}</p>
      </div>
    </div>
  );
}