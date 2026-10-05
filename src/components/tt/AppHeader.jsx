import React from 'react';
import TopBar from '@/components/tt/TopBar';

// Universal header for top-level pages that aren't inside the GatheringShell
// (Home, Account, How-it-works). The avatar opens the canonical Account page
// (a full page, not a drawer), so there's no per-page menu state to manage —
// each page just renders the shared TopBar. GatheringShell renders TopBar
// directly for the same reason.
export default function AppHeader({ gatheringId }) {
  return <TopBar gatheringId={gatheringId} />;
}