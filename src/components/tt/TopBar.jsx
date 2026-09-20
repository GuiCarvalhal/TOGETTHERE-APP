import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

// Slim persistent app frame above gathering content. The TOGETTHERE wordmark is
// the primary home affordance; the compact "Gatherings" pill beside it gives an
// explicit labeled back-to-list target. Sticky so content scrolls beneath it.
export default function TopBar() {
  return (
    <div className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-foreground/8 tt-safe-top">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <Link to="/" aria-label="TOGETTHERE home" className="inline-flex items-center gap-1.5 group">
          <span className="w-2 h-2 rounded-full bg-terra group-hover:scale-110 transition-transform" />
          <span className="font-display font-bold tracking-tight text-foreground text-lg leading-none">TOGETTHERE</span>
        </Link>
        <Link to="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-foreground/5 text-foreground/60 hover:text-foreground hover:bg-foreground/10 text-xs font-semibold transition-colors min-h-[36px]">
          <ChevronLeft className="w-3.5 h-3.5" />
          Gatherings
        </Link>
      </div>
    </div>
  );
}