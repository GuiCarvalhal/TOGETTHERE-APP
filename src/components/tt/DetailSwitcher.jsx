import React from 'react';
import { LayoutGrid, FileText } from 'lucide-react';

// Summary/Details toggle for the Members page — replaces the Mine/Group scope
// switcher. Summary shows the compact member row (avatar, name, home city,
// role). Details adds stored Interests, Family Name and family members inline.
// Styled identically to ScopeSwitcher (same pill container, same active
// state) so the toolbar reads as a single family of controls. Always rendered
// for every role (viewers too) — the toggle controls detail level, not access.
export default function DetailSwitcher({ mode, setMode }) {
  return (
    <div className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10">
      <button
        onClick={() => setMode('summary')}
        aria-pressed={mode === 'summary'}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${mode === 'summary' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Summary
      </button>
      <button
        onClick={() => setMode('details')}
        aria-pressed={mode === 'details'}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${mode === 'details' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
      >
        <FileText className="w-3.5 h-3.5" /> Details
      </button>
    </div>
  );
}