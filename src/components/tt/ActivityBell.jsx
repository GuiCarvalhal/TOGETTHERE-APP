import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, Receipt, Route, UserPlus, UserCheck, Heart, Settings as SettingsIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { timeAgo } from '@/lib/gatheringHelpers';
import usePolling from '@/hooks/usePolling';

const TYPE_ICON = {
  expense_added: Receipt,
  journey_added: Route,
  join_requested: UserPlus,
  join_approved: UserCheck,
  relationship_close: Heart,
  member_added: UserPlus,
  gathering_updated: SettingsIcon,
};
const TYPE_TONE = {
  expense_added: 'bg-terra/10 text-terra-deep',
  journey_added: 'bg-terra/10 text-terra-coral',
  join_requested: 'bg-ink/5 text-ink-deep/60',
  join_approved: 'bg-[#4a8b6f]/15 text-[#3f7a5e]',
  relationship_close: 'bg-terra/10 text-terra-deep',
  member_added: 'bg-ink/5 text-ink-deep/60',
  gathering_updated: 'bg-ink/5 text-ink-deep/60',
};

export default function ActivityBell({ gatheringId }) {
  const [activities, setActivities] = useState([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem(`tt-act-seen-${gatheringId}`) || 0));

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('getActivity', { gathering_id: gatheringId });
      const data = res.data || res;
      setActivities(data.activities || []);
    } catch { /* ignore */ }
  }, [gatheringId]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 25000);

  useEffect(() => {
    if (open) {
      load();
      const now = Date.now();
      setLastSeen(now);
      localStorage.setItem(`tt-act-seen-${gatheringId}`, String(now));
    }
  }, [open, gatheringId, load]);

  const unseen = activities.filter((a) => new Date(a.created_date).getTime() > lastSeen).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative w-11 h-11 rounded-full flex items-center justify-center text-cream/80 hover:text-cream hover:bg-white/5 transition-colors" aria-label="Recent activity">
          <Bell className="w-5 h-5" />
          {unseen > 0 && <span className="absolute top-2 right-2.5 w-2.5 h-2.5 rounded-full bg-terra ring-2 ring-ink" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 rounded-[1.25rem] border border-ink-charcoal/15 bg-popover text-popover-foreground tt-shadow-float">
        <div className="px-4 pt-4 pb-2 border-b border-ink-charcoal/10">
          <p className="font-display text-lg font-bold text-ink-deep">Recent activity</p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {activities.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-deep/50">No activity yet. Add an expense, segment, or invite someone to get the feed going.</p>
          ) : (
            activities.map((a) => {
              const Icon = TYPE_ICON[a.type] || Bell;
              return (
                <div key={a.id} className="flex items-start gap-3 px-4 py-3 border-b border-ink-charcoal/5 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${TYPE_TONE[a.type] || 'bg-ink/5 text-ink-deep/60'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-deep leading-snug">{a.summary}</p>
                    <p className="text-xs text-ink-deep/40 mt-0.5">{timeAgo(a.created_date)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}