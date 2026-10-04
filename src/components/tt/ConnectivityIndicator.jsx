import React from 'react';
import { useConnectivity } from '@/lib/useConnectivity';
import { CloudOff, Wifi } from 'lucide-react';

// Discreet connectivity indicator for the TopBar. Shows a small dot when online
// (nearly invisible) and an amber "Offline" pill when offline. The offline pill
// links to /offline.html so the user discovers the saved-items feature.
export default function ConnectivityIndicator() {
  const { offline } = useConnectivity();
  if (!offline) return null;
  return (
    <a
      href="/offline.html"
      aria-label="Offline — view saved items (read-only)"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-terra/15 text-terra-deep text-[0.6875rem] font-semibold border border-terra/20 hover:bg-terra/25 transition-colors"
    >
      <CloudOff className="w-3.5 h-3.5" />
      <span>Offline</span>
    </a>
  );
}