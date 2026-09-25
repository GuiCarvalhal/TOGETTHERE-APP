import React from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { formatDateRange } from '@/lib/gatheringHelpers';

// Compact list of other gatherings both users belong to. Only rendered when
// there's at least one (caller gates on visibility).
export default function GroupsInCommon({ groups = [] }) {
  if (!groups.length) return null;
  return (
    <div className="tt-card p-5">
      <p className="tt-label text-ink-deep/40 mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Groups in common</p>
      <div className="space-y-2">
        {groups.map((g) => (
          <Link key={g.id} to={`/gathering/${g.id}/journey`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-cream-pale border border-ink-charcoal/10 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-terra/10 border border-terra/20 flex items-center justify-center shrink-0"><Users className="w-4 h-4 text-terra-deep" /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-ink-deep truncate">{g.name}</p>
              {g.start_date && <p className="text-xs text-ink-deep/50">{formatDateRange(g.start_date, g.end_date)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}