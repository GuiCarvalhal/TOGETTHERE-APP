import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Route, Receipt, Users, Settings } from 'lucide-react';
import { canSeeExpenses, canSeeAgent, canManageGathering } from '@/lib/gatheringHelpers';

const ALL_TABS = [
  { key: 'agent', label: 'Agent', icon: Sparkles, path: 'agent', show: canSeeAgent },
  { key: 'journey', label: 'Journey', icon: Route, path: 'journey', show: () => true },
  { key: 'expenses', label: 'Expenses', icon: Receipt, path: 'expenses', show: canSeeExpenses },
  { key: 'members', label: 'Members', icon: Users, path: 'members', show: () => true },
  { key: 'settings', label: 'Settings', icon: Settings, path: 'settings', show: canManageGathering },
];

export default function PillSwitcher({ gatheringId, role }) {
  const location = useLocation();
  const tabs = ALL_TABS.filter((t) => t.show(role));
  const activeKey = tabs.find((t) => location.pathname.endsWith(`/${t.path}`))?.key || tabs[0].key;

  return (
    <div className="tt-glass rounded-full p-1.5 inline-flex items-center gap-1 shadow-[0_8px_30px_rgba(0,0,0,0.35)] max-w-full overflow-x-auto tt-no-scrollbar">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = activeKey === t.key;
        return (
          <Link
            key={t.key}
            to={`/gathering/${gatheringId}/${t.path}`}
            className={`relative shrink-0 px-3.5 sm:px-5 py-2.5 rounded-full flex items-center gap-2 text-sm font-semibold transition-colors duration-200 ${
              isActive ? 'text-cream' : 'text-cream/65 hover:text-cream'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="tt-active-pill"
                className="absolute inset-0 rounded-full bg-terra"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <Icon className="relative w-4 h-4" />
            <span className="relative hidden sm:inline tracking-tight">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}