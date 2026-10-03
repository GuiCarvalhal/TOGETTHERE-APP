import React from 'react';
import { User, Users, HeartHandshake } from 'lucide-react';
import { useOptionalGathering } from '@/lib/gatheringContext';

// Shared Mine/Group scope switcher used by every toolbar page (Journey,
// Expenses, Members, Agent). Extracted from PageToolbar so the Agent page can
// compose it into its own sticky bar without duplicating the pill markup.
//
// For viewers, the "Mine" option becomes "Close" — the close-friends
// membership scope (members the viewer marked Close), since viewers don't
// participate in items/expenses themselves. The scope value stays 'mine' so
// per-page filtering logic is unchanged; only the label and the filter
// semantics differ (handled in each page).
export default function ScopeSwitcher({ scope, setScope }) {
  const gctx = useOptionalGathering() || {};
  const isViewer = gctx.role === 'viewer';
  const mineLabel = isViewer ? 'Close' : 'Mine';
  const MineIcon = isViewer ? HeartHandshake : User;

  return (
    <div className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10">
      <button
        onClick={() => setScope('mine')}
        aria-pressed={scope === 'mine'}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${scope === 'mine' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
      >
        <MineIcon className="w-3.5 h-3.5" /> {mineLabel}
      </button>
      <button
        onClick={() => setScope('group')}
        aria-pressed={scope === 'group'}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${scope === 'group' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
      >
        <Users className="w-3.5 h-3.5" /> Group
      </button>
    </div>
  );
}