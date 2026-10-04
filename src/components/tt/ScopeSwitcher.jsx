import React from 'react';
import { User, Users } from 'lucide-react';
import { useOptionalGathering } from '@/lib/gatheringContext';

// Shared Mine/Group scope switcher used by every toolbar page (Journey,
// Expenses, Members, Agent). Extracted from PageToolbar so the Agent page can
// compose it into its own sticky bar without duplicating the pill markup.
//
// Viewers get Group view only — no participation scope selector — since the
// Close/Casual friendship model has been retired and viewers don't own/attend
// items themselves. Returning null keeps the toolbar layout (the right-side
// actions stay flush right) without rendering a dangling toggle.
export default function ScopeSwitcher({ scope, setScope }) {
  const gctx = useOptionalGathering() || {};
  const isViewer = gctx.role === 'viewer';
  if (isViewer) return null;

  return (
    <div className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10">
      <button
        onClick={() => setScope('mine')}
        aria-pressed={scope === 'mine'}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${scope === 'mine' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
      >
        <User className="w-3.5 h-3.5" /> Mine
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