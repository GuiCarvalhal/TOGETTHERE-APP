import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, Route, Receipt, Users, MoreHorizontal } from 'lucide-react';
import { canSeeExpenses, canSeeAgent } from '@/lib/gatheringHelpers';

// Fixed bottom tab bar — primary navigation for gathering pages.
// Respects safe-area-inset-bottom for the iPhone home indicator.
const TABS = [
  { key: 'agent', label: 'Agent', icon: Sparkles, path: 'agent', show: canSeeAgent },
  { key: 'journey', label: 'Journey', icon: Route, path: 'journey', show: () => true },
  { key: 'expenses', label: 'Expenses', icon: Receipt, path: 'expenses', show: canSeeExpenses },
  { key: 'members', label: 'Members', icon: Users, path: 'members', show: () => true },
];

export default function BottomTabBar({ gatheringId, role, onMore }) {
  const location = useLocation();
  const tabs = TABS.filter((t) => t.show(role));
  const isActive = (path) => location.pathname.endsWith(`/${path}`);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 tt-safe-bottom border-t border-foreground/10 bg-background/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex items-stretch justify-around">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = isActive(t.path);
          return (
            <Link
              key={t.key}
              to={`/gathering/${gatheringId}/${t.path}`}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors ${active ? 'text-terra' : 'text-foreground/55 hover:text-foreground'}`}
            >
              {active && <span className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-terra" />}
              <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
              <span className="text-[0.625rem] font-semibold tracking-tight">{t.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMore}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-foreground/55 hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[0.625rem] font-semibold tracking-tight">More</span>
        </button>
      </div>
    </nav>
  );
}