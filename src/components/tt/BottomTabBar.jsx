import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Sparkles, Route, Receipt, Users } from 'lucide-react';
import { canSeeExpenses, canSeeAgent } from '@/lib/gatheringHelpers';

// Floating translucent dock — primary navigation for gathering pages.
// Centered above the safe-area bottom inset; rounded pill, backdrop blur,
// subtle border/shadow. Active tab gets a terracotta-tinted pill highlight.
const TABS = [
  { key: 'home', label: 'Home', icon: Home, to: '/', show: () => true },
  { key: 'agent', label: 'Agent', icon: Sparkles, path: 'agent', show: canSeeAgent },
  { key: 'journey', label: 'Journey', icon: Route, path: 'journey', show: () => true },
  { key: 'expenses', label: 'Expenses', icon: Receipt, path: 'expenses', show: canSeeExpenses },
  { key: 'members', label: 'Members', icon: Users, path: 'members', show: () => true },
];

export default function BottomTabBar({ gatheringId, role }) {
  const location = useLocation();
  const tabs = TABS.filter((t) => t.show(role));
  // Active section = the 3rd path segment of /gathering/:id/:section (and
  // /gathering/:id/journey/:itemId), so the Journey tab stays highlighted on
  // a segment's detail route without false-matching ids that contain the word.
  const section = location.pathname.split('/').filter(Boolean)[2];
  const isActive = (path) => section === path;

  return (
    <nav
      aria-label="Gathering sections"
      className="fixed inset-x-0 z-40 flex justify-center bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]"
    >
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-background/70 backdrop-blur-xl border border-foreground/10 shadow-[0_8px_30px_rgba(0,0,0,0.18)] w-[90vw] max-w-md">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = isActive(t.path);
          return (
            <Link
              key={t.key}
              to={t.to || `/gathering/${gatheringId}/${t.path}`}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] rounded-full transition-colors ${active ? 'text-terra' : 'text-foreground/55 hover:text-foreground'}`}
            >
              {active && <span className="absolute inset-0 rounded-full bg-terra/15" />}
              <Icon className="w-5 h-5 relative z-10" strokeWidth={active ? 2.4 : 2} />
              <span className="text-[0.625rem] font-semibold tracking-tight relative z-10 whitespace-nowrap">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}