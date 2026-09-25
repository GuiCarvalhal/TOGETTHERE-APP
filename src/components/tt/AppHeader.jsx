import React, { useState } from 'react';
import TopBar from '@/components/tt/TopBar';
import MoreMenu from '@/components/tt/MoreMenu';

// Universal header + avatar menu for top-level pages that aren't inside the
// GatheringShell (Home, Profile, How-it-works). Encapsulates the menu-open
// state and MoreMenu rendering so each page gets the identical header + menu
// without duplicating wiring. GatheringShell uses TopBar directly so the avatar
// and the bottom-bar "More" tab share one menu state.
export default function AppHeader({ gatheringId, onesignal }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <TopBar gatheringId={gatheringId} onOpenMenu={() => setMenuOpen(true)} />
      <MoreMenu open={menuOpen} onOpenChange={setMenuOpen} onesignal={onesignal} />
    </>
  );
}